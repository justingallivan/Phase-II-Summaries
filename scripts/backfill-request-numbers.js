/**
 * One-time script: backfill request_number on reviewer_suggestions
 *
 * 1. Adds request_number column to proposal_searches and reviewer_suggestions
 * 2. Matches proposals by title and updates request_number
 *
 * Usage: node scripts/backfill-request-numbers.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      let value = valueParts.join('=');
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
        value = value.slice(1, -1);
      process.env[key] = value;
    }
  }
});

const { sql } = require('@vercel/postgres');

// Request number → title mapping (from Excel + Montana State)
const MAPPINGS = [
  { requestNumber: '1002266', title: 'From Images to Insight' },
  { requestNumber: '1002279', title: 'From Poison to Protagonist' },
  { requestNumber: '1002302', title: 'Diet, Methylation, and Message' },
  { requestNumber: '1002324', title: 'molecules of mi' },  // "mind and memory" or "memory"
  { requestNumber: '1002108', title: 'Evolution of cognition' },
  { requestNumber: '1002257', title: 'Gut bacterial translocation' },
  { requestNumber: '1002285', title: 'Decoding the Human RNA 3D Structurome' },
  { requestNumber: '1002365', title: 'Death as a Source of Life' },
  { requestNumber: '1002146', title: 'Resolving the atomic structure of liquids' },
  { requestNumber: '1002181', title: 'Light-driven nucleation' },
  { requestNumber: '1002386', title: 'All-Optical Quantum Sensing' },
  { requestNumber: '1002020', title: 'Molecular Triggers of Alzheimer' },
  { requestNumber: '1002100', title: 'Supercellular Network via Tunneling' },
  { requestNumber: '1002185', title: 'Immune Synergy Encoding Neurons' },
  { requestNumber: '1002204', title: 'Intronic Thermosensors' },
  { requestNumber: '1002238', title: 'Visualizing Electrical Communication in Fungal' },
  { requestNumber: '1002379', title: 'Connecting Synthesis to Function' },
  { requestNumber: '1002132', title: 'Non-Reciprocal Matter' },
  { requestNumber: '1002305', title: 'Fields or Potentials' },
  { requestNumber: '1002341', title: 'Electric antennae' },
  { requestNumber: '1002353', title: 'Measuring the Mind of a Metazoan' },
  { requestNumber: '1002382', title: 'Linking Biological and Pathological Protein' },
  { requestNumber: '1001508', title: 'Resolving our microbial origins' },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('=== DRY RUN — no changes will be made ===\n');

  // Step 1: Add request_number column if it doesn't exist
  console.log('Step 1: Adding request_number columns...');
  if (!dryRun) {
    await sql`ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS request_number VARCHAR(20)`;
    await sql`ALTER TABLE proposal_searches ADD COLUMN IF NOT EXISTS request_number VARCHAR(20)`;
    console.log('  Columns added (or already exist).\n');
  } else {
    console.log('  Would add request_number to reviewer_suggestions and proposal_searches.\n');
  }

  // Step 2: Get distinct proposals from reviewer_suggestions
  const proposals = await sql`
    SELECT DISTINCT proposal_id, proposal_title
    FROM reviewer_suggestions
    ORDER BY proposal_title
  `;
  console.log(`Step 2: Found ${proposals.rows.length} distinct proposals in reviewer_suggestions.\n`);

  // Step 3: Match and update
  console.log('Step 3: Matching titles...');
  let matched = 0;
  let unmatched = 0;

  for (const proposal of proposals.rows) {
    const title = proposal.proposal_title || '';
    const mapping = MAPPINGS.find(m => title.toLowerCase().includes(m.title.toLowerCase()));

    if (mapping) {
      matched++;
      console.log(`  ✓ ${mapping.requestNumber} → "${title.substring(0, 60)}..."`);
      if (!dryRun) {
        const result = await sql`
          UPDATE reviewer_suggestions
          SET request_number = ${mapping.requestNumber}
          WHERE proposal_id = ${proposal.proposal_id}
        `;
        console.log(`    Updated ${result.rowCount} candidate rows.`);
      }
    } else {
      unmatched++;
      console.log(`  ✗ NO MATCH: "${title.substring(0, 80)}"`);
    }
  }

  console.log(`\nResults: ${matched} matched, ${unmatched} unmatched out of ${proposals.rows.length} proposals.`);

  if (!dryRun && matched > 0) {
    // Verify
    const check = await sql`
      SELECT request_number, COUNT(*)::int AS cnt
      FROM reviewer_suggestions
      WHERE request_number IS NOT NULL
      GROUP BY request_number
      ORDER BY request_number
    `;
    console.log(`\nVerification — ${check.rows.length} request numbers assigned:`);
    for (const r of check.rows) {
      console.log(`  ${r.request_number}: ${r.cnt} candidates`);
    }
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
