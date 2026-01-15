/**
 * Database Migration Script for Expert Reviewer Finder v2
 *
 * Run this script after setting up Vercel Postgres:
 *   node scripts/setup-database.js
 *
 * Prerequisites:
 * 1. Create Vercel Postgres database in Vercel Dashboard
 * 2. Pull environment variables: vercel env pull .env.local
 * 3. Run this script
 *
 * This script is backwards-compatible - it can be run on existing databases
 * to add v2 columns/tables without losing data.
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        let value = valueParts.join('=');
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  });
  console.log('Loaded environment variables from .env.local');
} else {
  console.error('No .env.local file found. Run: vercel env pull .env.local');
  process.exit(1);
}

const { sql } = require('@vercel/postgres');

// Define SQL statements explicitly for reliable execution
const statements = [
  // Table: search_cache
  `CREATE TABLE IF NOT EXISTS search_cache (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL,
    query_hash VARCHAR(64) NOT NULL,
    query_text TEXT NOT NULL,
    results JSONB,
    result_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    UNIQUE(source, query_hash)
  )`,

  // Table: researchers
  `CREATE TABLE IF NOT EXISTS researchers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255),
    primary_affiliation VARCHAR(500),
    department VARCHAR(255),
    email VARCHAR(255),
    website VARCHAR(500),
    orcid VARCHAR(50),
    google_scholar_id VARCHAR(100),
    h_index INTEGER,
    i10_index INTEGER,
    total_citations INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_checked TIMESTAMP
  )`,

  // Table: publications
  `CREATE TABLE IF NOT EXISTS publications (
    id SERIAL PRIMARY KEY,
    researcher_id INTEGER REFERENCES researchers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    authors TEXT[],
    author_position INTEGER,
    publication_date DATE,
    year INTEGER,
    journal VARCHAR(500),
    doi VARCHAR(100),
    pmid VARCHAR(50),
    pmcid VARCHAR(50),
    arxiv_id VARCHAR(50),
    citations INTEGER DEFAULT 0,
    abstract TEXT,
    source VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(doi)
  )`,

  // Table: researcher_keywords
  `CREATE TABLE IF NOT EXISTS researcher_keywords (
    id SERIAL PRIMARY KEY,
    researcher_id INTEGER REFERENCES researchers(id) ON DELETE CASCADE,
    keyword VARCHAR(255) NOT NULL,
    relevance_score FLOAT DEFAULT 1.0,
    source VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(researcher_id, keyword, source)
  )`,

  // Table: reviewer_suggestions
  `CREATE TABLE IF NOT EXISTS reviewer_suggestions (
    id SERIAL PRIMARY KEY,
    proposal_id VARCHAR(100) NOT NULL,
    proposal_title TEXT,
    researcher_id INTEGER REFERENCES researchers(id) ON DELETE CASCADE,
    relevance_score FLOAT,
    match_reason TEXT,
    sources TEXT[],
    suggested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    selected BOOLEAN DEFAULT FALSE,
    invited BOOLEAN DEFAULT FALSE,
    accepted BOOLEAN,
    notes TEXT,
    UNIQUE(proposal_id, researcher_id)
  )`,

  // ============================================
  // V2 NEW TABLE: proposal_searches
  // ============================================
  `CREATE TABLE IF NOT EXISTS proposal_searches (
    id SERIAL PRIMARY KEY,
    proposal_title TEXT,
    proposal_hash VARCHAR(64),
    author_institution VARCHAR(255),
    claude_suggestions JSONB,
    search_queries JSONB,
    verified_count INTEGER DEFAULT 0,
    discovered_count INTEGER DEFAULT 0,
    selected_candidates INTEGER[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_search_cache_lookup ON search_cache(source, query_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_search_cache_expires ON search_cache(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_researchers_normalized ON researchers(normalized_name)`,
  `CREATE INDEX IF NOT EXISTS idx_researchers_email ON researchers(email)`,
  `CREATE INDEX IF NOT EXISTS idx_researchers_updated ON researchers(last_updated)`,
  `CREATE INDEX IF NOT EXISTS idx_researchers_orcid ON researchers(orcid)`,
  `CREATE INDEX IF NOT EXISTS idx_researchers_scholar_id ON researchers(google_scholar_id)`,
  `CREATE INDEX IF NOT EXISTS idx_publications_researcher ON publications(researcher_id)`,
  `CREATE INDEX IF NOT EXISTS idx_publications_date ON publications(publication_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_publications_doi ON publications(doi)`,
  `CREATE INDEX IF NOT EXISTS idx_keywords_researcher ON researcher_keywords(researcher_id)`,
  `CREATE INDEX IF NOT EXISTS idx_keywords_keyword ON researcher_keywords(keyword)`,
  `CREATE INDEX IF NOT EXISTS idx_suggestions_proposal ON reviewer_suggestions(proposal_id)`,
  `CREATE INDEX IF NOT EXISTS idx_suggestions_researcher ON reviewer_suggestions(researcher_id)`,
  `CREATE INDEX IF NOT EXISTS idx_proposal_searches_hash ON proposal_searches(proposal_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_proposal_searches_created ON proposal_searches(created_at DESC)`,
];

// V2 column additions (run after tables exist)
const v2Alterations = [
  // Add google_scholar_url to researchers
  `ALTER TABLE researchers ADD COLUMN IF NOT EXISTS google_scholar_url VARCHAR(500)`,
  // Add orcid_url to researchers
  `ALTER TABLE researchers ADD COLUMN IF NOT EXISTS orcid_url VARCHAR(255)`,
  // Add metrics_updated_at to researchers
  `ALTER TABLE researchers ADD COLUMN IF NOT EXISTS metrics_updated_at TIMESTAMP`,
  // Add url to publications
  `ALTER TABLE publications ADD COLUMN IF NOT EXISTS url VARCHAR(500)`,
];

// V3 column additions for contact enrichment
const v3Alterations = [
  // Contact enrichment fields for researchers
  `ALTER TABLE researchers ADD COLUMN IF NOT EXISTS email_source VARCHAR(100)`,
  `ALTER TABLE researchers ADD COLUMN IF NOT EXISTS email_year INTEGER`,
  `ALTER TABLE researchers ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP`,
  `ALTER TABLE researchers ADD COLUMN IF NOT EXISTS faculty_page_url VARCHAR(500)`,
  `ALTER TABLE researchers ADD COLUMN IF NOT EXISTS contact_enriched_at TIMESTAMP`,
  `ALTER TABLE researchers ADD COLUMN IF NOT EXISTS contact_enrichment_source VARCHAR(50)`,
  // Outreach tracking for reviewer_suggestions
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP`,
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS email_opened_at TIMESTAMP`,
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS response_received_at TIMESTAMP`,
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS response_type VARCHAR(50)`,
  // Additional indexes
  `CREATE INDEX IF NOT EXISTS idx_researchers_contact_enriched ON researchers(contact_enriched_at)`,
];

// V4 column additions for email generation feature
const v4Alterations = [
  // Add proposal_abstract to reviewer_suggestions for email generation
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS proposal_abstract TEXT`,
  // Add PI information for email templates
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS proposal_authors TEXT`,
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS proposal_institution TEXT`,
];

// V6 column additions for proposal summary attachments and Co-PI tracking
const v6Alterations = [
  // Summary page extraction - store extracted page(s) in Vercel Blob
  `ALTER TABLE proposal_searches ADD COLUMN IF NOT EXISTS summary_blob_url VARCHAR(500)`,
  `ALTER TABLE proposal_searches ADD COLUMN IF NOT EXISTS summary_filename VARCHAR(255)`,
  `ALTER TABLE proposal_searches ADD COLUMN IF NOT EXISTS summary_pages VARCHAR(50)`, // e.g., "2" or "1,2"
  // Full proposal blob URL (already uploaded via existing flow)
  `ALTER TABLE proposal_searches ADD COLUMN IF NOT EXISTS full_proposal_blob_url VARCHAR(500)`,
  // Co-PI information for email templates
  `ALTER TABLE proposal_searches ADD COLUMN IF NOT EXISTS co_investigators TEXT`, // comma-separated names
  `ALTER TABLE proposal_searches ADD COLUMN IF NOT EXISTS co_investigator_count INTEGER`,
  // Also add to reviewer_suggestions for email generation
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS co_investigators TEXT`,
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS co_investigator_count INTEGER`,
];

// V5 data migration: merge duplicate proposals based on title
async function mergeDuplicateProposals() {
  console.log('\nChecking for duplicate proposals to merge...');

  // Find proposals with duplicate titles
  const duplicates = await sql`
    SELECT proposal_title, array_agg(DISTINCT proposal_id) as proposal_ids, COUNT(DISTINCT proposal_id) as count
    FROM reviewer_suggestions
    WHERE proposal_title IS NOT NULL
    GROUP BY proposal_title
    HAVING COUNT(DISTINCT proposal_id) > 1
  `;

  if (duplicates.rows.length === 0) {
    console.log('  No duplicate proposals found.');
    return;
  }

  console.log(`  Found ${duplicates.rows.length} proposal(s) with duplicate entries.`);

  for (const row of duplicates.rows) {
    const title = row.proposal_title;
    const proposalIds = row.proposal_ids;

    // Generate canonical proposal ID from title
    const canonicalId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);

    console.log(`  Merging ${proposalIds.length} entries for: "${title.substring(0, 40)}..."`);
    console.log(`    New ID: ${canonicalId}`);

    // First, delete duplicate researcher entries for the same title
    // Keep only the most recent entry for each researcher
    await sql`
      DELETE FROM reviewer_suggestions
      WHERE id NOT IN (
        SELECT DISTINCT ON (researcher_id) id
        FROM reviewer_suggestions
        WHERE proposal_title = ${title}
        ORDER BY researcher_id, suggested_at DESC
      )
      AND proposal_title = ${title}
    `;

    // Now update all remaining entries to use the canonical ID
    await sql`
      UPDATE reviewer_suggestions
      SET proposal_id = ${canonicalId}
      WHERE proposal_title = ${title}
    `;
  }

  console.log('  Duplicate proposals merged successfully.');
}

async function runMigration() {
  try {
    console.log('Starting database migration for Expert Reviewer Finder v2...');
    console.log(`Executing ${statements.length} SQL statements...\n`);

    // Run main table/index creation
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[${i + 1}/${statements.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`[${i + 1}/${statements.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[${i + 1}/${statements.length}] ✗ Error: ${error.message}`);
          throw error;
        }
      }
    }

    // Run V2 column additions
    console.log(`\nApplying v2 schema updates (${v2Alterations.length} alterations)...`);
    for (let i = 0; i < v2Alterations.length; i++) {
      const statement = v2Alterations[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v2-${i + 1}/${v2Alterations.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
          console.log(`[v2-${i + 1}/${v2Alterations.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v2-${i + 1}/${v2Alterations.length}] ✗ Error: ${error.message}`);
          // Don't throw on alter table errors - continue with other alterations
        }
      }
    }

    // Run V3 column additions (contact enrichment)
    console.log(`\nApplying v3 schema updates - contact enrichment (${v3Alterations.length} alterations)...`);
    for (let i = 0; i < v3Alterations.length; i++) {
      const statement = v3Alterations[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v3-${i + 1}/${v3Alterations.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
          console.log(`[v3-${i + 1}/${v3Alterations.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v3-${i + 1}/${v3Alterations.length}] ✗ Error: ${error.message}`);
          // Don't throw on alter table errors - continue with other alterations
        }
      }
    }

    // Run V4 column additions (email generation)
    console.log(`\nApplying v4 schema updates - email generation (${v4Alterations.length} alterations)...`);
    for (let i = 0; i < v4Alterations.length; i++) {
      const statement = v4Alterations[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v4-${i + 1}/${v4Alterations.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
          console.log(`[v4-${i + 1}/${v4Alterations.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v4-${i + 1}/${v4Alterations.length}] ✗ Error: ${error.message}`);
          // Don't throw on alter table errors - continue with other alterations
        }
      }
    }

    // Run V5 data migration (merge duplicate proposals)
    await mergeDuplicateProposals();

    // Run V6 column additions (proposal summary attachments & Co-PI)
    console.log(`\nApplying v6 schema updates - summary attachments & Co-PI (${v6Alterations.length} alterations)...`);
    for (let i = 0; i < v6Alterations.length; i++) {
      const statement = v6Alterations[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v6-${i + 1}/${v6Alterations.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
          console.log(`[v6-${i + 1}/${v6Alterations.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v6-${i + 1}/${v6Alterations.length}] ✗ Error: ${error.message}`);
          // Don't throw on alter table errors - continue with other alterations
        }
      }
    }

    console.log('\n✓ Database migration completed successfully!');
    console.log('\nTables created/updated:');
    console.log('  • search_cache (API search result caching)');
    console.log('  • researchers (deduplicated researcher profiles)');
    console.log('  • publications (papers linked to researchers)');
    console.log('  • researcher_keywords (expertise areas)');
    console.log('  • reviewer_suggestions (proposal-researcher matches)');
    console.log('  • proposal_searches (v2: search history tracking)');
    console.log('\nV2 column additions:');
    console.log('  • researchers.google_scholar_url');
    console.log('  • researchers.orcid_url');
    console.log('  • researchers.metrics_updated_at');
    console.log('  • publications.url');
    console.log('\nV3 column additions (contact enrichment):');
    console.log('  • researchers.email_source');
    console.log('  • researchers.email_year');
    console.log('  • researchers.email_verified_at');
    console.log('  • researchers.faculty_page_url');
    console.log('  • researchers.contact_enriched_at');
    console.log('  • researchers.contact_enrichment_source');
    console.log('  • reviewer_suggestions.email_sent_at');
    console.log('  • reviewer_suggestions.response_type');
    console.log('\nV4 column additions (email generation):');
    console.log('  • reviewer_suggestions.proposal_abstract');
    console.log('  • reviewer_suggestions.proposal_authors');
    console.log('  • reviewer_suggestions.proposal_institution');
    console.log('\nV6 column additions (summary attachments & Co-PI):');
    console.log('  • proposal_searches.summary_blob_url');
    console.log('  • proposal_searches.summary_filename');
    console.log('  • proposal_searches.summary_pages');
    console.log('  • proposal_searches.full_proposal_blob_url');
    console.log('  • proposal_searches.co_investigators');
    console.log('  • proposal_searches.co_investigator_count');
    console.log('  • reviewer_suggestions.co_investigators');
    console.log('  • reviewer_suggestions.co_investigator_count');
    console.log('\nIndexes created: 17');

  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migration
runMigration();
