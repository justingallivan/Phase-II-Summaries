/**
 * API Route: /api/admin/models
 *
 * Admin endpoint for managing per-app Claude model overrides.
 * Protected: superuser role required (or auth bypassed in dev mode).
 *
 * GET  — Returns apps with effective model config, available models from Anthropic API
 * PUT  — Set or clear a model override for an app
 */

import { requireAuthWithProfile, isAuthRequired } from '../../../lib/utils/auth';
import { sql } from '@vercel/postgres';
import { BASE_CONFIG, clearModelOverridesCache } from '../../../shared/config/baseConfig';

// Valid model types that can be overridden
const VALID_MODEL_TYPES = ['model', 'visionModel', 'fallback'];

// Cache available models from Anthropic API (1-hour TTL)
let _availableModels = null;
let _availableModelsLoadedAt = 0;
const AVAILABLE_MODELS_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchAvailableModels() {
  if (_availableModels && Date.now() - _availableModelsLoadedAt < AVAILABLE_MODELS_TTL_MS) {
    return _availableModels;
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });

    if (!resp.ok) {
      console.error('Failed to fetch models from Anthropic:', resp.status, await resp.text());
      return _availableModels || [];
    }

    const data = await resp.json();
    const models = (data.data || [])
      .filter(m => m.id.startsWith('claude-'))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .map(m => ({
        id: m.id,
        display_name: m.display_name || m.id,
        created_at: m.created_at,
      }));

    _availableModels = models;
    _availableModelsLoadedAt = Date.now();
    return models;
  } catch (err) {
    console.error('Error fetching Anthropic models:', err.message);
    return _availableModels || [];
  }
}

async function getRole(profileId) {
  try {
    const result = await sql`
      SELECT role FROM dynamics_user_roles
      WHERE user_profile_id = ${profileId}
    `;
    return result.rows[0]?.role || 'read_only';
  } catch {
    return 'read_only';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let profileId;

  if (!isAuthRequired()) {
    // Dev mode — skip auth, use fallback profile ID
    profileId = 0;
  } else {
    profileId = await requireAuthWithProfile(req, res);
    if (profileId === null) return;

    const role = await getRole(profileId);
    if (role !== 'superuser') {
      return res.status(403).json({ error: 'Admin access required' });
    }
  }

  if (req.method === 'GET') {
    return handleGet(req, res);
  }
  if (req.method === 'PUT') {
    return handlePut(req, res, profileId);
  }
}

async function handleGet(req, res) {
  try {
    // Fetch DB overrides, available models, and env overrides in parallel
    const [dbResult, availableModels] = await Promise.all([
      sql`SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'model_override:%'`,
      fetchAvailableModels(),
    ]);

    // Build a map of DB overrides: { "concept-evaluator:model": "claude-..." }
    const dbOverrides = {};
    for (const row of dbResult.rows) {
      const suffix = row.setting_key.replace('model_override:', '');
      dbOverrides[suffix] = row.setting_value;
    }

    // Build apps array from APP_MODELS config
    const apps = Object.entries(BASE_CONFIG.APP_MODELS).map(([appKey, config]) => {
      const result = { appKey, models: {} };

      for (const modelType of VALID_MODEL_TYPES) {
        const hardcoded = config[modelType] || null;
        const envKey = `CLAUDE_MODEL_${appKey.toUpperCase().replace(/-/g, '_')}`;
        const envOverride = modelType === 'model' ? (process.env[envKey] || null) : null;
        const dbOverride = dbOverrides[`${appKey}:${modelType}`] || null;

        // Determine effective model and its source
        let effective, source;
        if (dbOverride) {
          effective = dbOverride;
          source = 'db';
        } else if (envOverride) {
          effective = envOverride;
          source = 'env';
        } else if (hardcoded) {
          effective = hardcoded;
          source = 'hardcoded';
        } else {
          effective = BASE_CONFIG.CLAUDE.DEFAULT_MODEL;
          source = 'default';
        }

        result.models[modelType] = {
          effective,
          source,
          dbOverride,
          envOverride,
          hardcoded,
        };
      }

      return result;
    });

    return res.json({
      apps,
      availableModels,
      defaultModel: BASE_CONFIG.CLAUDE.DEFAULT_MODEL,
    });
  } catch (error) {
    console.error('Admin models GET error:', error);
    return res.status(500).json({ error: 'Failed to fetch model configuration' });
  }
}

async function handlePut(req, res, profileId) {
  try {
    const { appKey, modelType, modelId } = req.body;

    // Validate appKey
    if (!BASE_CONFIG.APP_MODELS[appKey]) {
      return res.status(400).json({ error: `Invalid app key: ${appKey}` });
    }

    // Validate modelType
    if (!VALID_MODEL_TYPES.includes(modelType)) {
      return res.status(400).json({ error: `Invalid model type: ${modelType}. Must be one of: ${VALID_MODEL_TYPES.join(', ')}` });
    }

    const settingKey = `model_override:${appKey}:${modelType}`;
    // Use null for updated_by if profileId is 0 (dev mode) to avoid FK violation
    const updatedBy = profileId === 0 ? null : profileId;

    if (modelId === null || modelId === undefined || modelId === '') {
      // Delete the override — revert to env/hardcoded default
      await sql`DELETE FROM system_settings WHERE setting_key = ${settingKey}`;
    } else {
      // Upsert the override
      await sql`
        INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
        VALUES (${settingKey}, ${modelId}, ${updatedBy}, NOW())
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = ${modelId}, updated_by = ${updatedBy}, updated_at = NOW()
      `;
    }

    // Clear the in-memory cache so the next API request picks up the change
    clearModelOverridesCache();

    return res.json({ success: true, settingKey, modelId: modelId || null });
  } catch (error) {
    console.error('Admin models PUT error:', error);
    return res.status(500).json({ error: 'Failed to update model override' });
  }
}
