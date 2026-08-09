/**
 * Canonical observation port emitted by the live public-client journey.
 *
 * Profile-owned configuration and version snapshots deliberately do not cross
 * this boundary. Each deterministic profile records those inputs through its
 * own profile surface while sharing this journey fact contract.
 */

export type PublicClientFamily = "ipv4" | "ipv6";

type JsonPrimitive = string | number | boolean | null;
export type PublicClientJsonValue =
  | JsonPrimitive
  | readonly PublicClientJsonValue[]
  | { readonly [key: string]: PublicClientJsonValue };

export interface PublicClientResponseSurface {
  readonly complete: boolean;
  readonly status?: number;
  readonly body?: PublicClientJsonValue;
  readonly headers?: { readonly [key: string]: PublicClientJsonValue };
  readonly location?: string;
  readonly browserUrl?: string;
  readonly callbackUrl?: string;
}

export interface PublicClientRequestInput {
  readonly method: string;
  readonly url: string;
  readonly bodyFields?: readonly string[];
  readonly authorizationHeaderPresent?: boolean;
  readonly requestClientId?: string;
  readonly requestGrantType?: string;
  readonly requestRedirectUri?: string;
  readonly requestResource?: string;
  readonly requestCodeChallengeMethod?: string;
  readonly requestCodeChallengePresent?: boolean;
  readonly requestCodePresent?: boolean;
  readonly requestCodeVerifierPresent?: boolean;
  readonly requestCodeVerifierHash?: string;
  readonly status?: number;
  readonly response?: PublicClientResponseSurface;
}

export interface PublicClientDiscoveryObservation {
  readonly response?: PublicClientResponseSurface;
  readonly advertisedResource?: string;
  readonly advertisedAuthorizationServer?: string;
  readonly issuer?: string;
  readonly authorizationEndpoint?: string;
  readonly registrationEndpoint?: string;
  readonly tokenEndpoint?: string;
  readonly jwksUri?: string;
  readonly grantTypesSupported?: readonly string[];
  readonly responseTypesSupported?: readonly string[];
  readonly tokenEndpointAuthMethodsSupported?: readonly string[];
  readonly codeChallengeMethodsSupported?: readonly string[];
}

export interface PublicClientConsentObservation {
  readonly clientNameVisible?: boolean;
  readonly clientUriVisible?: boolean;
  readonly logoVisible?: boolean;
  readonly softwareIdVisible?: boolean;
  readonly softwareVersionVisible?: boolean;
  readonly untrustedDisclaimerVisible?: boolean;
  readonly endorsementText?: string;
  readonly endorsementLanguageVisible?: boolean;
}

export interface PublicClientApprovalObservation {
  readonly affirmativeControlVisible?: boolean;
  readonly denialControlVisible?: boolean;
  readonly callbackBeforeDecision?: boolean;
  readonly decision?: "affirmative" | "denial" | "abandonment";
}

export interface PublicClientAuthorizationOutcomeObservation {
  readonly callbackComplete?: boolean;
  readonly callbackReceived?: boolean;
  readonly callbackUrl?: string;
  readonly browserUrl?: string;
  readonly expectedState?: string;
  readonly callbackState?: string;
  readonly authorizationError?: boolean;
  readonly tokenRequestObserved?: boolean;
  readonly tokenResponse?: PublicClientResponseSurface;
}

export interface PublicClientLoopbackObservation {
  readonly registeredRedirectUri: string;
  readonly callbackUrl?: string;
  readonly callbackReceived?: boolean;
  readonly requestCallbackUrl?: string;
  readonly requestResource?: string;
  readonly portSelectedAtRequest?: boolean;
}

export interface PublicClientPkceObservation {
  readonly verifier?: string;
  readonly challenge?: string;
  readonly method?: string;
  readonly requestResource?: string;
  readonly authorizationRequest?: PublicClientRequestInput;
}

export interface PublicClientCleanupObservation {
  readonly listRequestObserved?: boolean;
  readonly remainingClientIds?: readonly string[];
  readonly remainingGrantIds?: readonly string[];
  readonly grantPresent?: boolean;
  readonly requestStatus?: number;
  readonly request?: PublicClientRequestInput;
  readonly response?: PublicClientResponseSurface;
}

export interface PublicClientDelegatedTokenObservation {
  readonly token?: string;
  readonly jwks?: string | PublicClientJsonValue;
}

export interface PublicClientMcpSdkObservation {
  readonly connected?: boolean;
  readonly listToolsCompleted?: boolean;
  readonly listToolsObserved?: boolean;
  readonly callToolCompleted?: boolean;
  readonly callToolObserved?: boolean;
  readonly resultIsError?: boolean;
  readonly toolName?: string;
}

export interface PublicClientMcpOperationObservation {
  readonly operationUrl?: string;
  readonly operationResource?: string;
  readonly connected?: boolean;
  readonly listToolsCompleted?: boolean;
  readonly callToolCompleted?: boolean;
  readonly resultIsError?: boolean;
  readonly sdk?: PublicClientMcpSdkObservation;
  readonly response?: PublicClientResponseSurface;
  readonly request?: PublicClientRequestInput;
}

export interface PublicClientGrantObservation {
  readonly listRequestObserved?: boolean;
  readonly grantListObserved?: boolean;
  readonly listResponse?: PublicClientResponseSurface;
  readonly listResponseStatus?: number;
  readonly listedClientIds?: readonly string[];
  readonly listedGrantIds?: readonly string[];
  readonly grantId?: string;
  readonly grantClientId?: string;
  readonly clientId?: string;
  readonly grantPresent?: boolean;
  readonly revokeRequestObserved?: boolean;
  readonly revokeObserved?: boolean;
  readonly revokeResponse?: PublicClientResponseSurface;
  readonly revokeResponseStatus?: number;
  readonly request?: PublicClientRequestInput;
}

export type PublicClientNegativeRegistrationCase =
  | "unsupported-client-auth-method"
  | "unsupported-grant-type"
  | "unsupported-response-type"
  | "malformed-metadata"
  | "unsafe-redirect-metadata";

export type PublicClientJourneyFact =
  | {
      readonly kind: "resource-discovery";
      readonly role: "primary";
      readonly response?: PublicClientResponseSurface;
      readonly advertisedResource?: string;
      readonly advertisedAuthorizationServer?: string;
      readonly observation?: PublicClientDiscoveryObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "provider-discovery";
      readonly role: "primary";
      readonly response?: PublicClientResponseSurface;
      readonly issuer?: string;
      readonly authorizationEndpoint?: string;
      readonly registrationEndpoint?: string;
      readonly tokenEndpoint?: string;
      readonly jwksUri?: string;
      readonly grantTypesSupported?: readonly string[];
      readonly responseTypesSupported?: readonly string[];
      readonly tokenEndpointAuthMethodsSupported?: readonly string[];
      readonly codeChallengeMethodsSupported?: readonly string[];
      readonly observation?: PublicClientDiscoveryObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "registration";
      readonly role: "primary" | "negative";
      readonly family: PublicClientFamily;
      readonly caseId?: PublicClientNegativeRegistrationCase;
      readonly response?: PublicClientResponseSurface;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "consent";
      readonly role: "metadata";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientConsentObservation;
    }
  | {
      readonly kind: "authorization";
      readonly role: "approval" | "denial" | "abandonment";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientApprovalObservation | PublicClientAuthorizationOutcomeObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "loopback";
      readonly role: "callback" | "request";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientLoopbackObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "pkce";
      readonly role: "exchange";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientPkceObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "delegated-token";
      readonly role: "validation";
      readonly family: PublicClientFamily;
      readonly token?: string;
      readonly jwks?: string | PublicClientJsonValue;
      readonly observation?: PublicClientDelegatedTokenObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "mcp-operation";
      readonly role: "authenticated";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientMcpOperationObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "grant";
      readonly role: "cleanup";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientGrantObservation;
      readonly request?: PublicClientRequestInput;
    }
  | {
      readonly kind: "cleanup";
      readonly role: "family";
      readonly family: PublicClientFamily;
      readonly observation?: PublicClientCleanupObservation;
    };
