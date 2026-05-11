-- Migration 006: Append-only audit trail for staff-initiated policy publishes
-- See docs/atlas/dataverse-wmkf-policy-and-policy-version.md (write paths)
--
-- Records every Publish New Version action against wmkf_policy. We landed
-- on a dedicated Postgres table rather than overloading wmkf_ai_run because
-- (1) wmkf_ai_run.wmkf_ai_Request is a required FK and policy publishes
-- have no akoya_request, and (2) wmkf_ai_tasktype is a closed picklist that
-- can only be extended with a Dataverse metadata write. Codex review
-- (S145) recommended this purpose-named table for current scope, with the
-- option to generalize when a second AI-config admin surface materializes.
--
-- Append-only: no UPDATE or DELETE expected during normal operation. The
-- route writes a "pending" row before the first Dataverse mutation and
-- writes a separate "completed/needs_review/failed" row after, so the
-- audit trail captures intent + outcome even when intermediate writes
-- partially fail. Pairing is by request_id (uuid the route mints).

CREATE TABLE IF NOT EXISTS policy_publish_audit (
  id                SERIAL PRIMARY KEY,
  request_id        TEXT NOT NULL,                       -- uuid minted by the route; pairs pending+final rows
  slot_code         TEXT NOT NULL,                       -- e.g. 'reviewer-coi'
  parent_id         TEXT,                                -- wmkf_policy GUID, captured after slot resolve
  version_label     TEXT NOT NULL,                       -- e.g. '2026-05-10'
  version_id        TEXT,                                -- wmkf_policyversion GUID once created (null on pending)
  prior_version_id  TEXT,                                -- wmkf_policyversion GUID of the version being replaced
  title             TEXT NOT NULL,                       -- audit identifier; full body NOT stored (lives on version row)
  profile_id        INT REFERENCES user_profiles(id),    -- who initiated; null only if requireSuperuser is in dev-bypass mode
  phase             TEXT NOT NULL CHECK (phase IN ('pending', 'final')),
  status            TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'partial', 'already_published', 'concurrency_conflict', 'label_conflict', 'invalid_body', 'slot_not_provisioned', 'duplicate_slot_rows', 'audit_unavailable', 'failed')),
  outcome_json      JSONB,                               -- structured outcome (child created/reused, flipped, retired, etc.) — set on final
  warnings_json     JSONB,                               -- ['audit_finalize_failed', 'prior_retire_failed', ...] — set on final
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_publish_audit_slot ON policy_publish_audit (slot_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_publish_audit_request ON policy_publish_audit (request_id);
CREATE INDEX IF NOT EXISTS idx_policy_publish_audit_created ON policy_publish_audit (created_at DESC);
