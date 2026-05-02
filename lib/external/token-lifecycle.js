/**
 * Token lifecycle operations on a wmkf_appreviewersuggestion row.
 *
 * Two callers:
 *   - The staff "regenerate token" endpoint, when an outstanding link is
 *     lost, leaked, or revoked and needs replacement.
 *   - The Phase 6 mint-at-accept trigger, when a reviewer flips to accepted.
 *
 * Both want the same atomic step: produce a new JWT, persist its hash and
 * issued/expires timestamps, clear any prior revocation. Centralizing it
 * here keeps the two paths from drifting on what fields get touched.
 */

import { mintToken } from '../services/external-token';
import { DynamicsService } from '../services/dynamics-service';
import { bypassDynamicsRestrictions } from '../services/dynamics-context';

const ENTITY_SET = 'wmkf_appreviewersuggestions';
const DEFAULT_OPS = ['download_proposal', 'upload_review'];
const DEFAULT_TTL_DAYS = 90;

/**
 * Mint a fresh token for a suggestion and persist its hash on the row.
 *
 * Writing a new hash silently invalidates any prior token: the verifier
 * compares the presented JWT's SHA-256 against the stored value, so a
 * leaked old link starts failing the moment the new hash lands. We also
 * clear `wmkf_externaltokenrevoked` so a previously-revoked suggestion can
 * be reactivated by minting a replacement.
 *
 * @param {Object} args
 * @param {string} args.suggestionId
 * @param {string} args.requestId
 * @param {Date} args.expiresAt
 * @param {string[]} [args.ops] - Defaults to ['download_proposal','upload_review']
 * @returns {Promise<{ jwt: string, jti: string, hash: string, expiresAt: Date, url: string }>}
 *   `url` is the public landing URL with the JWT embedded; ready to drop
 *   into an email body.
 */
export async function mintAndStore({ suggestionId, requestId, expiresAt, ops = DEFAULT_OPS }) {
  if (!suggestionId) throw new Error('mintAndStore: suggestionId required');
  if (!requestId) throw new Error('mintAndStore: requestId required');
  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    throw new Error('mintAndStore: expiresAt must be a valid Date');
  }

  const { jwt, jti, hash } = await mintToken({ suggestionId, requestId, ops, expiresAt });

  await bypassDynamicsRestrictions('external-token-mint', () =>
    DynamicsService.updateRecord(ENTITY_SET, suggestionId, {
      wmkf_externaltokenhash: hash,
      wmkf_externaltokenissued: new Date().toISOString(),
      wmkf_externaltokenexpires: expiresAt.toISOString(),
      wmkf_externaltokenrevoked: false,
    }),
  );

  return { jwt, jti, hash, expiresAt, url: buildExternalUrl(jwt) };
}

/**
 * Mark a suggestion's token revoked. The hash is left in place so logs and
 * audits can still identify which token was active at revocation time.
 *
 * @param {string} suggestionId
 */
export async function revoke(suggestionId) {
  if (!suggestionId) throw new Error('revoke: suggestionId required');
  await bypassDynamicsRestrictions('external-token-revoke', () =>
    DynamicsService.updateRecord(ENTITY_SET, suggestionId, {
      wmkf_externaltokenrevoked: true,
    }),
  );
}

/**
 * Ensure a usable token exists for a suggestion, minting one if not.
 * "Usable" = hash present, not revoked, not expired. Idempotent — calling
 * this on a row with an active token is a no-op (no Dataverse write, no
 * URL churn). Re-mints when the prior token was revoked (e.g. suggestion
 * was previously declined and is being re-accepted) or expired.
 *
 * Used by the accept-flip hook in `/api/reviewer-finder/my-candidates`
 * and intended for any future auto-mint trigger (PowerAutomate flow,
 * cron job, etc.). Returns whether a mint actually happened, mostly for
 * logs / tests.
 *
 * @param {string} suggestionId
 * @param {{ expiresAt?: Date, ttlDays?: number }} [opts]
 * @returns {Promise<{ minted: boolean, reason?: string }>}
 */
export async function ensureToken(suggestionId, opts = {}) {
  if (!suggestionId) throw new Error('ensureToken: suggestionId required');

  const sug = await bypassDynamicsRestrictions('ensure-token-read', () =>
    DynamicsService.getRecord(ENTITY_SET, suggestionId, {
      select: 'wmkf_appreviewersuggestionid,wmkf_externaltokenhash,wmkf_externaltokenrevoked,wmkf_externaltokenexpires,_wmkf_request_value',
    }),
  );
  if (!sug) return { minted: false, reason: 'not_found' };

  const requestId = sug._wmkf_request_value;
  if (!requestId) return { minted: false, reason: 'no_request' };

  const hasHash = !!sug.wmkf_externaltokenhash;
  const revoked = sug.wmkf_externaltokenrevoked === true;
  const expiresAt = sug.wmkf_externaltokenexpires
    ? new Date(sug.wmkf_externaltokenexpires).getTime()
    : null;
  const expired = expiresAt !== null && expiresAt <= Date.now();

  if (hasHash && !revoked && !expired) {
    return { minted: false, reason: 'already_active' };
  }

  const ttlDays = opts.ttlDays ?? DEFAULT_TTL_DAYS;
  const expires = opts.expiresAt instanceof Date
    ? opts.expiresAt
    : new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  await mintAndStore({ suggestionId, requestId, expiresAt: expires });
  return { minted: true };
}

/**
 * Build the public landing-page URL for a minted JWT.
 *
 * Reads NEXTAUTH_URL as the canonical base — same source the rest of the
 * app uses for email links and CSRF origin checks. Falls back to a relative
 * path so dev environments without NEXTAUTH_URL set still produce something
 * usable (the reviewer email always wants an absolute URL though, so prod
 * misconfig will surface fast).
 */
export function buildExternalUrl(jwt) {
  const base = (process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
  return `${base}/external/review/${jwt}`;
}
