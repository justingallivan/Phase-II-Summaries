/**
 * PromptResolver — experimental service for fetching Claude prompt templates
 * from Dynamics ahead of the real `wmkf_prompt_template` table.
 *
 * For the Session 103 experiment, prompts are stored on a scratch row of the
 * `wmkf_ai_run` table:
 *   GUID a03f77d9-913a-f111-88b5-000d3a3065b8
 *   wmkf_ai_notes      → system prompt (plain text)
 *   wmkf_ai_rawoutput  → user prompt template (plain text with {{var}} slots)
 *
 * When the real table ships, swap `_fetchFromDynamics()` to read from there
 * without changing the rest of the codebase.
 *
 * Template variable syntax: {{var_name}} (double braces).
 * Undefined variables are left in place so failures are visible in output.
 */

import { DynamicsService } from './dynamics-service.js';

const SCRATCH_RECORD = {
  entitySet: 'wmkf_ai_runs',
  guid: 'a03f77d9-913a-f111-88b5-000d3a3065b8',
  systemField: 'wmkf_ai_notes',
  userField: 'wmkf_ai_rawoutput',
};

// Only one app is wired to this resolver during the experiment.
const APP_ROUTING = {
  'phase-i-dynamics-v2': SCRATCH_RECORD,
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // appKey → { fetchedAt, prompt }

export class PromptResolver {
  /**
   * Fetch a prompt template for the given appKey.
   * @param {string} appKey
   * @returns {Promise<{systemPrompt: string, userPromptTemplate: string, source: 'dynamics'|'cache', fetchedAt: number, recordGuid: string}>}
   */
  static async getPrompt(appKey) {
    const routing = APP_ROUTING[appKey];
    if (!routing) {
      throw new Error(`PromptResolver: no Dynamics routing configured for app "${appKey}"`);
    }

    const cached = cache.get(appKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { ...cached.prompt, source: 'cache', fetchedAt: cached.fetchedAt };
    }

    const prompt = await this._fetchFromDynamics(routing);
    const fetchedAt = Date.now();
    cache.set(appKey, { fetchedAt, prompt });
    return { ...prompt, source: 'dynamics', fetchedAt };
  }

  static invalidate(appKey) {
    if (appKey) cache.delete(appKey);
    else cache.clear();
  }

  static async _fetchFromDynamics({ entitySet, guid, systemField, userField }) {
    DynamicsService.setRestrictions([], 'prompt-resolver');
    const rec = await DynamicsService.getRecord(entitySet, guid, {
      select: `${systemField},${userField}`,
    });

    const systemPrompt = (rec?.[systemField] || '').trim();
    const userPromptTemplate = (rec?.[userField] || '').trim();

    if (!systemPrompt || !userPromptTemplate) {
      throw new Error(
        `PromptResolver: empty prompt fields on ${entitySet}(${guid}) — ` +
        `${systemField} has ${systemPrompt.length} chars, ${userField} has ${userPromptTemplate.length} chars`
      );
    }

    return {
      systemPrompt,
      userPromptTemplate,
      recordGuid: guid,
    };
  }

  /**
   * Substitute {{var}} slots in a template. Undefined slots are left unchanged
   * (visible in output) rather than silently blanked, so missing vars surface
   * as bugs instead of hiding.
   */
  static interpolate(template, vars = {}) {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
      if (Object.prototype.hasOwnProperty.call(vars, name)) {
        return String(vars[name]);
      }
      return match;
    });
  }
}
