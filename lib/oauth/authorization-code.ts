import crypto from "node:crypto";

export const AUTHORIZATION_CODE_LIFETIME_MS = 5 * 60 * 1000;

export type ProofKeyMethod = "S256";

export interface AuthorizationCodeRecord {
  codeHash: string;
  clientId: string;
  redirectUri: string;
  userId: string;
  scopes: string[];
  expiresAt: Date;
  codeChallenge: string;
  codeChallengeMethod: ProofKeyMethod;
  used: boolean;
}

export interface AuthorizationCodeExchangeMatch {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: ProofKeyMethod;
  now: Date;
}

export interface AuthorizationCodeStore {
  save(record: AuthorizationCodeRecord): Promise<void>;
  consume(
    codeHash: string,
    matches: AuthorizationCodeExchangeMatch,
  ): Promise<ConsumeAuthorizationCodeResult>;
}

export type AuthorizationCodeFailure =
  | "invalid_code"
  | "expired_code"
  | "reused_code"
  | "mismatched_code";

export type ConsumeAuthorizationCodeResult =
  | { ok: true; record: AuthorizationCodeRecord }
  | { ok: false; error: AuthorizationCodeFailure };

export interface CredentialOutcome {
  accessToken: string;
  tokenType: "bearer";
  expiresIn: number;
  refreshToken?: string;
  scope: string;
}

export interface CredentialContext {
  clientId: string;
  userId: string;
  scopes: string[];
}

export interface AuthorizationCodeIssuerDependencies {
  store: AuthorizationCodeStore;
  now?: () => Date;
  generateCode?: () => string;
}

export interface AuthorizationCodeExchangerDependencies {
  store: AuthorizationCodeStore;
  now?: () => Date;
  issueCredentials(context: CredentialContext): Promise<CredentialOutcome>;
}

export interface IssueAuthorizationCode {
  clientId: string;
  redirectUri: string;
  userId: string;
  scopes: string[];
  codeChallenge: string;
  codeChallengeMethod: ProofKeyMethod;
}

export interface ExchangeAuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}

export type ExchangeResult =
  | { ok: true; credentials: CredentialOutcome }
  | { ok: false; error: AuthorizationCodeFailure };

function sha256(value: string, encoding: "hex" | "base64url"): string {
  return crypto.createHash("sha256").update(value).digest(encoding);
}

export function createAuthorizationCodeLifecycle({
  store,
  now = () => new Date(),
  generateCode = () => crypto.randomBytes(32).toString("hex"),
  issueCredentials,
}: AuthorizationCodeIssuerDependencies & AuthorizationCodeExchangerDependencies) {
  return {
    ...createAuthorizationCodeIssuer({ store, now, generateCode }),
    ...createAuthorizationCodeExchanger({ store, now, issueCredentials }),
  };
}

export function createAuthorizationCodeIssuer({
  store,
  now = () => new Date(),
  generateCode = () => crypto.randomBytes(32).toString("hex"),
}: AuthorizationCodeIssuerDependencies) {
  return {
    async issue(input: IssueAuthorizationCode) {
      const code = generateCode();
      const expiresAt = new Date(now().getTime() + AUTHORIZATION_CODE_LIFETIME_MS);

      await store.save({
        codeHash: sha256(code, "hex"),
        ...input,
        scopes: [...input.scopes],
        expiresAt,
        used: false,
      });

      return { code, expiresAt };
    },
  };
}

export function createAuthorizationCodeExchanger({
  store,
  now = () => new Date(),
  issueCredentials,
}: AuthorizationCodeExchangerDependencies) {
  return {
    async exchange(input: ExchangeAuthorizationCode): Promise<ExchangeResult> {
      const codeHash = sha256(input.code, "hex");
      const consumed = await store.consume(codeHash, {
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        codeChallenge: sha256(input.codeVerifier, "base64url"),
        codeChallengeMethod: "S256",
        now: now(),
      });

      if (!consumed.ok) {
        return consumed;
      }

      const credentials = await issueCredentials({
        clientId: consumed.record.clientId,
        userId: consumed.record.userId,
        scopes: [...consumed.record.scopes],
      });
      return { ok: true, credentials };
    },
  };
}
