#!/usr/bin/env node
/**
 * Round-Efficiency Test Suite for Dynamics Explorer
 *
 * Sends common queries to the Dynamics Explorer chat endpoint and verifies
 * the model resolves them within expected tool-call round thresholds.
 * Requires a running dev server and real CRM/Claude APIs.
 *
 * Usage:
 *   node scripts/test-dynamics-rounds.js [options]
 *
 * Options:
 *   --base-url <url>   Dev server URL (default: http://localhost:3000)
 *   --query <n>         Run only query #n (1-indexed)
 *   --verbose           Show thinking messages, tool calls, and response text
 *   --help              Show this help message
 *
 * Examples:
 *   node scripts/test-dynamics-rounds.js
 *   node scripts/test-dynamics-rounds.js --query 1 --verbose
 *   node scripts/test-dynamics-rounds.js --base-url http://localhost:3001
 */

// ─── Configuration ───

const TEST_QUERIES = [
  {
    query: 'Who is the PI on request 1001481?',
    maxRounds: 2,
    tests: 'get_entity returns _wmkf_projectleader_value',
  },
  {
    query: 'How much did we award for request 1001481?',
    maxRounds: 2,
    tests: 'get_entity returns akoya_grant',
  },
  {
    query: "What's the Phase I status of request 1002108?",
    maxRounds: 2,
    tests: 'get_entity returns wmkf_phaseistatus',
  },
  {
    query: 'Show me all MR proposals from 2025',
    maxRounds: 3,
    tests: 'Hardcoded MR GUID, skip lookup table',
  },
  {
    query: 'Show me active SoCal grants',
    maxRounds: 3,
    tests: 'Hardcoded SoCal GUID + wmkf_grantprogram inlined',
  },
  {
    query: 'How many S&E proposals were submitted in 2024?',
    maxRounds: 3,
    tests: 'Hardcoded S&E GUID, count_records',
  },
];

// ─── Argument parsing ───

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    baseUrl: 'http://localhost:3000',
    queryIndex: null,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--base-url':
        opts.baseUrl = args[++i];
        break;
      case '--query':
        opts.queryIndex = parseInt(args[++i], 10);
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--help':
        console.log(`Usage: node scripts/test-dynamics-rounds.js [options]
  --base-url <url>   Dev server URL (default: http://localhost:3000)
  --query <n>        Run only query #n (1-indexed)
  --verbose          Show thinking messages and response text
  --help             Show this help`);
        process.exit(0);
    }
  }

  return opts;
}

// ─── SSE stream parser ───

/**
 * Parse an SSE response stream from the chat endpoint.
 * Returns { rounds, thinkingMessages, responseText, error }.
 */
async function parseSSEStream(response, verbose) {
  const reader = response.body;
  const decoder = new TextDecoder();
  let buffer = '';

  const thinkingMessages = [];
  let responseText = '';
  let rounds = null;
  let error = null;

  // Node 18+ fetch returns a ReadableStream; use async iteration
  for await (const chunk of reader) {
    buffer += decoder.decode(chunk, { stream: true });

    // Split on double-newline SSE boundaries
    const parts = buffer.split('\n\n');
    buffer = parts.pop(); // keep incomplete event

    for (const part of parts) {
      if (!part.trim()) continue;

      let eventType = 'message';
      let eventData = '';

      for (const line of part.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          eventData += line.slice(6);
        }
      }

      if (!eventData) continue;

      let parsed;
      try {
        parsed = JSON.parse(eventData);
      } catch {
        continue;
      }

      switch (eventType) {
        case 'thinking':
          thinkingMessages.push(parsed.message);
          if (verbose) {
            console.log(`    [thinking] ${parsed.message}`);
          }
          break;

        case 'text_delta':
          responseText += parsed.text || '';
          break;

        case 'response':
          responseText += parsed.content || '';
          break;

        case 'complete':
          rounds = parsed.rounds;
          break;

        case 'error':
          error = parsed.message || 'Unknown error';
          if (verbose) {
            console.log(`    [error] ${error}`);
          }
          break;
      }
    }
  }

  return { rounds, thinkingMessages, responseText, error };
}

// ─── Run a single test query ───

async function runQuery(baseUrl, query, verbose) {
  const url = `${baseUrl}/api/dynamics-explorer/chat`;
  const startTime = Date.now();

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: query }],
      sessionId: `test-rounds-${Date.now()}`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body.substring(0, 200)}`);
  }

  const result = await parseSSEStream(response, verbose);
  result.elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (verbose && result.responseText) {
    const preview = result.responseText.length > 300
      ? result.responseText.substring(0, 300) + '...'
      : result.responseText;
    console.log(`    [response] ${preview}`);
  }

  return result;
}

// ─── Main ───

async function main() {
  const opts = parseArgs();

  // Determine which queries to run
  let queries = TEST_QUERIES.map((q, i) => ({ ...q, index: i + 1 }));
  if (opts.queryIndex !== null) {
    if (opts.queryIndex < 1 || opts.queryIndex > TEST_QUERIES.length) {
      console.error(`Invalid query index: ${opts.queryIndex}. Valid range: 1-${TEST_QUERIES.length}`);
      process.exit(1);
    }
    queries = [queries[opts.queryIndex - 1]];
  }

  console.log('Dynamics Explorer — Round Efficiency Tests');
  console.log('==========================================');
  console.log(`Server: ${opts.baseUrl}`);
  console.log(`Queries: ${queries.length} of ${TEST_QUERIES.length}`);
  console.log('');

  // Check server is reachable (accept any response — 503 just means a backing service is down)
  try {
    await fetch(`${opts.baseUrl}/api/health`);
  } catch (err) {
    console.error(`Cannot reach ${opts.baseUrl}: ${err.message}`);
    console.error('Start the dev server with: npm run dev');
    process.exit(1);
  }

  const results = [];

  // Header
  const colNum = 3;
  const colQuery = 44;
  const colRounds = 8;
  const colMax = 5;
  const colResult = 8;
  const colTime = 7;

  console.log(
    '#'.padEnd(colNum) +
    'Query'.padEnd(colQuery) +
    'Rounds'.padStart(colRounds) +
    'Max'.padStart(colMax) +
    'Result'.padStart(colResult) +
    'Time'.padStart(colTime)
  );
  console.log('─'.repeat(colNum + colQuery + colRounds + colMax + colResult + colTime));

  for (const q of queries) {
    if (opts.verbose) {
      console.log(`\n── Query ${q.index}: ${q.query}`);
      console.log(`   Tests: ${q.tests}`);
    }

    let result;
    try {
      result = await runQuery(opts.baseUrl, q.query, opts.verbose);
    } catch (err) {
      result = { rounds: null, error: err.message, elapsed: '0.0', thinkingMessages: [] };
    }

    const passed = result.error
      ? false
      : result.rounds !== null && result.rounds <= q.maxRounds;

    const roundsStr = result.error
      ? 'ERR'
      : result.rounds !== null
        ? String(result.rounds)
        : '?';

    const statusStr = passed ? 'PASS' : 'FAIL';
    const timeStr = `${result.elapsed}s`;

    // Truncate query for display
    const displayQuery = q.query.length > colQuery - 2
      ? q.query.substring(0, colQuery - 5) + '...'
      : q.query;

    if (opts.verbose) console.log('');

    console.log(
      String(q.index).padEnd(colNum) +
      displayQuery.padEnd(colQuery) +
      roundsStr.padStart(colRounds) +
      String(q.maxRounds).padStart(colMax) +
      statusStr.padStart(colResult) +
      timeStr.padStart(colTime)
    );

    if (!passed && result.error) {
      console.log(`   Error: ${result.error.substring(0, 100)}`);
    }

    results.push({ ...q, ...result, passed });
  }

  // Summary
  const passCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  console.log('─'.repeat(colNum + colQuery + colRounds + colMax + colResult + colTime));
  console.log(`Summary: ${passCount}/${totalCount} passed`);

  if (passCount < totalCount) {
    console.log('');
    console.log('Failed queries:');
    for (const r of results.filter(r => !r.passed)) {
      const reason = r.error
        ? `Error: ${r.error.substring(0, 80)}`
        : `${r.rounds} rounds (max ${r.maxRounds})`;
      console.log(`  #${r.index} "${r.query}" — ${reason}`);
    }
  }

  process.exit(passCount === totalCount ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
