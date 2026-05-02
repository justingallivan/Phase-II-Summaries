/**
 * Single source of truth for which SharePoint subfolder(s) under a request
 * are considered "shared with the external reviewer."
 *
 * Why this exists: the file-list endpoint and the file-download endpoint
 * both need to enforce the same rule, and the rule is a process decision
 * (which Connor's PowerAutomate flow ultimately drives) rather than a
 * code one. Centralizing it lets us:
 *
 *   - swap the folder name without touching either endpoint,
 *   - support a transition period where both old and new names work,
 *   - override per-environment via REVIEWER_MATERIALS_FOLDERS without a
 *     redeploy if Connor renames the folder mid-cycle.
 *
 * Default: `Reviewer_Downloads` (single folder, paired with
 * `Reviewer_Uploads` on the inbound side). Override with a
 * comma-separated list:
 *
 *   REVIEWER_MATERIALS_FOLDERS=Reviewer_Downloads,Reviewer_Materials
 *
 * Matching is folder-name only (not full path), case-insensitive,
 * accepts the folder anywhere in the path so staff can nest subfolders
 * under it (e.g. `Reviewer_Materials/Phase II/`). The regex is anchored
 * on segment boundaries so a folder named `My_Reviewer_Materials_v2`
 * does NOT match.
 */

const DEFAULT_FOLDERS = ['Reviewer_Downloads'];

function loadFolders() {
  const raw = process.env.REVIEWER_MATERIALS_FOLDERS;
  if (!raw) return DEFAULT_FOLDERS;
  const list = raw.split(',').map(s => s.trim()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_FOLDERS;
}

/**
 * Build the matcher from the current env. Done lazily (on each call)
 * rather than at module-load time so dev hot-reload picks up env edits.
 */
function buildMatcher() {
  const folders = loadFolders();
  // Escape regex metacharacters in folder names; join with | for the
  // alternation. Anchors: start-of-string OR slash, then folder, then
  // slash OR end-of-string.
  const escaped = folders.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(^|/)(${escaped.join('|')})(/|$)`, 'i');
}

/**
 * @param {string} folderPath - Path within the SharePoint library, as
 *   returned by GraphService.listFiles (no leading slash).
 * @returns {boolean} true if the file lives under one of the
 *   reviewer-shared folders.
 */
export function isReviewerMaterial(folderPath) {
  if (typeof folderPath !== 'string' || !folderPath) return false;
  return buildMatcher().test(folderPath);
}

/**
 * Exposed for the few places that want to log or display the configured
 * folder names (e.g. error messages, admin diagnostics).
 */
export function getReviewerMaterialFolders() {
  return loadFolders();
}
