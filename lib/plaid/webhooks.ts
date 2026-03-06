import { createHash } from "crypto";
import {
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
} from "jose";
import type { PlaidApi } from "plaid";
import { log } from "@/lib/logger";

/**
 * Verifies a Plaid webhook by validating the JWT/ES256 signature
 * and comparing the SHA-256 hash of the request body.
 *
 * Fail-closed: returns false on any error during verification.
 * No sensitive data (tokens, keys) is logged.
 *
 * @param body - The raw request body as a string
 * @param plaidVerificationHeader - The Plaid-Verification header value (JWT)
 * @param plaidClient - Plaid API client instance for fetching verification keys
 * @returns true if the webhook is verified, false otherwise
 */
export async function verifyPlaidWebhook(
  body: string,
  plaidVerificationHeader: string,
  plaidClient: PlaidApi
): Promise<boolean> {
  try {
    // Step 0: Reject missing/empty header
    if (!plaidVerificationHeader || !plaidVerificationHeader.trim()) {
      return false;
    }

    // Step 1: Decode JWT protected header without verifying — extract kid and alg
    const header = decodeProtectedHeader(plaidVerificationHeader);

    // Step 2: Reject if alg !== 'ES256'
    if (header.alg !== "ES256") {
      return false;
    }

    const kid = header.kid;
    if (!kid) {
      return false;
    }

    // Step 3: Fetch JWK from Plaid using kid
    const keyResponse = await plaidClient.webhookVerificationKeyGet({
      key_id: kid,
    });
    const jwk = keyResponse.data.key;

    // Step 4: Import JWK using jose
    const key = await importJWK(jwk, "ES256");

    // Step 5: Verify JWT signature with maxTokenAge: '5 min' (rejects iat > 5 min ago)
    const { payload } = await jwtVerify(plaidVerificationHeader, key, {
      maxTokenAge: "5 min",
    });

    // Step 6: Compute SHA-256 hash of body string
    const bodyHash = createHash("sha256").update(body).digest("hex");

    // Step 7: Compare hash to payload.request_body_sha256 claim
    const claimedHash = payload.request_body_sha256 as string | undefined;
    if (!claimedHash || claimedHash !== bodyHash) {
      return false;
    }

    // Step 8: All checks passed
    return true;
  } catch (error) {
    // Fail closed: any error during verification returns false
    log.error("Plaid webhook verification error", error);
    return false;
  }
}
