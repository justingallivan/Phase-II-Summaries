-- ============================================
-- Migration 003: Virtual Review Panel
-- ============================================
-- Adds tables for multi-LLM virtual review panel.
-- panel_reviews tracks each review session (one per proposal).
-- panel_review_items tracks individual LLM responses per stage.

-- One row per proposal review session
CREATE TABLE IF NOT EXISTS panel_reviews (
  id SERIAL PRIMARY KEY,
  user_profile_id INTEGER REFERENCES user_profiles(id),
  proposal_title TEXT,
  proposal_filename VARCHAR(255),
  proposal_text_hash VARCHAR(64),
  status VARCHAR(50) DEFAULT 'pending',
  current_stage VARCHAR(50),
  config JSONB,
  panel_summary JSONB,
  total_cost_cents NUMERIC(10,4),
  cost_breakdown JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE panel_reviews IS 'Virtual Review Panel: one row per proposal review session';
COMMENT ON COLUMN panel_reviews.status IS 'pending, in_progress, completed, failed';
COMMENT ON COLUMN panel_reviews.current_stage IS 'claim_verification, structured_review, synthesis';
COMMENT ON COLUMN panel_reviews.config IS 'Which LLMs enabled, model overrides, stage config';
COMMENT ON COLUMN panel_reviews.panel_summary IS 'Final Claude synthesis: consensus, disagreements, questions';
COMMENT ON COLUMN panel_reviews.cost_breakdown IS 'Per-provider cost breakdown: { claude: X, openai: Y, ... }';

-- One row per LLM per stage
CREATE TABLE IF NOT EXISTS panel_review_items (
  id SERIAL PRIMARY KEY,
  panel_review_id INTEGER REFERENCES panel_reviews(id) ON DELETE CASCADE,
  llm_provider VARCHAR(50) NOT NULL,
  llm_model VARCHAR(100) NOT NULL,
  stage VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  raw_response TEXT,
  parsed_response JSONB,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_cents NUMERIC(10,4),
  latency_ms INTEGER,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE panel_review_items IS 'Virtual Review Panel: one row per LLM per stage';
COMMENT ON COLUMN panel_review_items.llm_provider IS 'claude, openai, gemini, perplexity';
COMMENT ON COLUMN panel_review_items.stage IS 'claim_verification, structured_review';
COMMENT ON COLUMN panel_review_items.parsed_response IS 'Structured JSON matching reviewer form schema';

CREATE INDEX IF NOT EXISTS idx_panel_reviews_user ON panel_reviews(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_panel_reviews_status ON panel_reviews(status);
CREATE INDEX IF NOT EXISTS idx_panel_review_items_panel ON panel_review_items(panel_review_id);
CREATE INDEX IF NOT EXISTS idx_panel_review_items_provider ON panel_review_items(llm_provider, stage);
