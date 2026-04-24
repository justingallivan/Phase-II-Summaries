/**
 * Server-only loader for model-override settings.
 *
 * Extracted from shared/config/baseConfig.js so that client-adjacent pages
 * (e.g. pages/reviewer-finder.js) that import BASE_CONFIG don't transitively
 * pull the settings-service → dataverse chain into the browser bundle.
 *
 * API route pattern stays unchanged: call loadModelOverrides() near the top
 * of the handler. This populates the cache in baseConfig.js (via setCache)
 * so the existing synchronous getModelForApp/getFallbackModelForApp still
 * works from anywhere.
 */

const { listSettings } = require('./settings-service');
const {
  _setOverridesCache,
  _shouldReloadOverrides,
  clearModelOverridesCache,
} = require('../../shared/config/baseConfig');

async function loadModelOverrides() {
  if (!_shouldReloadOverrides()) return;
  try {
    const overrides = await listSettings('model_override:');
    const map = new Map();
    for (const [key, value] of Object.entries(overrides)) {
      const suffix = key.replace('model_override:', '');
      map.set(suffix, value);
    }
    _setOverridesCache(map);
  } catch (err) {
    console.error('loadModelOverrides: failed to load overrides:', err.message);
  }
}

module.exports = { loadModelOverrides, clearModelOverridesCache };
