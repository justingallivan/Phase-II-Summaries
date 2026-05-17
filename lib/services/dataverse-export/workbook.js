/**
 * Dataverse Power Tools — Track B — Excel artifact writer.
 *
 * ExcelJS (already a dependency). Reuses the chat.js recordsToExcel column /
 * format conventions (header row, prefer _formatted, auto-size capped at 50)
 * but NOT its 3 MB base64 trim guard — that guard is specific to
 * base64-over-SSE, which this plan rejected. The governing ceiling is the
 * 40 MB written-buffer (build plan §3a); exceed ⇒ fail loud with
 * "narrow the filter / fewer opt-in columns", never a truncated file.
 *
 * Two sheets (build plan §3d):
 *   - Data sheet — the default column contract (+ opted-in), per-row
 *     sentinels (never bare blanks), era column, resolved-institution column.
 *   - Methods / Provenance sheet — NON-OPTIONAL. The reproducible methods
 *     section: cutover, appliedRules[] in plain English, sentinel legend,
 *     composition line, roll-up in/out, decline-trifurcation legend,
 *     exclusions applied, institution-clustering caveat, true-total vs
 *     returned, probe-provenance footnotes (tagged).
 */

import ExcelJS from 'exceljs';
import {
  DEFAULT_COLUMNS,
  OPT_IN_COLUMNS,
  ERA_CUTOVER_DATE,
} from './constants.js';
import { SENTINEL } from './disclosure.js';

const XLSX_BYTE_CEILING = 40 * 1024 * 1024; // 40 MB written buffer
const NEVER_BLANK = SENTINEL.AMOUNT_UNKNOWN_NOT_CAPTURED; // 'UNKNOWN — not captured'

class WorkbookError extends Error {
  constructor(message) { super(message); this.name = 'WorkbookError'; }
}

// Resolve one Data-sheet cell. Disclosure sentinels win; then engine-computed
// columns; then _formatted; then raw; then the never-blank sentinel. A bare
// blank is the plausible-wrong-answer ($0 / "no PI" / "resolved") the tool
// exists to prevent — there is no path that emits "".
function cell(row, col) {
  const f = col.field;
  if (row[`${f}__sentinel`] != null) return row[`${f}__sentinel`];
  if (col.piConditional) return row.__pi ?? NEVER_BLANK;
  if (col.liaisonCaption) return row.__primaryContact ?? NEVER_BLANK;
  if (col.viaApplicant) {
    const a = row.__applicant || {};
    const key = f.split('.')[1];
    return nz(a[key] ?? row[`appl_${key}`]);
  }
  if (col.money) {
    const base = row[`${f}_base`];
    if (typeof base === 'number') return base;
    if (typeof row[f] === 'number') return row[f];
    return NEVER_BLANK;
  }
  if (col.lookup) return nz(row[`_${f}_value_formatted`]);
  return nz(row[`${f}_formatted`] ?? row[f]);
}

function nz(v) {
  return v == null || v === '' ? NEVER_BLANK : v;
}

/**
 * @param {object}   args
 * @param {object[]} args.rows      annotate()'d rows
 * @param {object}   args.summary   annotate() summary
 * @param {object}   args.querySpec confirmed spec (column opt-ins)
 * @param {string[]} args.appliedRules  from compile()
 * @param {object}   args.counts    { trueTotal, returned, capped, truncatedByBudget }
 * @returns {Promise<Buffer>}  .xlsx buffer (caller writes it to Vercel Blob)
 */
async function buildWorkbook({ rows, summary, querySpec = {}, appliedRules = [], counts = {} }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'WMKF Dataverse Power Tools — Track B';
  wb.created = new Date();

  // ── Column contract ──
  const optInSel = new Set((querySpec.columns && querySpec.columns.optIn) || []);
  const columns = [
    ...DEFAULT_COLUMNS,
    ...OPT_IN_COLUMNS.filter(c => optInSel.has(c.field)),
  ];
  // Appended disclosure columns (engine-computed; never a raw field).
  const disclosureCols = [
    { field: '__era', label: 'Era (provenance)' },
    { field: '__statusClass', label: 'Status class' },
    { field: 'resolved_institution', label: 'Resolved institution' },
    { field: 'institution_resolution', label: 'Institution resolution' },
    { field: '__declineBucket', label: 'Decline bucket' },
    { field: '__declineReason', label: 'Decline reason / sentinel' },
  ];

  // ── Data sheet ──
  const ws = wb.addWorksheet('Data');
  const header = [...columns.map(c => c.label), ...disclosureCols.map(c => c.label)];
  ws.addRow(header);
  ws.getRow(1).font = { bold: true };

  for (const r of rows) {
    const base = columns.map(c => cell(r, c));
    const dec = r.__decline || {};
    const disc = [
      nz(r.__era),
      nz(r.__statusClass),
      nz(r.resolved_institution),
      nz(r.institution_resolution),
      nz(dec.bucket || 'declined: n/a'),
      nz(dec.value || dec.detail || (dec.bucket ? '—' : NEVER_BLANK)),
    ];
    ws.addRow([...base, ...disc]);
  }

  // Auto-size (chat.js convention: header/first-100 scan, cap 50).
  ws.columns.forEach((col, i) => {
    let maxLen = String(header[i] || '').length;
    let seen = 0;
    ws.eachRow((row, n) => {
      if (n === 1 || seen >= 100) return;
      const v = String(row.getCell(i + 1).value ?? '');
      if (v.length > maxLen) maxLen = v.length;
      seen += 1;
    });
    col.width = Math.min(maxLen + 2, 50);
  });

  // ── Methods / Provenance sheet (NON-OPTIONAL) ──
  const ms = wb.addWorksheet('Methods & Provenance');
  ms.getColumn(1).width = 120;
  const line = (txt = '') => ms.addRow([txt]);
  const head = (txt) => { const row = ms.addRow([txt]); row.font = { bold: true }; };

  head('WMKF Dataverse Power Tools — Track B — Reproducible Methods');
  line(`Generated: ${new Date().toISOString()}`);
  line();

  head('Result composition');
  line(summary.compositionLine);
  const { trueTotal, returned, capped, truncatedByBudget } = counts;
  if (trueTotal != null) {
    line(`True total (FetchXML aggregate count, NEVER OData /$count): ${trueTotal}`);
    line(`Rows in this file: ${returned ?? rows.length}`);
    if (capped || truncatedByBudget || (trueTotal != null && returned != null && returned < trueTotal)) {
      head(`⚠ TRUNCATED — this file is NOT the full result set`);
      line(capped ? '· Row cap reached.' : '');
      line(truncatedByBudget ? '· Time budget (240s) reached.' : '');
      line(`· ${trueTotal} match; narrow by program / year / status / institution.`);
    }
  }
  line();

  head('Era model (creation provenance — NOT a business period)');
  line(`Cutover ${ERA_CUTOVER_DATE}: createdon = ${ERA_CUTOVER_DATE} ⇒ migrated `
    + `(Blackbaud/"Sky"); createdon > ${ERA_CUTOVER_DATE} ⇒ Akoya-native. `
    + `Business history is sliced on akoya_decisiondate, NEVER createdon.`);
  line();

  head('Filters & rules applied (plain English)');
  for (const r of appliedRules) line(`· ${r}`);
  line();

  if (summary.programRollup) {
    head('Program roll-up — Option B (Program-type rows only; others reported separately)');
    for (const l of summary.programRollup.lines) line(`· ${l.line}`);
    line();
  }

  head('Decline trifurcation');
  for (const [bucket, n] of Object.entries(summary.declineTrifurcation || {})) {
    line(`· ${bucket}: ${n}`);
  }
  line('Era-aware: migrated → akoya_denialreason (Picklist); native → '
    + 'wmkf_denialnotes (Memo); SoCal-area programs additionally read '
    + 'wmkf_socalreasonsfordecline2. Doc-resident rationale (Puzzle 2c) is a '
    + 'retrieval link only — extraction is a deferred phase.');
  line();

  head('Primary Contact — mandatory caption');
  line(summary.primaryContactCaption);
  line();

  head('Institution clustering caveat');
  line('Deterministic exact normalized-key only, NOT entity resolution. '
    + 'Normalize(): NFKD + strip diacritics → lowercase → strip trailing legal '
    + 'suffixes {inc,llc,ltd,corp,co,foundation,fdn,trust,fund} → strip leading '
    + '"the" → expand {univ/u→university, inst→institute} → strip non-alphanumeric '
    + '→ collapse spaces. Key precedence: wmkf_legalname → akoya_aka → name. '
    + 'Distinct keys are NEVER fuzzy-merged in v1 (a learned merge is Phase-2).');
  line();

  head('Sentinel legend (no cell is ever a bare blank)');
  for (const [k, v] of Object.entries(summary.sentinels || SENTINEL)) line(`· ${k}: "${v}"`);
  line();

  if (summary.unclassifiedSets && summary.unclassifiedSets.length) {
    head('Unclassified sets (Living-taxonomy — included, flagged, NOT interpreted)');
    for (const u of summary.unclassifiedSets) line(`· ${u}`);
    line();
  }

  if (summary.failLoud && summary.failLoud.length) {
    head('⚠ FAIL-LOUD conditions — manual review required (NOT silently handled)');
    for (const fl of summary.failLoud) line(`· ${fl}`);
    line();
  }

  head('Probe provenance (probe-substantiated vs user-attested — tagged)');
  for (const p of summary.provenance || []) line(`· ${p}`);

  // ── Serialize + enforce the 40 MB ceiling (loud, not a truncated file) ──
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  if (buf.byteLength > XLSX_BYTE_CEILING) {
    throw new WorkbookError(
      `Workbook is ${(buf.byteLength / 1024 / 1024).toFixed(1)} MB, over the `
      + `40 MB ceiling. Narrow the filter or drop opt-in columns — refusing to `
      + `emit a truncated file that looks complete.`);
  }
  return buf;
}

export { buildWorkbook, WorkbookError, XLSX_BYTE_CEILING };
