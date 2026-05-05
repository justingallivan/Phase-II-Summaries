/**
 * Helpers for constructing explicit external-AI text payload boundaries.
 *
 * The point is not to decide whether a staff workflow is allowed to use the
 * data. The point is to make the code boundary obvious: what source text was
 * considered, how much could be sent, and whether the transmitted text was
 * truncated before leaving our application boundary.
 */

export const DATA_CLASSES = Object.freeze({
  PROPOSAL_TEXT: 'proposal_text',
  GRANT_REPORT_TEXT: 'grant_report_text',
  CRM_RECORD_TEXT: 'crm_record_text',
  REVIEW_TEXT: 'review_text',
  STAFF_PROVIDED_CONTEXT: 'staff_provided_context',
});

export const REVIEWER_FINDER_PROPOSAL_MAX_CHARS = 100_000;
export const BATCH_PHASE_II_PROPOSAL_MAX_CHARS = 100_000;
export const BATCH_PHASE_I_PROPOSAL_MAX_CHARS = 100_000;
export const PHASE_I_WRITEUP_PROPOSAL_MAX_CHARS = 100_000;
export const QA_PROPOSAL_CONTEXT_MAX_CHARS = 80_000;
export const FUNDING_GAP_PROPOSAL_MAX_CHARS = 100_000;
// Virtual Review Panel — bounded once at the route boundary; the same bounded
// text propagates to every stage (intelligence pass, claim verification,
// structured review, devil's advocate) across every configured provider, so a
// single helper application covers all downstream prompt builders.
export const VIRTUAL_REVIEW_PANEL_PROPOSAL_MAX_CHARS = 100_000;
// /api/process-legacy keeps the original asymmetric cap split (15k summary vs
// 10k extraction) so its current effective behavior is preserved exactly.
export const LEGACY_BATCH_SUMMARY_MAX_CHARS = 15_000;
export const LEGACY_BATCH_EXTRACTION_MAX_CHARS = 10_000;
// Grant reporting (extract + regenerate + goals assessment). Prompts had no
// internal truncation; the boundary helper is the first explicit cap on this
// path. Caps match the rest of the codebase's high-volume pattern.
export const GRANT_REPORTING_REPORT_MAX_CHARS = 100_000;
export const GRANT_REPORTING_PROPOSAL_MAX_CHARS = 100_000;

export function buildBoundedTextPayload({
  text,
  source,
  dataClass,
  maxChars,
  truncationMarker = null,
}) {
  if (!source) throw new Error('buildBoundedTextPayload: source is required');
  if (!dataClass) throw new Error('buildBoundedTextPayload: dataClass is required');
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new Error('buildBoundedTextPayload: maxChars must be a positive integer');
  }

  const originalText = text == null ? '' : String(text);
  const originalChars = originalText.length;
  const marker = truncationMarker || `\n\n[...truncated at ${maxChars} chars by AI payload boundary: ${source}...]`;

  let boundedText = originalText;
  let truncated = false;

  if (originalChars > maxChars) {
    truncated = true;
    if (marker.length >= maxChars) {
      boundedText = marker.slice(0, maxChars);
    } else {
      boundedText = originalText.slice(0, maxChars - marker.length) + marker;
    }
  }

  return {
    text: boundedText,
    metadata: {
      source,
      dataClass,
      maxChars,
      originalChars,
      transmittedChars: boundedText.length,
      truncated,
      truncationMarker: truncated ? marker : null,
    },
  };
}
