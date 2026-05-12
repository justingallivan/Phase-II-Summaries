/**
 * Researcher name normalization helper.
 *
 * Originally lived on `lib/services/database-service.js#normalizeName`
 * where it was used to compute the Postgres `researchers.normalized_name`
 * column for keyed lookups. Extracted to a util as part of W5 caller
 * migration so `deduplication-service.js` and other consumers can drop
 * the `DatabaseService` dependency.
 *
 * Behavior: lowercase, strip non-alpha, collapse whitespace, trim. Stable
 * across the Postgres-era and Dataverse-era flows since it's pure string
 * manipulation.
 */
export function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
