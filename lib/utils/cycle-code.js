/**
 * Grant cycle code helpers.
 *
 * The Foundation's board meets twice a year — June and December. The specific
 * day shifts cycle to cycle but the month is fixed. Cycle code derives from
 * the meeting date: June → `J{YY}`, December → `D{YY}` (e.g., a meeting on
 * 2026-06-04 → `J26`).
 *
 * Months other than June/December map to `null`. Callers should treat any
 * proposal with a meeting date outside those months as not having a cycle.
 */

const JUNE = 6;
const DECEMBER = 12;

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Convert a Meeting Date (Date or ISO string) to a cycle code.
 * @returns {string|null} e.g. 'J26', 'D26', or null if the month isn't June/December
 */
export function meetingDateToCycleCode(meetingDate) {
  if (!meetingDate) return null;
  const d = meetingDate instanceof Date ? meetingDate : new Date(meetingDate);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.getUTCMonth() + 1;
  const yy = d.getUTCFullYear() % 100;
  if (month === JUNE) return `J${pad2(yy)}`;
  if (month === DECEMBER) return `D${pad2(yy)}`;
  return null;
}

/**
 * Parse a cycle code into its components.
 * @returns {{ month: 6|12, year: number }|null}
 */
export function parseCycleCode(code) {
  if (!code || typeof code !== 'string') return null;
  const m = code.trim().toUpperCase().match(/^([JD])(\d{2})$/);
  if (!m) return null;
  const month = m[1] === 'J' ? JUNE : DECEMBER;
  const yy = parseInt(m[2], 10);
  // 2-digit year: assume current century. Foundation founded 2024, so anything 00-99 lands in 2000s.
  const year = 2000 + yy;
  return { month, year };
}

/**
 * Build OData $filter range fragment for a cycle code's meeting-date window.
 * Uses an exclusive upper bound to be safe across timezones.
 *
 * @param {string} code - cycle code like 'J26' / 'D26'
 * @param {string} field - field name to filter on (default 'wmkf_meetingdate')
 * @returns {string|null} fragment like
 *   "wmkf_meetingdate ge 2026-06-01T00:00:00Z and wmkf_meetingdate lt 2026-07-01T00:00:00Z"
 */
/**
 * Render a cycle code as a display label.
 * J26 → "June 2026", D26 → "December 2026". Returns null for invalid input.
 */
export function cycleCodeToLabel(code) {
  const parsed = parseCycleCode(code);
  if (!parsed) return null;
  const monthName = parsed.month === JUNE ? 'June' : 'December';
  return `${monthName} ${parsed.year}`;
}

export function cycleCodeToOdataFilter(code, field = 'wmkf_meetingdate') {
  const parsed = parseCycleCode(code);
  if (!parsed) return null;
  const { month, year } = parsed;
  const start = `${year}-${pad2(month)}-01T00:00:00Z`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${pad2(nextMonth)}-01T00:00:00Z`;
  return `${field} ge ${start} and ${field} lt ${end}`;
}
