-- Migration 004: Expertise Finder tables
-- Stores internal reviewer/consultant/board roster and AI matching history

-- Expertise roster: internal reviewers, consultants, board members, and staff
CREATE TABLE IF NOT EXISTS expertise_roster (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  role_type VARCHAR(50) NOT NULL,            -- 'Consultant' | 'Board' | 'Research Program Staff'
  role VARCHAR(255),                         -- Title (e.g., 'Professor', 'Trustee')
  affiliation VARCHAR(500),                  -- Institution
  orcid VARCHAR(255),                        -- Full URL or 'N/A'
  primary_fields TEXT,                       -- 2-4 broad areas; semicolon-delimited
  keywords TEXT,                             -- 5-6 terms; semicolon-delimited
  subfields_specialties TEXT,                -- Detailed areas; semicolon-delimited
  methods_techniques TEXT,                   -- Specific methods; semicolon-delimited
  distinctions TEXT,                         -- Fellowships/honors; semicolon-delimited
  expertise TEXT,                            -- Domain-level summary paragraph
  keck_affiliation VARCHAR(255),             -- 'Past Grantee' | 'Board Member' | etc.
  keck_affiliation_details TEXT,             -- Specific grant history or role details
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES user_profiles(id),
  updated_by INTEGER REFERENCES user_profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_expertise_roster_role_type ON expertise_roster(role_type);
CREATE INDEX IF NOT EXISTS idx_expertise_roster_active ON expertise_roster(is_active);
CREATE INDEX IF NOT EXISTS idx_expertise_roster_name ON expertise_roster(name);

-- Expertise matches: AI matching history
CREATE TABLE IF NOT EXISTS expertise_matches (
  id SERIAL PRIMARY KEY,
  user_profile_id INTEGER REFERENCES user_profiles(id),
  proposal_title TEXT,
  proposal_filename VARCHAR(255),
  proposal_text_hash VARCHAR(64),
  match_results JSONB,                       -- Full AI response with assignments
  model_used VARCHAR(100),
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_cents NUMERIC(10,4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expertise_matches_user ON expertise_matches(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_expertise_matches_created ON expertise_matches(created_at DESC);

COMMENT ON TABLE expertise_roster IS 'Internal reviewer/consultant/board member roster for expertise matching';
COMMENT ON TABLE expertise_matches IS 'AI-powered proposal-to-reviewer matching history';
