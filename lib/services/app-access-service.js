/**
 * Thin wrapper over the user-app-access storage backend.
 *
 * Dispatches between Postgres (current) and Dataverse (migration target)
 * based on WAVE1_BACKEND_APP_ACCESS. Default: postgres.
 *
 * Consolidates the raw SQL formerly scattered across:
 *   lib/utils/auth.js             — listAppKeysForUser on the hot path
 *   pages/api/app-access.js       — admin CRUD + per-user GET
 *   pages/api/auth/[...nextauth]  — grantApps on first login (default grants)
 *
 * Surface kept minimal and matched to real call sites:
 *   listAppKeysForUser(profileId)                      → string[]
 *   listAllGrantsForAdmin()                            → [{ user_profile_id, user_name, azure_email, apps }]
 *   grantApps(profileId, appKeys, grantedByProfileId)  → { granted: string[], error? }
 *   revokeApps(profileId, appKeys)                     → { revoked: string[], error? }
 */

const { sql } = require('@vercel/postgres');

// Loaded via a variable-path require so the bundler can't statically trace
// it — keeps the Dataverse client out of client bundles when this wrapper
// is reached from client-adjacent code. Server-side only.
let _dataverse;
function getDataverse() {
  if (_dataverse) return _dataverse;
  const modName = './dataverse-app-access-service';
  // eslint-disable-next-line global-require, import/no-dynamic-require
  _dataverse = require(modName);
  return _dataverse;
}
function useDataverse() {
  return process.env.WAVE1_BACKEND_APP_ACCESS === 'dataverse';
}

async function listAppKeysForUser(profileId) {
  if (useDataverse()) return getDataverse().listAppKeysForUser(profileId);
  const r = await sql`
    SELECT app_key FROM user_app_access
    WHERE user_profile_id = ${profileId}
    ORDER BY app_key
  `;
  return r.rows.map((row) => row.app_key);
}

async function listAllGrantsForAdmin() {
  if (useDataverse()) return getDataverse().listAllGrantsForAdmin();
  const r = await sql`
    SELECT
      p.id AS user_profile_id,
      p.name AS user_name,
      p.azure_email,
      COALESCE(
        array_agg(a.app_key ORDER BY a.app_key) FILTER (WHERE a.app_key IS NOT NULL),
        '{}'
      ) AS apps
    FROM user_profiles p
    LEFT JOIN user_app_access a ON p.id = a.user_profile_id
    WHERE p.is_active = true
    GROUP BY p.id, p.name, p.azure_email
    ORDER BY p.name
  `;
  return r.rows.map((row) => ({ ...row, apps: row.apps || [] }));
}

async function grantApps(profileId, appKeys, grantedByProfileId) {
  if (useDataverse()) {
    return getDataverse().grantApps(profileId, appKeys, grantedByProfileId);
  }
  const granted = [];
  for (const appKey of appKeys) {
    const r = await sql`
      INSERT INTO user_app_access (user_profile_id, app_key, granted_by)
      VALUES (${profileId}, ${appKey}, ${grantedByProfileId})
      ON CONFLICT (user_profile_id, app_key) DO NOTHING
      RETURNING app_key
    `;
    if (r.rows.length > 0) granted.push(appKey);
  }
  return { granted };
}

async function revokeApps(profileId, appKeys) {
  if (useDataverse()) return getDataverse().revokeApps(profileId, appKeys);
  const revoked = [];
  for (const appKey of appKeys) {
    const r = await sql`
      DELETE FROM user_app_access
      WHERE user_profile_id = ${profileId} AND app_key = ${appKey}
      RETURNING app_key
    `;
    if (r.rows.length > 0) revoked.push(appKey);
  }
  return { revoked };
}

module.exports = {
  listAppKeysForUser,
  listAllGrantsForAdmin,
  grantApps,
  revokeApps,
};
