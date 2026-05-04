/**
 * Tests for the Virtual Review Panel provider allowlist.
 *
 * This is the gate that decides which AI vendors VRP is permitted to send
 * proposal text to. A regression here could silently broaden vendor exposure
 * (e.g. adding PERPLEXITY_API_KEY for some unrelated purpose suddenly making
 * Perplexity an available reviewer in VRP).
 *
 * @jest-environment node
 */

import { resolveAllowedProviders } from '../../lib/utils/vrp-providers.js';

describe('resolveAllowedProviders', () => {
  let originalEnv;
  beforeEach(() => {
    originalEnv = process.env.VRP_ALLOWED_PROVIDERS;
    delete process.env.VRP_ALLOWED_PROVIDERS;
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.VRP_ALLOWED_PROVIDERS;
    else process.env.VRP_ALLOWED_PROVIDERS = originalEnv;
  });

  test('returns the available set unchanged when env is unset', () => {
    expect(resolveAllowedProviders(['claude', 'openai', 'gemini', 'perplexity']))
      .toEqual(['claude', 'openai', 'gemini', 'perplexity']);
  });

  test('intersects available with the env allowlist', () => {
    process.env.VRP_ALLOWED_PROVIDERS = 'claude,openai';
    expect(resolveAllowedProviders(['claude', 'openai', 'gemini', 'perplexity']))
      .toEqual(['claude', 'openai']);
  });

  test('drops env entries not in available (allowlist cannot grant a missing key)', () => {
    process.env.VRP_ALLOWED_PROVIDERS = 'claude,openai,perplexity';
    expect(resolveAllowedProviders(['claude', 'openai']))
      .toEqual(['claude', 'openai']);
  });

  test('drops unknown provider names in the env list', () => {
    process.env.VRP_ALLOWED_PROVIDERS = 'claude,grok,openai';
    expect(resolveAllowedProviders(['claude', 'openai']))
      .toEqual(['claude', 'openai']);
  });

  test('case-insensitive on env values', () => {
    process.env.VRP_ALLOWED_PROVIDERS = 'Claude, OpenAI ';
    expect(resolveAllowedProviders(['claude', 'openai', 'gemini']))
      .toEqual(['claude', 'openai']);
  });

  test('empty env value narrows to nothing (explicit lockdown)', () => {
    process.env.VRP_ALLOWED_PROVIDERS = '   ';
    expect(resolveAllowedProviders(['claude', 'openai'])).toEqual([]);
  });

  test('handles non-array input defensively', () => {
    expect(resolveAllowedProviders(undefined)).toEqual([]);
    expect(resolveAllowedProviders(null)).toEqual([]);
  });
});
