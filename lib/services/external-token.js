/**
 * External access token primitive.
 *
 * HMAC-signed JWTs that authenticate external parties (initially: invited
 * reviewers) to our backend for proposal download + review upload, without
 * needing AzureAD accounts. Verification has two layers:
 *
 *   1. Cryptographic + temporal — handled here: signature valid against
 *      EXTERNAL_LINK_SECRET, expiry not yet reached, algorithm pinned to
 *      HS256. Output is `{ valid, payload?, reason? }`.
 *
 *   2. Authorization-state — handled by the caller after this function
 *      returns valid: SHA-256 of the presented token must match
 *      `wmkf_externaltokenhash` on the suggestion row, and
 *      `wmkf_externaltokenrevoked` must be false. The hash check is what
 *      lets a single token be revoked or replaced without rotating the
 *      global secret.
 *
 * The secret is read from `process.env.EXTERNAL_LINK_SECRET` (32+ chars).
 * Kept distinct from `NEXTAUTH_SECRET` so blast radius is bounded.
 */

import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { createHash, randomBytes } from 'crypto';

const ALG = 'HS256';
const MIN_SECRET_LEN = 32;

function getSecret() {
  const s = process.env.EXTERNAL_LINK_SECRET;
  if (!s) {
    throw new Error('EXTERNAL_LINK_SECRET is not set');
  }
  if (s.length < MIN_SECRET_LEN) {
    throw new Error(`EXTERNAL_LINK_SECRET must be at least ${MIN_SECRET_LEN} chars`);
  }
  return new TextEncoder().encode(s);
}

/**
 * Mint a new token for a suggestion.
 *
 * @param {Object} args
 * @param {string} args.suggestionId - GUID of the wmkf_appreviewersuggestion row
 * @param {string} args.requestId - GUID of the akoya_request the review is for
 * @param {string[]} args.ops - Operations granted; e.g. ['download_proposal','upload_review']
 * @param {Date} args.expiresAt - Hard expiry (review due date + grace)
 * @returns {Promise<{ jwt: string, jti: string, hash: string }>}
 *   `jwt` is the URL-embeddable token, `jti` is the unique id (for audit logs),
 *   `hash` is the SHA-256 of the JWT (store on the suggestion row).
 */
export async function mintToken({ suggestionId, requestId, ops, expiresAt }) {
  if (!suggestionId || typeof suggestionId !== 'string') {
    throw new Error('mintToken: suggestionId required');
  }
  if (!requestId || typeof requestId !== 'string') {
    throw new Error('mintToken: requestId required');
  }
  if (!Array.isArray(ops) || ops.length === 0) {
    throw new Error('mintToken: ops must be a non-empty array');
  }
  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    throw new Error('mintToken: expiresAt must be a valid Date');
  }
  if (expiresAt.getTime() <= Date.now()) {
    throw new Error('mintToken: expiresAt must be in the future');
  }

  const jti = randomBytes(16).toString('hex');
  const expSeconds = Math.floor(expiresAt.getTime() / 1000);

  const jwt = await new SignJWT({ sub: suggestionId, req: requestId, ops })
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(expSeconds)
    .setJti(jti)
    .sign(getSecret());

  return { jwt, jti, hash: hashToken(jwt) };
}

/**
 * Verify a token's signature and expiry. Does NOT check revocation or
 * suggestion-row state — the caller does that with `hashToken(jwt)`.
 *
 * @param {string} jwt
 * @returns {Promise<{ valid: true, payload: { suggestionId, requestId, ops, jti, iat, exp } }
 *                  | { valid: false, reason: 'no_token'|'expired'|'invalid_signature'|'invalid_claim'|'malformed' }>}
 */
export async function verifyToken(jwt) {
  if (typeof jwt !== 'string' || !jwt) {
    return { valid: false, reason: 'no_token' };
  }
  try {
    const { payload } = await jwtVerify(jwt, getSecret(), {
      algorithms: [ALG],
    });
    return {
      valid: true,
      payload: {
        suggestionId: payload.sub,
        requestId: payload.req,
        ops: payload.ops,
        jti: payload.jti,
        iat: payload.iat,
        exp: payload.exp,
      },
    };
  } catch (e) {
    let reason = 'malformed';
    if (e instanceof joseErrors.JWTExpired) reason = 'expired';
    else if (e instanceof joseErrors.JWSSignatureVerificationFailed) reason = 'invalid_signature';
    else if (e instanceof joseErrors.JWTClaimValidationFailed) reason = 'invalid_claim';
    else if (e instanceof joseErrors.JOSEAlgNotAllowed) reason = 'invalid_signature';
    return { valid: false, reason };
  }
}

/**
 * SHA-256 hex digest of a JWT. Stored on the suggestion row at mint time;
 * compared at verify time so a leaked or replaced token can be invalidated
 * without rotating the global secret.
 *
 * @param {string} jwt
 * @returns {string} 64-char hex digest
 */
export function hashToken(jwt) {
  if (typeof jwt !== 'string' || !jwt) {
    throw new Error('hashToken: jwt required');
  }
  return createHash('sha256').update(jwt).digest('hex');
}
