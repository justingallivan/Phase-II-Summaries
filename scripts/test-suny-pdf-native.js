/**
 * Send the SUNY Stony Brook Phase I PDF to Claude as a native `document`
 * content block (option 3 — Anthropic does the rendering server-side).
 *
 * Compares to the v1 and v2 stats we already collected:
 *   v1: 5347 chars, in=9809  out=1157 (26083ms)
 *   v2: 5147 chars, in=9857  out=1154 (25875ms)
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const t = line.trim(); if (!t || t.startsWith('#')) return;
  const [k, ...v] = t.split('='); if (!k || v.length === 0) return;
  let val = v.join('='); if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  process.env[k] = val;
});

const PDF_PATH = '/tmp/suny-stonybrook-phase-i.pdf';
const OUT = '/Users/gallivan/Programming/Phase-II-Summaries/tmp/phase-i-comparison/1001507-v3-native-pdf.md';

// Sonnet 4.6 pricing per Anthropic (per 1M tokens)
const PRICE_INPUT_PER_MTOK_USD = 3.00;
const PRICE_OUTPUT_PER_MTOK_USD = 15.00;

(async () => {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) { console.error('CLAUDE_API_KEY missing'); process.exit(1); }

  const { PromptResolver } = await import('../lib/services/prompt-resolver.js');
  const { DynamicsService } = await import('../lib/services/dynamics-service.js');
  const { BASE_CONFIG, getModelForApp, loadModelOverrides } = await import('../shared/config/baseConfig.js');
  await loadModelOverrides();
  DynamicsService.bypassRestrictions('test-native-pdf');

  const model = getModelForApp('batch-phase-i');
  console.log(`Model: ${model}`);

  const buf = fs.readFileSync(PDF_PATH);
  const sizeMb = (buf.length / 1024 / 1024).toFixed(2);
  console.log(`PDF: ${PDF_PATH} (${sizeMb} MB)`);

  const prompt = await PromptResolver.getPrompt('phase-i-dynamics-v2');
  const systemResolved = PromptResolver.interpolate(prompt.systemPrompt, {
    summary_length: 1,
    summary_length_suffix: '',
    audience_description: 'a technical non-expert audience, using some technical terms but explaining complex concepts clearly',
  });
  // The v2 user template expects {{proposal_text}}. Replace that with a short
  // pointer phrase since the actual content arrives via the document block.
  const userResolved = PromptResolver.interpolate(prompt.userPromptTemplate, {
    proposal_text: '(See attached PDF document above for the full proposal.)',
  });

  console.log(`System prompt: ${systemResolved.length} chars`);
  console.log(`User prompt:   ${userResolved.length} chars\n`);

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
      system: [
        { type: 'text', text: systemResolved, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } },
          { type: 'text', text: userResolved },
        ],
      }],
    }),
  });
  const latencyMs = Date.now() - start;

  if (!resp.ok) {
    const txt = await resp.text();
    console.error(`Claude error ${resp.status}: ${txt.slice(0, 1000)}`);
    process.exit(1);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text || '';
  const u = data.usage || {};
  const inputTok = u.input_tokens || 0;
  const outputTok = u.output_tokens || 0;
  const cacheCreate = u.cache_creation_input_tokens || 0;
  const cacheRead = u.cache_read_input_tokens || 0;

  const costInput = (inputTok / 1_000_000) * PRICE_INPUT_PER_MTOK_USD;
  const costOutput = (outputTok / 1_000_000) * PRICE_OUTPUT_PER_MTOK_USD;
  const costTotal = costInput + costOutput;

  console.log('─── v3 (native PDF document block) ───');
  console.log(`Output:        ${text.length} chars`);
  console.log(`Input tokens:  ${inputTok}`);
  console.log(`Output tokens: ${outputTok}`);
  console.log(`Cache create:  ${cacheCreate}`);
  console.log(`Cache read:    ${cacheRead}`);
  console.log(`Latency:       ${latencyMs}ms`);
  console.log(`Cost (Sonnet 4.6 list pricing): $${costTotal.toFixed(4)}\n`);

  console.log('─── Comparison vs prior runs ───');
  const v1Cost = (9809 / 1_000_000) * PRICE_INPUT_PER_MTOK_USD + (1157 / 1_000_000) * PRICE_OUTPUT_PER_MTOK_USD;
  const v2Cost = (9857 / 1_000_000) * PRICE_INPUT_PER_MTOK_USD + (1154 / 1_000_000) * PRICE_OUTPUT_PER_MTOK_USD;
  console.log(`v1 (text only):  in=9809   out=1157  cost=$${v1Cost.toFixed(4)}  chars=5347`);
  console.log(`v2 (text+sys):   in=9857   out=1154  cost=$${v2Cost.toFixed(4)}  chars=5147`);
  console.log(`v3 (native PDF): in=${inputTok}  out=${outputTok}  cost=$${costTotal.toFixed(4)}  chars=${text.length}`);
  console.log(`v3/v1 input ratio: ${(inputTok/9809).toFixed(2)}×, cost ratio: ${(costTotal/v1Cost).toFixed(2)}×`);

  const md = `# SUNY Stony Brook (1001507) — v3 native PDF input

**File:** \`${PDF_PATH}\` (${sizeMb} MB)
**Model:** ${model}

## Stats
| | v1 text-only | v2 split + cache | **v3 native PDF** |
|---|---:|---:|---:|
| Output chars | 5,347 | 5,147 | **${text.length}** |
| Input tokens | 9,809 | 9,857 | **${inputTok}** |
| Output tokens | 1,157 | 1,154 | **${outputTok}** |
| Cache create | 0 | 0 | **${cacheCreate}** |
| Cache read | 0 | 0 | **${cacheRead}** |
| Cost (USD) | $${v1Cost.toFixed(4)} | $${v2Cost.toFixed(4)} | **$${costTotal.toFixed(4)}** |
| Latency (ms) | 26,083 | 25,875 | **${latencyMs}** |

**v3 input vs v1: ${(inputTok/9809).toFixed(2)}× tokens, ${(costTotal/v1Cost).toFixed(2)}× cost.**

---

## v3 Output

${text}
`;
  fs.writeFileSync(OUT, md);
  console.log(`\nWrote ${OUT}`);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
