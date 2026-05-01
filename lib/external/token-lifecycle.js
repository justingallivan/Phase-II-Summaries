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
