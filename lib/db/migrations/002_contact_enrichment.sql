-- ============================================
-- Migration 002: Contact Enrichment Fields
-- ============================================
-- Adds fields to track contact information sources and verification status
-- Run this migration after the initial schema.sql

-- Add new columns to researchers table for contact enrichment tracking
ALTER TABLE researchers
  ADD COLUMN IF NOT EXISTS email_source VARCHAR(100),        -- Where we got the email: 'pubmed', 'orcid', 'claude_search', 'manual'
  ADD COLUMN IF NOT EXISTS email_year INTEGER,               -- Year of publication where email was found (for recency)
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP,      -- When we last verified the email works
  ADD COLUMN IF NOT EXISTS orcid_url VARCHAR(255),           -- Full ORCID URL for convenience
  ADD COLUMN IF NOT EXISTS google_scholar_url VARCHAR(500),  -- Full Google Scholar profile URL
  ADD COLUMN IF NOT EXISTS faculty_page_url VARCHAR(500),    -- Direct link to faculty/lab page
  ADD COLUMN IF NOT EXISTS contact_enriched_at TIMESTAMP,    -- When we last ran contact enrichment
  ADD COLUMN IF NOT EXISTS contact_enrichment_source VARCHAR(50);  -- Which tier found the contact: 'pubmed', 'orcid', 'claude_search'

-- Add index for looking up researchers with emails
CREATE INDEX IF NOT EXISTS idx_researchers_has_email
  ON researchers((email IS NOT NULL));

-- Add index for contact enrichment freshness
CREATE INDEX IF NOT EXISTS idx_researchers_contact_enriched
  ON researchers(contact_enriched_at);

-- Add index for ORCID lookups
CREATE INDEX IF NOT EXISTS idx_researchers_orcid
  ON researchers(orcid);

-- ============================================
-- Update reviewer_suggestions for outreach tracking
-- ============================================
ALTER TABLE reviewer_suggestions
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP,          -- When invitation email was sent
  ADD COLUMN IF NOT EXISTS email_opened_at TIMESTAMP,        -- If we track opens (future)
  ADD COLUMN IF NOT EXISTS response_received_at TIMESTAMP,   -- When they responded
  ADD COLUMN IF NOT EXISTS response_type VARCHAR(50);        -- 'accepted', 'declined', 'no_response', 'bounced'

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON COLUMN researchers.email_source IS 'Source of email: pubmed, orcid, claude_search, manual';
COMMENT ON COLUMN researchers.email_year IS 'Publication year where email was found (for recency assessment)';
COMMENT ON COLUMN researchers.contact_enrichment_source IS 'Which enrichment tier found the contact info';
COMMENT ON COLUMN reviewer_suggestions.response_type IS 'Reviewer response: accepted, declined, no_response, bounced';
