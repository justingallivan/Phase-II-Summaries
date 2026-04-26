/**
 * Deterministic redaction for log strings that leave the system boundary
 * (e.g., sent to Claude for analysis or stored in alert metadata visible to
 * less-privileged readers). Conservative: drops anything that looks like a
 * credential, even if it costs some signal in the output.
 *
 * Added in the 2026-04-26 security pass — Codex flagged that the
 * /api/cron/log-analysis cron sent up to 50 raw error log lines to Claude
 * with no redaction. Apply via redactLogText(str) before constructing
 * prompts or alert payloads.
 *
 * Patterns covered (in priority order — earlier rules win on overlap):
 *   1. Authorization / Bearer headers
 *   2. Cookie headers
 *   3. Anthropic API keys      (sk-ant-…)
 *   4. Generic API key prefixes (sk-…, AKIA…, AIza…, etc.)
 *   5. Database connection strings (postgres://, mysql://, mongodb+srv://, …)
 *   6. SerpAPI / NCBI / ORCID styled keys (alphanumeric ≥32)
 *   7. Public Vercel Blob URLs (anyone-with-link readable)
 *   8. password / pwd / secret KEY=VALUE patterns
 *   9. Email addresses
 */

const REDACT_RULES = [
  // 1 — Bearer tokens (must run before generic Authorization rule so the
  //     token after "Bearer " is consumed, not just the literal "Bearer".)
  { pattern: /\bBearer\s+[A-Za-z0-9_\-.~+/=]+/gi, replacement: 'Bearer [REDACTED]' },
  // 1b — Authorization / x-api-key headers without Bearer prefix
  { pattern: /\b(authorization|x-api-key)\s*[:=]\s*["']?[A-Za-z0-9_\-.~+/=]+["']?/gi, replacement: '$1=[REDACTED]' },

  // 2 — Cookies
  { pattern: /\bcookie\s*[:=]\s*[^\s;,]+/gi, replacement: 'cookie=[REDACTED]' },
  { pattern: /\b(next-auth\.session-token|__Secure-next-auth\.session-token|__Host-next-auth\.session-token)=[^;,\s]+/gi, replacement: '$1=[REDACTED]' },

  // 3 — Anthropic keys (most specific first)
  { pattern: /sk-ant-[A-Za-z0-9_\-]{20,}/g, replacement: '[REDACTED:anthropic-key]' },

  // 4 — Generic API-key shapes
  { pattern: /\bsk-[A-Za-z0-9_\-]{20,}/g, replacement: '[REDACTED:api-key]' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: '[REDACTED:aws-access-key]' },
  { pattern: /\bAIza[0-9A-Za-z_\-]{30,}\b/g, replacement: '[REDACTED:google-api-key]' },

  // 5 — Connection strings
  { pattern: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|rediss):\/\/[^\s'"<>]+/gi, replacement: '[REDACTED:connection-string]' },

  // 6 — Long opaque tokens (≥32 chars of base62/hex). Catches SerpAPI,
  // NCBI, ORCID-secret patterns. Skip when surrounded by hyphens (UUID
  // segments) — UUIDs are typically not secret.
  { pattern: /(?<![A-Za-z0-9-])[A-Za-z0-9]{40,}(?![A-Za-z0-9-])/g, replacement: '[REDACTED:long-token]' },

  // 7 — Public Vercel Blob URLs
  { pattern: /https?:\/\/[A-Za-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^\s'"<>]+/gi, replacement: '[REDACTED:blob-url]' },

  // 8 — password=... / pwd=... / secret=... key/value pairs
  { pattern: /\b(password|passwd|pwd|secret|token)\s*[:=]\s*["']?[^\s,;"']+["']?/gi, replacement: '$1=[REDACTED]' },

  // 9 — Email addresses (last so it doesn't shadow domain-y fragments inside earlier rules)
  { pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, replacement: '[REDACTED:email]' },
];

/**
 * Redact a string in-place against all rules.
 *
 * @param {unknown} input
 * @returns {string} redacted string (empty string if input is null/undefined)
 */
export function redactLogText(input) {
  if (input == null) return '';
  let out = typeof input === 'string' ? input : String(input);
  for (const { pattern, replacement } of REDACT_RULES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Redact each {message, path, ...} object in an errors array.
 * Preserves shape, only string fields are redacted.
 */
export function redactErrorList(errors) {
  if (!Array.isArray(errors)) return [];
  return errors.map((e) => {
    const out = { ...e };
    if (typeof out.message === 'string') out.message = redactLogText(out.message);
    if (typeof out.path === 'string') out.path = redactLogText(out.path);
    return out;
  });
}
