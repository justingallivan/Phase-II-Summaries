/**
 * Thin wrapper over the system-settings storage backend.
 *
 * Dispatches between Postgres (current) and Dataverse (migration target)
 * based on WAVE1_BACKEND_SETTINGS. Default: postgres.
 *
 * Consolidates the raw SQL formerly scattered across:
 *   shared/config/baseConfig.js                — loadModelOverrides (prefix scan)
 *   lib/services/maintenance-service.js        — retention config read
 *   pages/api/admin/models.js                  — admin model-override CRUD
 *   pages/api/admin/secrets.js                 — secret-rotation CRUD (needs updatedAt)
 *   pages/api/cron/secret-check.js             — secret-check cron (prefix scan)
 *
 * Surface:
 *   getSetting(key)                            → string | null
 *   listSettings(prefix)                       → { [key]: value }
 *   listSettingsWithMeta(prefix)               → { [key]: { value, updatedAt } }
 *   setSetting(key, value, updatedByProfileId) → bool
 *   deleteSetting(key)                         → bool (idempotent)
 */

const { sql } = require('@vercel/postgres');

// Load the Dataverse service via a require() whose path is built from a
// variable so the bundler can't statically trace it. This keeps the
// fs/path-using Dataverse client out of client bundles when settings-service
// is reached from client-adjacent code like shared/config/baseConfig.js.
// These dispatch helpers only ever run server-side.
let _dataverse;
function getDataverse() {
  if (_dataverse) return _dataverse;
  const modName = './dataverse-settings-service';
  // eslint-disable-next-line global-require, import/no-dynamic-require
  _dataverse = require(modName);
  return _dataverse;
}
function useDataverse() {
  return process.env.WAVE1_BACKEND_SETTINGS === 'dataverse';
}

async function getSetting(key) {
  if (useDataverse()) return getDataverse().getSetting(key);
  const r = await sql`
    SELECT setting_value FROM system_settings WHERE setting_key = ${key}
  `;
  return r.rows[0]?.setting_value ?? null;
}

async function listSettings(keyPrefix = '') {
  if (useDataverse()) return getDataverse().listSettings(keyPrefix);
  const r = keyPrefix
    ? await sql`
        SELECT setting_key, setting_value FROM system_settings
        WHERE setting_key LIKE ${keyPrefix + '%'}
      `
    : await sql`SELECT setting_key, setting_value FROM system_settings`;
  const out = {};
  for (const row of r.rows) out[row.setting_key] = row.setting_value;
  return out;
}

async function listSettingsWithMeta(keyPrefix = '') {
  if (useDataverse()) return getDataverse().listSettingsWithMeta(keyPrefix);
  const r = keyPrefix
    ? await sql`
        SELECT setting_key, setting_value, updated_at FROM system_settings
        WHERE setting_key LIKE ${keyPrefix + '%'}
      `
    : await sql`SELECT setting_key, setting_value, updated_at FROM system_settings`;
  const out = {};
  for (const row of r.rows) {
    out[row.setting_key] = { value: row.setting_value, updatedAt: row.updated_at };
  }
  return out;
}

async function setSetting(key, value, updatedByProfileId = null) {
  if (useDataverse()) return getDataverse().setSetting(key, value, updatedByProfileId);
  try {
    await sql`
      INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
      VALUES (${key}, ${value}, ${updatedByProfileId}, NOW())
      ON CONFLICT (setting_key)
      DO UPDATE SET
        setting_value = ${value},
        updated_by = ${updatedByProfileId},
        updated_at = NOW()
    `;
    return true;
  } catch (error) {
    console.error('[settings] setSetting error:', error.message);
    return false;
  }
}

async function deleteSetting(key) {
  if (useDataverse()) return getDataverse().deleteSetting(key);
  try {
    await sql`DELETE FROM system_settings WHERE setting_key = ${key}`;
    return true;
  } catch (error) {
    console.error('[settings] deleteSetting error:', error.message);
    return false;
  }
}

module.exports = {
  getSetting,
  listSettings,
  listSettingsWithMeta,
  setSetting,
  deleteSetting,
};
