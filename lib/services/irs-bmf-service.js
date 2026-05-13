/**
 * IRS BMF Service — reference-data refresh + lookup helpers.
 *
 * Owns the import of the IRS Exempt Organizations Business Master File
 * (four regional CSVs) into Postgres `irs_exempt_orgs`, plus the
 * verify-EIN read path used by `/api/irs/verify-ein`.
 *
 * Architecture:
 *   - Postgres holds the bulk extract (~1.95M rows). This is REFERENCE
 *     DATA, not materials of record — see `docs/atlas/postgres-irs-exempt-
 *     orgs.md`. Wave 2 migration does not apply.
 *   - Refresh strategy: atomic swap. Download all four region CSVs to
 *     /tmp, stream-parse into a staging table via COPY, swap to live in
 *     a single transaction. If the IRS files change format, the staging
 *     populate fails before any live data is touched.
 *   - Verified results (the "exempt yes/no" answers) live on Dynamics
 *     `account` rows, written by PowerAutomate. This service never
 *     writes to Dynamics.
 *
 * Refresh cadence: quarterly (15th of Jan/Apr/Jul/Oct), driven by
 *   `pages/api/cron/refresh-irs-bmf.js`. Bump to monthly when the SoCal
 *   program comes online — smaller orgs have less-stable status.
 *
 * See:
 *   docs/atlas/postgres-irs-exempt-orgs.md
 *   memory: project_irs_exempt_verification.md
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const { Pool } = require('pg');
const { from: copyFrom } = require('pg-copy-streams');
const { parse } = require('csv-parse');
const { Transform } = require('stream');

// Region URL map. The IRS publishes monthly; we refresh quarterly.
const REGION_URLS = {
  '1': 'https://www.irs.gov/pub/irs-soi/eo1.csv', // Northeast
  '2': 'https://www.irs.gov/pub/irs-soi/eo2.csv', // Mid-Atlantic + Great Lakes
  '3': 'https://www.irs.gov/pub/irs-soi/eo3.csv', // Gulf Coast + Pacific
  '4': 'https://www.irs.gov/pub/irs-soi/eo4.csv', // International + others
};

// Sanity threshold — IRS reports ~1.95M rows. A successful import should be
// well above this. Refuse the atomic swap if the staging total is implausibly
// low (partial download, IRS service degradation, etc.).
const MIN_PLAUSIBLE_TOTAL = 1_500_000;

// Output columns of the staging table, in COPY order. Must match the
// `INSERT INTO irs_exempt_orgs_new(...)` column list in BMF_COPY_COLUMNS.
const BMF_COPY_COLUMNS = [
  'ein', 'name', 'ico', 'street', 'city', 'state', 'zip',
  'group_exemption', 'subsection', 'affiliation', 'classification',
  'ruling_date', 'deductibility', 'foundation', 'organization', 'status',
  'ntee_cd', 'sort_name', 'region', 'refresh_date',
];

// CSV column names as published by the IRS (matches the data dictionary at
// https://www.irs.gov/pub/foia/ig/tege/eo-info.pdf). The names we *keep*
// from the CSV map to our DB columns below; everything else is dropped at
// transform time.
const IRS_COLUMN_TO_DB = {
  EIN: 'ein',
  NAME: 'name',
  ICO: 'ico',
  STREET: 'street',
  CITY: 'city',
  STATE: 'state',
  ZIP: 'zip',
  GROUP: 'group_exemption',
  SUBSECTION: 'subsection',
  AFFILIATION: 'affiliation',
  CLASSIFICATION: 'classification',
  RULING: 'ruling_date',
  DEDUCTIBILITY: 'deductibility',
  FOUNDATION: 'foundation',
  ORGANIZATION: 'organization',
  STATUS: 'status',
  NTEE_CD: 'ntee_cd',
  SORT_NAME: 'sort_name',
  // Skipped intentionally (financial fields not needed for verification):
  // ACTIVITY, TAX_PERIOD, ASSET_CD, INCOME_CD, FILING_REQ_CD,
  // PF_FILING_REQ_CD, ACCT_PD, ASSET_AMT, INCOME_AMT, REVENUE_AMT
};

// Subsection code → human description (from IRS data dictionary).
const SUBSECTION_DESCRIPTIONS = {
  '01': 'Government Instrumentality',
  '02': 'Title-Holding Corporation',
  '03': 'Charitable / Educational / Religious / Scientific (501(c)(3))',
  '04': 'Civic League / Social Welfare',
  '05': 'Agricultural / Horticultural / Labor',
  '06': 'Business League / Chamber of Commerce',
  '07': 'Pleasure / Recreational / Social Club',
  '08': 'Fraternal Beneficiary Society',
  '09': 'Voluntary Employees Beneficiary Association',
  '10': 'Domestic Fraternal Society',
  '11': 'Teachers Retirement Fund',
  '12': 'Benevolent Life Insurance',
  '13': 'Burial Association / Cemetery Company',
  '14': 'Credit Union / Mutual Corp',
  '15': 'Mutual Insurance Company',
  '16': 'Crop-Financing Corp',
  '17': 'Supplemental Unemployment Comp Trust',
  '18': 'Employee Pension Trust',
  '19': 'War Veterans Organization',
  '20': 'Legal Service Organization',
  '21': 'Black Lung Trust',
  '22': 'Multiemployer Pension Plan',
  '23': 'Veterans Assoc (pre-1880)',
  '24': 'ERISA 4049 Trust',
  '25': 'Title Holding Co for Pensions',
  '26': 'State-Sponsored High Risk Health Ins',
  '27': 'State-Sponsored Workers Comp Reinsurance',
  '29': 'ACA Qualified Nonprofit Health Insurer',
  '40': 'Apostolic / Religious Org (501(d))',
  '50': 'Cooperative Hospital Service (501(e))',
  '60': 'Cooperative Service Org of Educational Org (501(f))',
  '70': 'Child Care Org (501(k))',
  '71': 'Charitable Risk Pool',
  '81': 'Qualified State-Sponsored Tuition Program',
  '92': '4947(a)(1) Private Foundation',
};

const STATUS_DESCRIPTIONS = {
  '01': 'Unconditional Exemption',
  '02': 'Conditional Exemption',
  '12': 'Trust described in section 4947(a)(2)',
  '25': 'Terminating private foundation status (section 507(b)(1)(B))',
};

const DEDUCTIBILITY_DESCRIPTIONS = {
  '1': 'Contributions are deductible',
  '2': 'Contributions are not deductible',
  '4': 'Contributions are deductible by treaty (foreign org)',
};

// Status codes that mean "currently exempt and the IRS recognizes it"
// for grant-recipient purposes. Codes 12 and 25 are special cases that
// callers usually want to flag for staff review rather than auto-pass.
const ACTIVE_EXEMPT_STATUS_CODES = new Set(['01', '02']);

function newPool() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('POSTGRES_URL (or DATABASE_URL) is not configured');
  }
  return new Pool({ connectionString });
}

function normalizeEin(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== 9) return null;
  return digits;
}

/**
 * Look up an EIN in the live table. Returns null if not found; otherwise
 * the structured payload `/api/irs/verify-ein` returns to PowerAutomate.
 */
async function verifyEin(rawEin) {
  const ein = normalizeEin(rawEin);
  if (!ein) {
    return { error: 'invalid_ein', message: 'EIN must be 9 digits' };
  }
  const pool = newPool();
  try {
    const result = await pool.query(
      `SELECT ein, name, subsection, status, deductibility, foundation,
              ruling_date, state, refresh_date
         FROM irs_exempt_orgs WHERE ein = $1`,
      [ein],
    );
    if (result.rowCount === 0) {
      return { ein, found: false };
    }
    const row = result.rows[0];
    return {
      ein: row.ein,
      found: true,
      name: row.name,
      subsection: row.subsection,
      subsectionDescription: SUBSECTION_DESCRIPTIONS[row.subsection] || null,
      status: row.status,
      statusDescription: STATUS_DESCRIPTIONS[row.status] || null,
      deductibility: row.deductibility,
      deductibilityDescription: DEDUCTIBILITY_DESCRIPTIONS[row.deductibility] || null,
      foundation: row.foundation,
      rulingDate: row.ruling_date,
      state: row.state,
      is501c3PublicCharity: row.subsection === '03'
        && ACTIVE_EXEMPT_STATUS_CODES.has(row.status),
      asOfRefreshDate: row.refresh_date
        ? new Date(row.refresh_date).toISOString().slice(0, 10)
        : null,
    };
  } finally {
    await pool.end();
  }
}

/**
 * Stream a region CSV from the IRS into the staging table via COPY.
 *
 * The IRS CSVs have a header row matching `IRS_COLUMN_TO_DB` keys (a
 * superset; we drop the financial/legacy columns). We re-emit each row
 * as a tab-separated line matching `BMF_COPY_COLUMNS` order, with proper
 * NULL handling.
 */
async function streamRegionIntoStaging(client, region, csvFilePath, refreshDate) {
  const ingestStream = client.query(
    copyFrom(`COPY irs_exempt_orgs_new(${BMF_COPY_COLUMNS.join(',')})
              FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')`),
  );

  // CSV → object rows. `relax_column_count` lets the parser yield rows
  // with fewer/more fields than the header; we validate required fields
  // ourselves below and skip malformed rows rather than failing the
  // whole import. IRS BMF files have rare formatting quirks at scale
  // (unquoted commas in NAME, truncated lines, encoding edge cases) —
  // losing a handful of rows out of ~1.95M is acceptable.
  const csvParser = parse({
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
  });

  // Object rows → TAB-delimited line per BMF_COPY_COLUMNS, with the
  // refresh_date + region columns appended.
  let count = 0;
  let skipped = 0;
  const skippedSamples = [];
  const csvToCopyText = new Transform({
    writableObjectMode: true,
    transform(record, _enc, callback) {
      try {
        // Validate required fields. EIN, SUBSECTION, STATUS are NOT NULL
        // in the schema; skipping rows missing any of these avoids INSERT
        // failures from `relax_column_count` mis-aligned partial rows.
        if (!record.EIN || !record.SUBSECTION || !record.STATUS) {
          skipped += 1;
          if (skippedSamples.length < 5) {
            skippedSamples.push({
              ein: record.EIN || '(missing)',
              subsection: record.SUBSECTION || '(missing)',
              status: record.STATUS || '(missing)',
              fieldCount: Object.keys(record).filter((k) => record[k] !== undefined).length,
            });
          }
          return callback();
        }

        // EIN sanity: must be 9 digits. Some malformed rows can have a
        // truncated identifier — skip those too rather than poison the PK.
        const einDigits = String(record.EIN).replace(/\D/g, '');
        if (einDigits.length !== 9) {
          skipped += 1;
          if (skippedSamples.length < 5) {
            skippedSamples.push({
              ein: record.EIN, reason: 'EIN not 9 digits',
            });
          }
          return callback();
        }

        const out = BMF_COPY_COLUMNS.map((dbCol) => {
          if (dbCol === 'region') return region;
          if (dbCol === 'refresh_date') return refreshDate;
          // Find the CSV header that maps to this DB column
          const irsCol = Object.entries(IRS_COLUMN_TO_DB)
            .find(([, db]) => db === dbCol)?.[0];
          if (!irsCol) return '\\N';
          const v = (dbCol === 'ein') ? einDigits : record[irsCol];
          if (v === undefined || v === null || v === '') return '\\N';
          // Escape TAB / NEWLINE / BACKSLASH per Postgres COPY text format.
          return String(v)
            .replace(/\\/g, '\\\\')
            .replace(/\t/g, '\\t')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
        }).join('\t');
        count += 1;
        callback(null, out + '\n');
      } catch (err) {
        callback(err);
      }
    },
  });

  await pipeline(
    fs.createReadStream(csvFilePath),
    csvParser,
    csvToCopyText,
    ingestStream,
  );
  return { count, skipped, skippedSamples };
}

/**
 * Download a single regional CSV to /tmp. Returns the local path.
 * Streams to disk to avoid buffering ~100MB in RAM.
 */
async function downloadRegionCsv(region) {
  const url = REGION_URLS[region];
  if (!url) throw new Error(`Unknown IRS BMF region: ${region}`);
  const dest = path.join('/tmp', `irs_bmf_eo${region}_${Date.now()}.csv`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`IRS BMF download failed for region ${region}: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error(`IRS BMF download for region ${region} returned no body`);
  }
  const fileHandle = await fsp.open(dest, 'w');
  try {
    await pipeline(response.body, fileHandle.createWriteStream());
  } finally {
    await fileHandle.close();
  }
  const stat = await fsp.stat(dest);
  return { path: dest, size: stat.size };
}

/**
 * Full quarterly refresh. Atomic — either succeeds end-to-end or leaves
 * the live `irs_exempt_orgs` table untouched.
 *
 * @param {object} opts
 * @param {boolean} [opts.dryRun=false] - if true, downloads + stages but
 *   does not swap to live. Useful for manual diagnostics.
 * @returns {Promise<object>} stats summary
 */
async function refresh({ dryRun = false } = {}) {
  const startedAt = new Date();
  const refreshDate = startedAt.toISOString().slice(0, 10);
  const stats = {
    startedAt: startedAt.toISOString(),
    dryRun,
    perRegion: {},
    totalRows: 0,
    swappedAt: null,
    completedAt: null,
  };

  const downloadedPaths = [];
  const pool = newPool();
  const client = await pool.connect();

  try {
    // 0. Bootstrap: ensure the live table exists on first ever run. The
    //    canonical schema lives in `lib/db/migrations/008_irs_exempt_orgs.sql`
    //    and is mirrored in `scripts/setup-database.js` (v29). This block
    //    is the safety net so the cron / CLI doesn't fail with
    //    `relation "irs_exempt_orgs" does not exist` when migrations
    //    haven't been applied yet (e.g., first run on a fresh DB or
    //    against a freshly-promoted Vercel branch). After the first
    //    successful refresh, this is a no-op.
    await client.query(`
      CREATE TABLE IF NOT EXISTS irs_exempt_orgs (
        ein              VARCHAR(9)  PRIMARY KEY,
        name             TEXT NOT NULL,
        ico              TEXT,
        street           TEXT,
        city             TEXT,
        state            VARCHAR(2),
        zip              VARCHAR(10),
        group_exemption  VARCHAR(4),
        subsection       VARCHAR(2) NOT NULL,
        affiliation      VARCHAR(1),
        classification   VARCHAR(4),
        ruling_date      VARCHAR(6),
        deductibility    VARCHAR(1),
        foundation       VARCHAR(2),
        organization     VARCHAR(1),
        status           VARCHAR(2) NOT NULL,
        ntee_cd          VARCHAR(4),
        sort_name        TEXT,
        region           VARCHAR(1) NOT NULL,
        refresh_date     DATE NOT NULL
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_irs_exempt_orgs_state
        ON irs_exempt_orgs(state) WHERE state IS NOT NULL
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_irs_exempt_orgs_subsection_status
        ON irs_exempt_orgs(subsection, status)
    `);

    // 1. Recreate the staging table (drop if it survived a prior failed run).
    await client.query('DROP TABLE IF EXISTS irs_exempt_orgs_new');
    await client.query(`
      CREATE TABLE irs_exempt_orgs_new (LIKE irs_exempt_orgs INCLUDING ALL)
    `);

    // 2. For each region: download, COPY-stream into staging, delete tmp file.
    for (const region of Object.keys(REGION_URLS)) {
      const { path: csvPath, size } = await downloadRegionCsv(region);
      downloadedPaths.push(csvPath);
      const { count, skipped, skippedSamples } = await streamRegionIntoStaging(
        client, region, csvPath, refreshDate,
      );
      stats.perRegion[region] = {
        rows: count,
        skipped,
        skippedSamples,
        csvSizeBytes: size,
      };
      stats.totalRows += count;
      // Free disk as we go — Vercel /tmp caps at 512MB on most plans.
      await fsp.unlink(csvPath).catch(() => {});
      downloadedPaths.pop();
    }

    // 3. Sanity threshold — refuse to swap if the import looks partial.
    if (stats.totalRows < MIN_PLAUSIBLE_TOTAL) {
      throw new Error(
        `Refusing to swap: staging row count ${stats.totalRows} is below the `
        + `${MIN_PLAUSIBLE_TOTAL.toLocaleString()} plausibility threshold. `
        + `Probable partial download or IRS file-format change.`,
      );
    }

    // 4. Atomic swap (skipped in dry-run).
    if (!dryRun) {
      await client.query('BEGIN');
      try {
        await client.query('DROP TABLE IF EXISTS irs_exempt_orgs_old');
        // First refresh: live table is empty — `irs_exempt_orgs_new` becomes live.
        // Subsequent refreshes: live → old, new → live, drop old after commit.
        const liveExists = await client.query(`
          SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'irs_exempt_orgs'
        `);
        if (liveExists.rowCount > 0) {
          await client.query('ALTER TABLE irs_exempt_orgs RENAME TO irs_exempt_orgs_old');
        }
        await client.query('ALTER TABLE irs_exempt_orgs_new RENAME TO irs_exempt_orgs');
        await client.query('COMMIT');
        // Best-effort drop of the old table outside the swap transaction.
        await client.query('DROP TABLE IF EXISTS irs_exempt_orgs_old').catch(() => {});
        stats.swappedAt = new Date().toISOString();
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      }
    } else {
      // Dry-run cleanup — staging table not promoted, drop it.
      await client.query('DROP TABLE IF EXISTS irs_exempt_orgs_new');
    }

    stats.completedAt = new Date().toISOString();
    return stats;
  } catch (err) {
    // Best-effort cleanup of any leftover downloads + staging table.
    for (const p of downloadedPaths) {
      await fsp.unlink(p).catch(() => {});
    }
    await client.query('DROP TABLE IF EXISTS irs_exempt_orgs_new').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = {
  refresh,
  verifyEin,
  // Exposed for tests + ad-hoc tooling:
  normalizeEin,
  SUBSECTION_DESCRIPTIONS,
  STATUS_DESCRIPTIONS,
  DEDUCTIBILITY_DESCRIPTIONS,
  ACTIVE_EXEMPT_STATUS_CODES,
};
