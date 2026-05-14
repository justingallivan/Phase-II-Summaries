-- Migration 009: Intake Portal submission jobs queue
-- See docs/INTAKE_PORTAL_DESIGN.md § "Submission lifecycle — async jobs, not synchronous Dynamics writes"
--
-- submission_jobs holds one row per applicant submit click. The /api/intake/submit
-- endpoint INSERTs (idempotency-keyed), returns immediately, and a Vercel Cron
-- drain (/api/cron/drain-submissions, ~1-2 min) advances each row through the
-- state machine one step per tick. Rationale: Dynamics + Graph rate limits make
-- synchronous externalization fragile at burst-submit times.
--
-- Idempotency: the client generates a UUID per submit click; INSERT...ON CONFLICT
-- (idempotency_key) DO NOTHING collapses double-clicks and retries to one job row.
--
-- Frozen payload: payload JSONB is the validated draft snapshot at submit time.
-- The drain consumes only payload, never re-reads intake_drafts — so draft edits
-- after submit do not affect the in-flight job.

CREATE TABLE IF NOT EXISTS submission_jobs (
  id                SERIAL PRIMARY KEY,
  idempotency_key   TEXT NOT NULL UNIQUE,                  -- client-generated UUID per submit click
  draft_id          INTEGER NOT NULL REFERENCES intake_drafts(id),
  contact_oid       TEXT NOT NULL,                         -- Entra External ID OID
  account_id        TEXT NOT NULL,                         -- Dynamics account GUID
  request_id        TEXT NOT NULL,                         -- Dynamics akoya_request GUID
  form_key          TEXT NOT NULL,                         -- e.g. 'phase-ii-research-2026-06'
  status            TEXT NOT NULL DEFAULT 'queued',
  payload           JSONB NOT NULL,                        -- frozen snapshot of validated draft
  sharepoint_paths  JSONB NOT NULL DEFAULT '[]'::jsonb,    -- written paths so retry doesn't duplicate
  dynamics_patches  JSONB NOT NULL DEFAULT '{}'::jsonb,    -- which writes have already landed
  attempts          INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,

  CONSTRAINT submission_jobs_status_check CHECK (status IN (
    'queued',
    'scanning',
    'files_moved',
    'dynamics_patched',
    'status_flipped',
    'completed',
    'failed',
    'cancelled'
  )),
  CONSTRAINT submission_jobs_attempts_nonneg CHECK (attempts >= 0),
  CONSTRAINT submission_jobs_completed_when_terminal CHECK (
    (status IN ('completed', 'failed', 'cancelled')) = (completed_at IS NOT NULL)
  )
);

-- Drain query: pick up to N active jobs ready to run, ordered FIFO.
-- Partial index keeps it small even after thousands of completed jobs accumulate.
CREATE INDEX IF NOT EXISTS idx_submission_jobs_active_ready
  ON submission_jobs (next_attempt_at, created_at)
  WHERE status NOT IN ('completed', 'failed', 'cancelled');

-- Back-references for admin views and per-request serialization lookups.
CREATE INDEX IF NOT EXISTS idx_submission_jobs_draft ON submission_jobs(draft_id);
CREATE INDEX IF NOT EXISTS idx_submission_jobs_request ON submission_jobs(request_id);
CREATE INDEX IF NOT EXISTS idx_submission_jobs_account ON submission_jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_submission_jobs_contact ON submission_jobs(contact_oid);
CREATE INDEX IF NOT EXISTS idx_submission_jobs_status ON submission_jobs(status);
CREATE INDEX IF NOT EXISTS idx_submission_jobs_created ON submission_jobs(created_at DESC);

COMMENT ON TABLE submission_jobs IS 'Applicant intake portal: async submission queue drained by /api/cron/drain-submissions. One row per submit click (idempotency-keyed). Frozen payload snapshot ensures draft edits after submit cannot mutate in-flight jobs.';
COMMENT ON COLUMN submission_jobs.idempotency_key IS 'Client-generated UUID per submit attempt. INSERT...ON CONFLICT DO NOTHING collapses double-clicks/retries to one row.';
COMMENT ON COLUMN submission_jobs.payload IS 'Validated draft snapshot at submit time. Drain reads this, never intake_drafts.draft_json.';
COMMENT ON COLUMN submission_jobs.sharepoint_paths IS 'Array of {filename, sharepoint_path, sha256, library} entries appended as each file moves. Retry skips entries already present.';
COMMENT ON COLUMN submission_jobs.dynamics_patches IS 'Map of {entity_logical_name: [recordIds...]} for writes that have landed. Retry skips already-written records.';
