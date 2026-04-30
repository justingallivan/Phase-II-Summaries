/**
 * Program Director resolver: bridges authenticated user → Dynamics systemuser.
 *
 * The authenticated user's azure email (from NextAuth session / user_profiles)
 * maps to a Dynamics `systemuser.systemuserid`. That GUID is the value we
 * filter on for `wmkf_programdirector` to find "my proposals" — see
 * memory `project_akoya_request_pd_fields.md` for why ownerid is the wrong
 * field.
 *
 * Cached per-process for 10 minutes; misses are also cached briefly to avoid
 * thrashing on user emails that aren't in Dynamics yet.
 */

import { DynamicsService } from './dynamics-service';

const CACHE_TTL_MS = 10 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 1000;

const cache = new Map(); // email (lowercased) → { systemuserid, fullName, expiresAt }

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  return email.trim().toLowerCase();
}

/**
 * Resolve an azure email to a Dynamics systemuser.
 * Returns { systemuserid, fullName } or null if no match.
 *
 * Caller is responsible for calling DynamicsService.bypassRestrictions()
 * if needed; this resolver does not bypass on its own.
 */
export async function resolveByEmail(email) {
  const key = normalizeEmail(email);
  if (!key) return null;

  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const escaped = key.replace(/'/g, "''");
  const { records } = await DynamicsService.queryRecords('systemusers', {
    select: 'systemuserid,fullname,internalemailaddress,isdisabled',
    filter: `internalemailaddress eq '${escaped}' and isdisabled eq false`,
    top: 1,
  });

  const value = records.length > 0
    ? { systemuserid: records[0].systemuserid, fullName: records[0].fullname }
    : null;

  cache.set(key, {
    value,
    expiresAt: now + (value ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
  });

  return value;
}

export function clearResolverCache() {
  cache.clear();
}
