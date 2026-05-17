/**
 * Dataverse Power Tools — Track B — stateless preview→run confirm token.
 *
 * The build-plan §5 confirm gate: `/run` may only execute a QuerySpec the
 * user already saw previewed. Serverless has NO shared state between the
 * /preview and /run invocations (build plan §5/§12 explicitly rejects an
 * in-memory handoff), so the gate must be a self-contained, unforgeable,
 * short-lived token that BINDS the exact validated spec.
 *
 * HS256 (jose), mirroring lib/services/external-token.js. Signed with
 * NEXTAUTH_SECRET — an INTERNAL staff-session secret (kept distinct from
 * EXTERNAL_LINK_SECRET, whose blast radius is the external-reviewer surface;
 * reusing that here would widen it). The token carries the full validated
 * spec so /run re-validates and executes EXACTLY what was previewed — not a
 * spec hash the client could pair with a different body.
 */

import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';

const ALG = 'HS256';
const TYP = 'dvx-preview'; // pinned claim — a NextAuth session JWT can't pass
const TTL_SECONDS = 3600; // ≈1h, matches the build-plan Blob-URL TTL framing

function getSecret() {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('NEXTAUTH_SECRET missing/too short — cannot sign the '
      + 'Dataverse-export confirm token');
  }
  return new TextEncoder().encode(s);
}

/**
 * Mint a confirm token binding a VALIDATED spec to the previewed result.
 * @param {object} spec  a QuerySpec that already passed validateQuerySpec
 * @param {object} [meta] small preview facts surfaced back at /run for audit
 *   (trueTotal, estBytes) — advisory only, never re-trusted for execution.
 * @returns {Promise<{ token, expiresInSec }>}
 */
async function mintResultToken(spec, meta = {}) {
  const token = await new SignJWT({ typ: TYP, spec, meta })
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + TTL_SECONDS)
    .sign(getSecret());
  return { token, expiresInSec: TTL_SECONDS };
}

/**
 * Verify + unwrap a confirm token.
 * @returns {{ valid:true, spec, meta } | { valid:false, reason }}
 *   reason ∈ no_token | expired | invalid_signature | wrong_type | malformed
 */
async function verifyResultToken(token) {
  if (typeof token !== 'string' || !token) {
    return { valid: false, reason: 'no_token' };
  }
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    if (payload.typ !== TYP || payload.spec == null) {
      return { valid: false, reason: 'wrong_type' };
    }
    return { valid: true, spec: payload.spec, meta: payload.meta || {} };
  } catch (e) {
    let reason = 'malformed';
    if (e instanceof joseErrors.JWTExpired) reason = 'expired';
    else if (e instanceof joseErrors.JWSSignatureVerificationFailed) reason = 'invalid_signature';
    else if (e instanceof joseErrors.JOSEAlgNotAllowed) reason = 'invalid_signature';
    return { valid: false, reason };
  }
}

export { mintResultToken, verifyResultToken, TTL_SECONDS };
