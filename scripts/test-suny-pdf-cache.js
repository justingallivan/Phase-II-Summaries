/**
 * Test PDF caching: send the same SUNY PDF twice with cache_control on the
 * document block, measure cache_create on call 1 and cache_read on call 2.
 *
 * Cache TTL is 5 min (ephemeral). The two calls fire back-to-back.
 *
 * Anthropic per-MTok pricing (Sonnet 4.6 list):
 *   base input:  $3.00
 *   cache write: $3.75   (1.25× base)
 *   cache read:  $0.30   (0.10× base)
 *   output:      $15.00
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const t = line.trim(); if (!t || t.startsWith('#')) return;
  const [k, ...v] = t.split('='); if (!k || v.length === 0) return;
  let val = v.join('=');
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  process.env[k] = val;
});

const PDF_PATH = '/tmp/suny-stonybrook-phase-i.pdf';

const PRICE_BASE_INPUT = 3.00 / 1_000_000;
const PRICE_CACHE_WRITE = 3.75 / 1_000_000;
const PRICE_CACHE_READ = 0.30 / 1_000_000;
const PRICE_OUTPUT = 15.00 / 1_000_000;

(async () => {
  const apiKey = process.env.CLAUDE_API_KEY;
  const { PromptResolver } = await import('../lib/services/prompt-resolver.js');
  const { DynamicsService } = await import('../lib/services/dynamics-service.js');
  const { BASE_CONFIG, getModelForApp, loadModelOverrides } = await import('../shared/config/baseConfig.js');
  await loadModelOverrides();
  DynamicsService.bypassRestrictions('test-pdf-cache');

  const model = getModelForApp('batch-phase-i');
  const buf = fs.readFileSync(PDF_PATH);
  const pdfBase64 = buf.toString('base64');
  console.log(`Model: ${model}`);
  console.log(`PDF: ${(buf.length / 1024 / 1024).toFixed(2)} MB raw → ${(pdfBase64.length / 1024 / 1024).toFixed(2)} MB base64\n`);

  const prompt = await PromptResolver.getPrompt('phase-i-dynamics-v2');
  const systemResolved = PromptResolver.interpolate(prompt.systemPrompt, {
    summary_length: 1,
    summary_length_suffix: '',
    audience_description: 'a technical non-expert audience, using some technical terms but explaining complex concepts clearly',
  });

  // Two different USER queries against the same PDF — only the doc should cache.
  const userPrompt1 = '(See attached PDF document above.) Provide a Phase I summary following the system instructions.';
  const userPrompt2 = '(See attached PDF document above.) List the 5 most important specific aims of the project, one per line.';

  const callOnce = async (userText, label) => {
    const start = Date.now();
    const resp = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: BASE_CONFIG.MODEL_PARAMS.DEFAULT_MAX_TOKENS,
        temperature: BASE_CONFIG.MODEL_PARAMS.SUMMARIZATION_TEMPERATURE,
        system: [{ type: 'text', text: systemResolved, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
              cache_control: { type: 'ephemeral' },
            },
            { type: 'text', text: userText },
          ],
        }],
      }),
    });
    const latencyMs = Date.now() - start;
    if (!resp.ok) {
      console.error(`${label} ERROR ${resp.status}: ${(await resp.text()).slice(0, 500)}`);
      process.exit(1);
    }
    const data = await resp.json();
    const u = data.usage || {};
    const cost = (u.input_tokens || 0) * PRICE_BASE_INPUT
               + (u.cache_creation_input_tokens || 0) * PRICE_CACHE_WRITE
               + (u.cache_read_input_tokens || 0) * PRICE_CACHE_READ
               + (u.output_tokens || 0) * PRICE_OUTPUT;
    console.log(`─── ${label} ───`);
    console.log(`  output chars:        ${(data.content?.[0]?.text || '').length}`);
    console.log(`  input_tokens:        ${u.input_tokens}`);
    console.log(`  cache_creation:      ${u.cache_creation_input_tokens || 0}`);
    console.log(`  cache_read:          ${u.cache_read_input_tokens || 0}`);
    console.log(`  output_tokens:       ${u.output_tokens}`);
    console.log(`  latency:             ${latencyMs}ms`);
    console.log(`  cost (Sonnet 4.6):   $${cost.toFixed(4)}\n`);
    return { ...u, latencyMs, cost };
  };

  const r1 = await callOnce(userPrompt1, 'CALL 1 (cold — should write cache)');
  const r2 = await callOnce(userPrompt2, 'CALL 2 (warm — should read cache)');

  console.log('═══ Summary ═══');
  console.log(`Call 1 cost: $${r1.cost.toFixed(4)}`);
  console.log(`Call 2 cost: $${r2.cost.toFixed(4)}`);
  console.log(`Savings on call 2: ${(((r1.cost - r2.cost) / r1.cost) * 100).toFixed(0)}%`);
  if ((r2.cache_read_input_tokens || 0) > 30000) {
    console.log(`✓ PDF caching CONFIRMED — call 2 read ${r2.cache_read_input_tokens} tokens from cache`);
  } else {
    console.log(`✗ PDF caching DID NOT FIRE — call 2 cache_read=${r2.cache_read_input_tokens || 0}`);
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
