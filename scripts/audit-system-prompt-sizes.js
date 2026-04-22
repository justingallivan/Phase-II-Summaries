/**
 * Audit: token-count every app's system block against Sonnet 4.6's 2048-token
 * cache floor. Measures what's ACTUALLY sent to Claude, built from each app's
 * real prompt-construction code.
 *
 * Dead zone: 1024–2047 tokens. In that range, `cache_control` is accepted but
 * silently ignored — the app pays full input price even when everything
 * downstream looks correctly wired.
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

const MODEL = 'claude-sonnet-4-6';
const FLOOR = 2048;

(async () => {
  const apiKey = process.env.CLAUDE_API_KEY;

  const countTokens = async (system, tools) => {
    const body = {
      model: MODEL,
      system: [{ type: 'text', text: system }],
      messages: [{ role: 'user', content: 'x' }],
    };
    if (tools) body.tools = tools;
    const resp = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`count_tokens ${resp.status}: ${await resp.text()}`);
    return (await resp.json()).input_tokens;
  };

  const verdict = (n) => {
    if (n < 1024) return 'TOO_SMALL (below any cache floor)';
    if (n < FLOOR) return 'DEAD_ZONE (cache_control silently ignored on Sonnet 4.6)';
    return 'ABOVE_FLOOR (cache fires)';
  };

  const rows = [];

  // ── 1. phase-i-dynamics-v2 ──────────────────────────────────────────────
  {
    const { PromptResolver } = await import('../lib/services/prompt-resolver.js');
    const { DynamicsService } = await import('../lib/services/dynamics-service.js');
    DynamicsService.bypassRestrictions('audit');
    const p = await PromptResolver.getPrompt('phase-i-dynamics-v2');
    const sys = PromptResolver.interpolate(p.systemPrompt, {
      summary_length: 1,
      summary_length_suffix: '',
      audience_description: 'a technical non-expert audience',
    });
    const n = await countTokens(sys);
    rows.push({ app: 'phase-i-dynamics-v2', desc: 'SYSTEM_PROMPT from phase-i-dynamics.js (interpolated)', tokens: n, hasCacheControl: true });
  }

  // ── 2. qa ───────────────────────────────────────────────────────────────
  {
    const { createQASystemPrompt } = await import('../shared/config/prompts/proposal-summarizer.js');
    // Shortest realistic case: empty proposal (user just asks a question).
    // Longest realistic case: Phase II proposal (~10K char text).
    const shortSys = createQASystemPrompt('', 'Short summary.', 'test.pdf');
    const typicalProposal = 'Abstract: '.padEnd(10_000, 'lorem ipsum content about research methods and aims. ');
    const typicalSys = createQASystemPrompt(typicalProposal, 'A one-paragraph summary of the work.', 'proposal.pdf');
    rows.push({ app: 'qa (empty proposal)', desc: 'createQASystemPrompt with no proposalText', tokens: await countTokens(shortSys), hasCacheControl: true });
    rows.push({ app: 'qa (typical ~10K-char proposal)', desc: 'createQASystemPrompt with proposal + summary', tokens: await countTokens(typicalSys), hasCacheControl: true });
  }

  // ── 3. dynamics-explorer ────────────────────────────────────────────────
  {
    const { buildSystemPrompt, TOOL_DEFINITIONS } = await import('../shared/config/prompts/dynamics-explorer.js');
    const sys = buildSystemPrompt({ userRole: 'power_user', restrictions: { allowedTables: null, disallowedFields: [] } });
    // Tools count against the cache prefix too — need to measure system+tools.
    const tokensSysOnly = await countTokens(sys);
    const tokensWithTools = await countTokens(sys, TOOL_DEFINITIONS);
    rows.push({ app: 'dynamics-explorer (system only)', desc: 'buildSystemPrompt({power_user})', tokens: tokensSysOnly, hasCacheControl: true });
    rows.push({ app: 'dynamics-explorer (system + tools)', desc: 'what actually gets cached', tokens: tokensWithTools, hasCacheControl: true });
  }

  // ── 4. expertise-finder ─────────────────────────────────────────────────
  {
    const { SYSTEM_PROMPT } = await import('../shared/config/prompts/expertise-finder.js');
    rows.push({ app: 'expertise-finder (as-shipped)', desc: 'SYSTEM_PROMPT string; no cache_control', tokens: await countTokens(SYSTEM_PROMPT), hasCacheControl: false });
  }

  // ── 5. virtual-review-panel ─────────────────────────────────────────────
  {
    const mod = await import('../shared/config/prompts/virtual-review-panel.js');
    const sys = mod.SYSTEM_PROMPT || mod.default?.SYSTEM_PROMPT || '';
    if (sys) {
      rows.push({ app: 'virtual-review-panel', desc: 'SYSTEM_PROMPT constant', tokens: await countTokens(sys), hasCacheControl: false });
    } else {
      rows.push({ app: 'virtual-review-panel', desc: '(no SYSTEM_PROMPT export found — inspect prompts file)', tokens: null, hasCacheControl: false });
    }
  }

  // ── 6. phase-i-summaries (v1 Phase I) ───────────────────────────────────
  {
    const { createPhaseISummarizationPrompt } = await import('../shared/config/prompts/phase-i-summaries.js');
    const { KECK_GUIDELINES } = await import('../shared/config/keck-guidelines.js');
    // v1 is monolithic user message — no system block. Measure the full user
    // prompt to see what COULD be cached if split.
    const userPrompt = createPhaseISummarizationPrompt('PROPOSAL TEXT GOES HERE', 1, 'technical-non-expert', KECK_GUIDELINES);
    // Subtract the proposal body (not cacheable — varies per call) to estimate
    // the stable portion available for a cached system block.
    const stableChars = userPrompt.replace('PROPOSAL TEXT GOES HERE', '');
    rows.push({
      app: 'phase-i-summaries (v1)',
      desc: 'stable portion of user prompt if split → system',
      tokens: await countTokens(stableChars),
      hasCacheControl: false,
    });
  }

  // ── Report ──────────────────────────────────────────────────────────────
  console.log(`\nModel: ${MODEL}`);
  console.log(`Cache floor: ${FLOOR} tokens\n`);
  console.log('─'.repeat(110));
  console.log(`${'App'.padEnd(40)} ${'Tokens'.padStart(7)}  ${'cache_control?'.padEnd(14)} Verdict`);
  console.log('─'.repeat(110));
  for (const r of rows) {
    const tokStr = r.tokens == null ? '(n/a)' : String(r.tokens);
    const cc = r.hasCacheControl ? 'yes' : 'no';
    const v = r.tokens == null ? '—' : verdict(r.tokens);
    console.log(`${r.app.padEnd(40)} ${tokStr.padStart(7)}  ${cc.padEnd(14)} ${v}`);
  }
  console.log('─'.repeat(110));
  console.log('\nDetail:');
  for (const r of rows) {
    console.log(`  ${r.app}: ${r.desc}`);
  }

  // Summary of dead-zone apps
  const dead = rows.filter(r => r.tokens != null && r.tokens >= 1024 && r.tokens < FLOOR);
  if (dead.length) {
    console.log('\n⚠️  Dead-zone apps (cache_control is a no-op):');
    for (const r of dead) console.log(`    - ${r.app} (${r.tokens} tok)`);
  }
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
