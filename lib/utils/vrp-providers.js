/**
 * Virtual Review Panel provider allowlist resolver.
 *
 * `MultiLLMService.getAvailableProviders()` reports any provider whose API key
 * env var is set. That's the right surface for "is this provider configured at
 * all," but it ties VRP's vendor exposure to the presence of a key — so adding
 * `PERPLEXITY_API_KEY` for some other purpose silently broadens what VRP can
 * send proposal text to.
 *
 * `VRP_ALLOWED_PROVIDERS` (comma-separated) is the explicit operational gate.
 * In production, unset = empty allowlist (fail closed) — the operator must opt
 * in to a vendor set. In dev/test, unset preserves backward-compat (any
 * configured provider). When set, the allowed set is the intersection of the
 * env list and the configured-and-keyed providers.
 */

const VALID_PROVIDERS = new Set(['claude', 'openai', 'gemini', 'perplexity']);

export function resolveAllowedProviders(availableProviders) {
  const available = Array.isArray(availableProviders) ? availableProviders : [];
  const raw = process.env.VRP_ALLOWED_PROVIDERS;

  if (!raw) {
    if (process.env.NODE_ENV === 'production') return [];
    return available;
  }

  const allowlist = raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .filter(p => VALID_PROVIDERS.has(p));

  return available.filter(p => allowlist.includes(p));
}
