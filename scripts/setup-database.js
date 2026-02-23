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

// V7: Grant cycles table and foreign keys
const v7Statements = [
  // Table: grant_cycles
  `CREATE TABLE IF NOT EXISTS grant_cycles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    short_code VARCHAR(10),
    program_name VARCHAR(255),
    review_deadline DATE,
    summary_pages VARCHAR(50) DEFAULT '2',
    review_template_blob_url VARCHAR(500),
    review_template_filename VARCHAR(255),
    additional_attachments JSONB,
    custom_fields JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  // Indexes for grant_cycles
  `CREATE INDEX IF NOT EXISTS idx_grant_cycles_active ON grant_cycles(is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_grant_cycles_created ON grant_cycles(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_grant_cycles_short_code ON grant_cycles(short_code)`,
];

const v7Alterations = [
  // Add grant_cycle_id FK to proposal_searches
  `ALTER TABLE proposal_searches ADD COLUMN IF NOT EXISTS grant_cycle_id INTEGER REFERENCES grant_cycles(id) ON DELETE SET NULL`,
  // Add grant_cycle_id FK to reviewer_suggestions
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS grant_cycle_id INTEGER REFERENCES grant_cycles(id) ON DELETE SET NULL`,
  // Indexes for FK columns
  `CREATE INDEX IF NOT EXISTS idx_proposal_searches_cycle ON proposal_searches(grant_cycle_id)`,
  `CREATE INDEX IF NOT EXISTS idx_suggestions_cycle ON reviewer_suggestions(grant_cycle_id)`,
];

// V8: Add declined status for reviewer suggestions
const v8Alterations = [
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS declined BOOLEAN DEFAULT FALSE`,
];

// V9: Add program_area for Keck Foundation programs
const v9Alterations = [
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS program_area VARCHAR(100)`,
];

// V10: User profiles and preferences
const v10Statements = [
  // Table: user_profiles
  `CREATE TABLE IF NOT EXISTS user_profiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    avatar_color VARCHAR(7) DEFAULT '#6366f1',
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Table: user_preferences
  `CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_profile_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    preference_key VARCHAR(100) NOT NULL,
    preference_value TEXT,
    is_encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_profile_id, preference_key)
  )`,

  // Indexes for user tables
  `CREATE INDEX IF NOT EXISTS idx_user_profiles_active ON user_profiles(is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_user_profiles_default ON user_profiles(is_default)`,
  `CREATE INDEX IF NOT EXISTS idx_user_preferences_profile ON user_preferences(user_profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_preferences_key ON user_preferences(preference_key)`,
];

const v10Alterations = [
  // Add user_profile_id FK to proposal_searches
  `ALTER TABLE proposal_searches ADD COLUMN IF NOT EXISTS user_profile_id INTEGER REFERENCES user_profiles(id) ON DELETE SET NULL`,
  // Add user_profile_id FK to reviewer_suggestions
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS user_profile_id INTEGER REFERENCES user_profiles(id) ON DELETE SET NULL`,
  // Indexes for FK columns
  `CREATE INDEX IF NOT EXISTS idx_proposal_searches_user ON proposal_searches(user_profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviewer_suggestions_user ON reviewer_suggestions(user_profile_id)`,
];

// V11: Azure AD authentication integration
const v11Alterations = [
  // Add Azure AD fields to user_profiles
  `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS azure_id VARCHAR(255) UNIQUE`,
  `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS azure_email VARCHAR(255)`,
  `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`,
  `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS needs_linking BOOLEAN DEFAULT false`,
  // Index for Azure ID lookups
  `CREATE INDEX IF NOT EXISTS idx_user_profiles_azure_id ON user_profiles(azure_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_profiles_azure_email ON user_profiles(azure_email)`,
];

// V12: Researcher notes for tracking conflicts, preferences, etc.
const v12Alterations = [
  `ALTER TABLE researchers ADD COLUMN IF NOT EXISTS notes TEXT`,
];

// V13: Applicant Integrity Screener tables
const v13Statements = [
  // Table: retractions (Retraction Watch data storage)
  `CREATE TABLE IF NOT EXISTS retractions (
    id SERIAL PRIMARY KEY,
    record_id VARCHAR(50) UNIQUE,
    title TEXT NOT NULL,
    authors TEXT NOT NULL,
    authors_normalized TEXT[],
    journal VARCHAR(500),
    publisher VARCHAR(255),
    subject VARCHAR(255),
    institution TEXT,
    country TEXT,
    retraction_date DATE,
    original_paper_doi VARCHAR(100),
    retraction_nature VARCHAR(100),
    retraction_reasons TEXT[],
    urls TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Table: integrity_screenings (screening history)
  `CREATE TABLE IF NOT EXISTS integrity_screenings (
    id SERIAL PRIMARY KEY,
    user_profile_id INTEGER REFERENCES user_profiles(id),
    screening_type VARCHAR(50) NOT NULL,
    screened_names JSONB NOT NULL,
    results JSONB,
    match_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    reviewed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Table: screening_dismissals (false positive tracking)
  `CREATE TABLE IF NOT EXISTS screening_dismissals (
    id SERIAL PRIMARY KEY,
    screening_id INTEGER REFERENCES integrity_screenings(id) ON DELETE CASCADE,
    source VARCHAR(50) NOT NULL,
    source_identifier TEXT,
    screened_name VARCHAR(255) NOT NULL,
    dismissal_reason VARCHAR(100) NOT NULL,
    notes TEXT,
    dismissed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Indexes for retractions table
  `CREATE INDEX IF NOT EXISTS idx_retractions_authors_gin ON retractions USING GIN(authors_normalized)`,
  `CREATE INDEX IF NOT EXISTS idx_retractions_date ON retractions(retraction_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_retractions_record_id ON retractions(record_id)`,

  // Indexes for integrity_screenings
  `CREATE INDEX IF NOT EXISTS idx_integrity_screenings_user ON integrity_screenings(user_profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_integrity_screenings_status ON integrity_screenings(status)`,
  `CREATE INDEX IF NOT EXISTS idx_integrity_screenings_created ON integrity_screenings(created_at DESC)`,

  // Indexes for screening_dismissals
  `CREATE INDEX IF NOT EXISTS idx_screening_dismissals_screening ON screening_dismissals(screening_id)`,
  `CREATE INDEX IF NOT EXISTS idx_screening_dismissals_source ON screening_dismissals(source)`,
];

// V14: Dynamics Explorer tables
const v14Statements = [
  // Table: dynamics_user_roles
  `CREATE TABLE IF NOT EXISTS dynamics_user_roles (
    id SERIAL PRIMARY KEY,
    user_profile_id INTEGER REFERENCES user_profiles(id) UNIQUE,
    role VARCHAR(20) NOT NULL DEFAULT 'read_only',
    granted_by INTEGER REFERENCES user_profiles(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Table: dynamics_restrictions
  `CREATE TABLE IF NOT EXISTS dynamics_restrictions (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    field_name VARCHAR(255),
    restriction_type VARCHAR(20) NOT NULL DEFAULT 'block',
    reason TEXT,
    created_by INTEGER REFERENCES user_profiles(id)
  )`,

  // Table: dynamics_query_log
  `CREATE TABLE IF NOT EXISTS dynamics_query_log (
    id SERIAL PRIMARY KEY,
    user_profile_id INTEGER REFERENCES user_profiles(id),
    session_id VARCHAR(100),
    query_type VARCHAR(50),
    table_name VARCHAR(255),
    query_params JSONB,
    record_count INTEGER,
    execution_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_dynamics_user_roles_user ON dynamics_user_roles(user_profile_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_dynamics_restrictions_unique ON dynamics_restrictions(table_name, COALESCE(field_name, ''))`,
  `CREATE INDEX IF NOT EXISTS idx_dynamics_restrictions_table ON dynamics_restrictions(table_name)`,
  `CREATE INDEX IF NOT EXISTS idx_dynamics_query_log_user ON dynamics_query_log(user_profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_dynamics_query_log_session ON dynamics_query_log(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_dynamics_query_log_created ON dynamics_query_log(created_at DESC)`,
];

// V15: API usage logging for centralized key management
const v15Statements = [
  `CREATE TABLE IF NOT EXISTS api_usage_log (
    id SERIAL PRIMARY KEY,
    user_profile_id INTEGER REFERENCES user_profiles(id),
    app_name VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    input_tokens INTEGER,
    output_tokens INTEGER,
    estimated_cost_cents NUMERIC(10,4),
    latency_ms INTEGER,
    request_status VARCHAR(20) DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage_log(user_profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_api_usage_app ON api_usage_log(app_name)`,
  `CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage_log(created_at DESC)`,
];

// V16: App-level access control
const v16Statements = [
  `CREATE TABLE IF NOT EXISTS user_app_access (
    id SERIAL PRIMARY KEY,
    user_profile_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    app_key VARCHAR(100) NOT NULL,
    granted_by INTEGER REFERENCES user_profiles(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_profile_id, app_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_user_app_access_user ON user_app_access(user_profile_id)`,
];

// V17: System settings key-value store (model overrides, etc.)
const v17Statements = [
  `CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(255) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    updated_by INTEGER REFERENCES user_profiles(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key)`,
];

// V18: Review Manager columns on reviewer_suggestions
const v18Alterations = [
  // Proposal URL — shared link to full proposal, stored per-suggestion but updated in batch per proposal
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS proposal_url VARCHAR(1000)`,
  // Materials email tracking
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS materials_sent_at TIMESTAMP`,
  // Reminder tracking
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP`,
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0`,
  // Review receipt tracking
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS review_received_at TIMESTAMP`,
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS review_blob_url VARCHAR(500)`,
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS review_filename VARCHAR(255)`,
  // Thank-you email tracking
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS thankyou_sent_at TIMESTAMP`,
  // Review lifecycle status: accepted, materials_sent, under_review, review_received, complete
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS review_status VARCHAR(50)`,
  // Password for accessing the proposal document (shared per proposal)
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS proposal_password VARCHAR(255)`,
  // Index for review status filtering
  `CREATE INDEX IF NOT EXISTS idx_suggestions_review_status ON reviewer_suggestions(review_status)`,
];

// V19: System alerts, health check history, and maintenance runs
const v19Statements = [
  // Table: system_alerts — central alert store for all automated notifications
  `CREATE TABLE IF NOT EXISTS system_alerts (
    id SERIAL PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    title VARCHAR(500) NOT NULL,
    message TEXT,
    metadata JSONB,
    source VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    auto_resolve_key VARCHAR(255),
    acknowledged_by INTEGER REFERENCES user_profiles(id),
    acknowledged_at TIMESTAMP,
    resolved_by INTEGER REFERENCES user_profiles(id),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Table: health_check_history — trend data for health monitoring
  `CREATE TABLE IF NOT EXISTS health_check_history (
    id SERIAL PRIMARY KEY,
    overall_status VARCHAR(20) NOT NULL,
    services JSONB NOT NULL,
    response_time_ms INTEGER,
    triggered_by VARCHAR(50) DEFAULT 'cron',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,

  // Table: maintenance_runs — audit trail for cleanup jobs
  `CREATE TABLE IF NOT EXISTS maintenance_runs (
    id SERIAL PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    records_processed INTEGER DEFAULT 0,
    records_deleted INTEGER DEFAULT 0,
    details JSONB,
    error_message TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER
  )`,

  // Indexes for system_alerts
  `CREATE INDEX IF NOT EXISTS idx_system_alerts_status ON system_alerts(status)`,
  `CREATE INDEX IF NOT EXISTS idx_system_alerts_type ON system_alerts(alert_type)`,
  `CREATE INDEX IF NOT EXISTS idx_system_alerts_severity_status ON system_alerts(severity, status)`,
  `CREATE INDEX IF NOT EXISTS idx_system_alerts_created ON system_alerts(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_system_alerts_auto_resolve ON system_alerts(auto_resolve_key) WHERE status = 'active'`,

  // Indexes for health_check_history
  `CREATE INDEX IF NOT EXISTS idx_health_history_created ON health_check_history(created_at DESC)`,

  // Indexes for maintenance_runs
  `CREATE INDEX IF NOT EXISTS idx_maintenance_runs_job ON maintenance_runs(job_name)`,
  `CREATE INDEX IF NOT EXISTS idx_maintenance_runs_created ON maintenance_runs(started_at DESC)`,
];

// V20: Dynamics restriction violation logging
const v20Alterations = [
  `ALTER TABLE dynamics_query_log ADD COLUMN IF NOT EXISTS was_denied BOOLEAN DEFAULT false`,
  `ALTER TABLE dynamics_query_log ADD COLUMN IF NOT EXISTS denial_reason TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_dynamics_query_log_denied ON dynamics_query_log(was_denied) WHERE was_denied = true`,
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
  // Summary blob URL in reviewer_suggestions (for My Candidates email generation)
  `ALTER TABLE reviewer_suggestions ADD COLUMN IF NOT EXISTS summary_blob_url VARCHAR(500)`,
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

    // Run V7 table creation (grant_cycles)
    console.log(`\nApplying v7 schema updates - grant cycles table (${v7Statements.length} statements)...`);
    for (let i = 0; i < v7Statements.length; i++) {
      const statement = v7Statements[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v7-${i + 1}/${v7Statements.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`[v7-${i + 1}/${v7Statements.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v7-${i + 1}/${v7Statements.length}] ✗ Error: ${error.message}`);
          throw error;
        }
      }
    }

    // Run V7 column additions (FK columns)
    console.log(`\nApplying v7 schema updates - grant cycle FK columns (${v7Alterations.length} alterations)...`);
    for (let i = 0; i < v7Alterations.length; i++) {
      const statement = v7Alterations[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v7-${i + 1}/${v7Alterations.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
          console.log(`[v7-${i + 1}/${v7Alterations.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v7-${i + 1}/${v7Alterations.length}] ✗ Error: ${error.message}`);
          // Don't throw on alter table errors - continue with other alterations
        }
      }
    }

    // Run V8 column additions (declined status)
    console.log(`\nApplying v8 schema updates - declined status (${v8Alterations.length} alterations)...`);
    for (let i = 0; i < v8Alterations.length; i++) {
      const statement = v8Alterations[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v8-${i + 1}/${v8Alterations.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
          console.log(`[v8-${i + 1}/${v8Alterations.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v8-${i + 1}/${v8Alterations.length}] ✗ Error: ${error.message}`);
        }
      }
    }

    // Run V9 column additions (program_area)
    console.log(`\nApplying v9 schema updates - program area (${v9Alterations.length} alterations)...`);
    for (let i = 0; i < v9Alterations.length; i++) {
      const statement = v9Alterations[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v9-${i + 1}/${v9Alterations.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
          console.log(`[v9-${i + 1}/${v9Alterations.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v9-${i + 1}/${v9Alterations.length}] ✗ Error: ${error.message}`);
        }
      }
    }

    // Run V10 table creation (user profiles and preferences)
    console.log(`\nApplying v10 schema updates - user profiles table (${v10Statements.length} statements)...`);
    for (let i = 0; i < v10Statements.length; i++) {
      const statement = v10Statements[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v10-${i + 1}/${v10Statements.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`[v10-${i + 1}/${v10Statements.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v10-${i + 1}/${v10Statements.length}] ✗ Error: ${error.message}`);
          throw error;
        }
      }
    }

    // Run V10 column additions (user_profile_id FK columns)
    console.log(`\nApplying v10 schema updates - user profile FK columns (${v10Alterations.length} alterations)...`);
    for (let i = 0; i < v10Alterations.length; i++) {
      const statement = v10Alterations[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v10-${i + 1}/${v10Alterations.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
          console.log(`[v10-${i + 1}/${v10Alterations.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v10-${i + 1}/${v10Alterations.length}] ✗ Error: ${error.message}`);
        }
      }
    }

    // Run V11 column additions (Azure AD authentication)
    console.log(`\nApplying v11 schema updates - Azure AD authentication (${v11Alterations.length} alterations)...`);
    for (let i = 0; i < v11Alterations.length; i++) {
      const statement = v11Alterations[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v11-${i + 1}/${v11Alterations.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
          console.log(`[v11-${i + 1}/${v11Alterations.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v11-${i + 1}/${v11Alterations.length}] ✗ Error: ${error.message}`);
        }
      }
    }

    // Run V12 column additions (researcher notes)
    console.log(`\nApplying v12 schema updates - Researcher notes (${v12Alterations.length} alterations)...`);
    for (let i = 0; i < v12Alterations.length; i++) {
      const statement = v12Alterations[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v12-${i + 1}/${v12Alterations.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
          console.log(`[v12-${i + 1}/${v12Alterations.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v12-${i + 1}/${v12Alterations.length}] ✗ Error: ${error.message}`);
        }
      }
    }

    // Run V13 table creation (Applicant Integrity Screener)
    console.log(`\nApplying v13 schema updates - Integrity Screener tables (${v13Statements.length} statements)...`);
    for (let i = 0; i < v13Statements.length; i++) {
      const statement = v13Statements[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v13-${i + 1}/${v13Statements.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`[v13-${i + 1}/${v13Statements.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v13-${i + 1}/${v13Statements.length}] ✗ Error: ${error.message}`);
          throw error;
        }
      }
    }

    // Run V14 table creation (Dynamics Explorer)
    console.log(`\nApplying v14 schema updates - Dynamics Explorer tables (${v14Statements.length} statements)...`);
    for (let i = 0; i < v14Statements.length; i++) {
      const statement = v14Statements[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v14-${i + 1}/${v14Statements.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`[v14-${i + 1}/${v14Statements.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v14-${i + 1}/${v14Statements.length}] ✗ Error: ${error.message}`);
          throw error;
        }
      }
    }

    // Run V15 table creation (API usage logging)
    console.log(`\nApplying v15 schema updates - API usage logging (${v15Statements.length} statements)...`);
    for (let i = 0; i < v15Statements.length; i++) {
      const statement = v15Statements[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v15-${i + 1}/${v15Statements.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`[v15-${i + 1}/${v15Statements.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v15-${i + 1}/${v15Statements.length}] ✗ Error: ${error.message}`);
          throw error;
        }
      }
    }

    // Run V16 table creation (App-level access control)
    console.log(`\nApplying v16 schema updates - App access control (${v16Statements.length} statements)...`);
    for (let i = 0; i < v16Statements.length; i++) {
      const statement = v16Statements[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v16-${i + 1}/${v16Statements.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`[v16-${i + 1}/${v16Statements.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v16-${i + 1}/${v16Statements.length}] ✗ Error: ${error.message}`);
          throw error;
        }
      }
    }

    // Run V17 table creation (System settings)
    console.log(`\nApplying v17 schema updates - System settings (${v17Statements.length} statements)...`);
    for (let i = 0; i < v17Statements.length; i++) {
      const statement = v17Statements[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v17-${i + 1}/${v17Statements.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`[v17-${i + 1}/${v17Statements.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v17-${i + 1}/${v17Statements.length}] ✗ Error: ${error.message}`);
          throw error;
        }
      }
    }

    // Run V18 alterations (Review Manager columns)
    console.log(`\nApplying v18 schema updates - Review Manager (${v18Alterations.length} statements)...`);
    for (let i = 0; i < v18Alterations.length; i++) {
      const statement = v18Alterations[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v18-${i + 1}/${v18Alterations.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`[v18-${i + 1}/${v18Alterations.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v18-${i + 1}/${v18Alterations.length}] ✗ Error: ${error.message}`);
          throw error;
        }
      }
    }

    // Run V19 table creation (System alerts, health history, maintenance runs)
    console.log(`\nApplying v19 schema updates - Alerts & monitoring (${v19Statements.length} statements)...`);
    for (let i = 0; i < v19Statements.length; i++) {
      const statement = v19Statements[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v19-${i + 1}/${v19Statements.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`[v19-${i + 1}/${v19Statements.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v19-${i + 1}/${v19Statements.length}] ✗ Error: ${error.message}`);
          throw error;
        }
      }
    }

    // Run V20 alterations (Dynamics restriction violation logging)
    console.log(`\nApplying v20 schema updates - Dynamics denial logging (${v20Alterations.length} statements)...`);
    for (let i = 0; i < v20Alterations.length; i++) {
      const statement = v20Alterations[i];
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');

      try {
        await sql.query(statement);
        console.log(`[v20-${i + 1}/${v20Alterations.length}] ✓ ${preview}...`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`[v20-${i + 1}/${v20Alterations.length}] ○ Already exists: ${preview}...`);
        } else {
          console.error(`[v20-${i + 1}/${v20Alterations.length}] ✗ Error: ${error.message}`);
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
    console.log('  • reviewer_suggestions.summary_blob_url');
    console.log('\nV7 new table: grant_cycles');
    console.log('  • grant_cycles (id, name, short_code, program_name, review_deadline,');
    console.log('    summary_pages, review_template_blob_url, additional_attachments,');
    console.log('    custom_fields, is_active, created_at, updated_at)');
    console.log('\nV7 column additions (grant cycle FK):');
    console.log('  • proposal_searches.grant_cycle_id');
    console.log('  • reviewer_suggestions.grant_cycle_id');
    console.log('\nV10 new tables: user_profiles, user_preferences');
    console.log('  • user_profiles (id, name, display_name, avatar_color, is_default,');
    console.log('    is_active, created_at, last_used_at)');
    console.log('  • user_preferences (id, user_profile_id, preference_key,');
    console.log('    preference_value, is_encrypted, created_at, updated_at)');
    console.log('\nV10 column additions (user profile FK):');
    console.log('  • proposal_searches.user_profile_id');
    console.log('  • reviewer_suggestions.user_profile_id');
    console.log('\nV11 column additions (Azure AD authentication):');
    console.log('  • user_profiles.azure_id (unique)');
    console.log('  • user_profiles.azure_email');
    console.log('  • user_profiles.last_login_at');
    console.log('  • user_profiles.needs_linking');
    console.log('\nV13 new tables (Integrity Screener):');
    console.log('  • retractions (Retraction Watch data storage)');
    console.log('  • integrity_screenings (screening history)');
    console.log('  • screening_dismissals (false positive tracking)');
    console.log('\nV14 new tables (Dynamics Explorer):');
    console.log('  • dynamics_user_roles (user role assignments)');
    console.log('  • dynamics_restrictions (table/field access restrictions)');
    console.log('  • dynamics_query_log (audit trail)');
    console.log('\nV15 new table (API usage logging):');
    console.log('  • api_usage_log (user_profile_id, app_name, model, input_tokens,');
    console.log('    output_tokens, estimated_cost_cents, latency_ms, request_status)');
    console.log('\nV16 new table (App access control):');
    console.log('  • user_app_access (user_profile_id, app_key, granted_by)');
    console.log('\nV17 new table (System settings):');
    console.log('  • system_settings (setting_key, setting_value, updated_by)');
    console.log('\nV18 column additions (Review Manager):');
    console.log('  • reviewer_suggestions.proposal_url');
    console.log('  • reviewer_suggestions.materials_sent_at');
    console.log('  • reviewer_suggestions.reminder_sent_at');
    console.log('  • reviewer_suggestions.reminder_count');
    console.log('  • reviewer_suggestions.review_received_at');
    console.log('  • reviewer_suggestions.review_blob_url');
    console.log('  • reviewer_suggestions.review_filename');
    console.log('  • reviewer_suggestions.thankyou_sent_at');
    console.log('  • reviewer_suggestions.review_status');
    console.log('\nV19 new tables (Alerts & monitoring):');
    console.log('  • system_alerts (alert_type, severity, title, message, metadata,');
    console.log('    source, status, auto_resolve_key, acknowledged_by/at, resolved_by/at)');
    console.log('  • health_check_history (overall_status, services, response_time_ms, triggered_by)');
    console.log('  • maintenance_runs (job_name, status, records_processed, records_deleted,');
    console.log('    details, error_message, started_at, completed_at, duration_ms)');
    console.log('\nV20 column additions (Dynamics denial logging):');
    console.log('  • dynamics_query_log.was_denied');
    console.log('  • dynamics_query_log.denial_reason');
    console.log('\nIndexes created: 55');

  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migration
runMigration();
