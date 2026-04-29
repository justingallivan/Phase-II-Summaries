#!/usr/bin/env node
/**
 * One-off: surgically remove `wmkf_requestlookup` from the
 * "Potential Reviewer" main form (formid 54eefe19-7836-4fc3-bdc3-8ff8050e7e99)
 * so the column drop is unblocked. Saves a backup of the original formxml.
 *
 * Two control instances exist on the form:
 *   - body cell — sole child of its row → remove the whole <row>...</row>
 *   - header cell — sibling of other cells → remove just the <cell>...</cell>
 *
 * After PATCH, calls /PublishXml to publish the form change.
 */
const fs = require('fs');
const path = require('path');
const { loadEnvLocal, getAccessToken, createClient } = require('../lib/dataverse/client');

const FORM_ID = '54eefe19-7836-4fc3-bdc3-8ff8050e7e99';

function findCellRange(xml, startMarker) {
  const s = xml.indexOf(startMarker);
  if (s < 0) return null;
  // Walk back to the opening <cell ...
  const cellOpen = xml.lastIndexOf('<cell', s);
  if (cellOpen < 0) return null;
  const cellCloseIdx = xml.indexOf('</cell>', s);
  if (cellCloseIdx < 0) return null;
  return { start: cellOpen, end: cellCloseIdx + '</cell>'.length };
}

function findEnclosingRow(xml, cellStart, cellEnd) {
  // Look for the immediately-preceding <row> that has no other open <cell> between it and our cell.
  const rowOpen = xml.lastIndexOf('<row>', cellStart);
  if (rowOpen < 0) return null;
  const between = xml.slice(rowOpen, cellStart);
  // If another <cell appears between <row> and our cell, this row has siblings — bail out.
  if (between.indexOf('<cell') >= 0) return null;
  const rowClose = xml.indexOf('</row>', cellEnd);
  if (rowClose < 0) return null;
  // If another </cell> appears between our cell and </row>, there are sibling cells after — bail out.
  const afterCell = xml.slice(cellEnd, rowClose);
  if (afterCell.indexOf('<cell') >= 0) return null;
  return { start: rowOpen, end: rowClose + '</row>'.length };
}

function removeBodyCellAndItsRow(xml, marker) {
  const cell = findCellRange(xml, marker);
  if (!cell) throw new Error(`body cell not found for marker: ${marker}`);
  const row = findEnclosingRow(xml, cell.start, cell.end);
  if (row) {
    return xml.slice(0, row.start) + xml.slice(row.end);
  }
  // Sibling cells present — just remove the cell
  return xml.slice(0, cell.start) + xml.slice(cell.end);
}

function removeJustCell(xml, marker) {
  const cell = findCellRange(xml, marker);
  if (!cell) throw new Error(`header cell not found for marker: ${marker}`);
  return xml.slice(0, cell.start) + xml.slice(cell.end);
}

async function main() {
  loadEnvLocal();
  const url = process.env.DYNAMICS_URL;
  const token = await getAccessToken(url);
  const c = createClient({ resourceUrl: url, token });

  console.log(`Fetching form ${FORM_ID} ("Potential Reviewer") …`);
  const r = await c.get(`/systemforms(${FORM_ID})?$select=formxml,name`);
  if (!r.ok) throw new Error(`fetch failed: ${r.status} ${r.text.slice(0, 300)}`);
  const original = r.body.formxml;
  const backupPath = path.resolve('/tmp/form-potential-reviewer-original.xml');
  fs.writeFileSync(backupPath, original);
  console.log(`  backup written to ${backupPath}`);

  console.log(`Removing body cell + its row (datafieldname=wmkf_requestlookup, control id=wmkf_requestlookup) …`);
  let next = removeBodyCellAndItsRow(original, 'control id="wmkf_requestlookup"');

  console.log(`Removing header cell (control id=header_wmkf_requestlookup) …`);
  next = removeJustCell(next, 'control id="header_wmkf_requestlookup"');

  if (next.indexOf('wmkf_requestlookup') >= 0) {
    throw new Error('post-edit XML still contains wmkf_requestlookup — aborting');
  }
  fs.writeFileSync('/tmp/form-potential-reviewer-edited.xml', next);
  console.log(`  edited XML written to /tmp/form-potential-reviewer-edited.xml (${next.length} bytes; was ${original.length})`);

  console.log('Patching form …');
  const patch = await c.patch(`/systemforms(${FORM_ID})`, { formxml: next });
  if (!patch.ok) throw new Error(`patch failed: ${patch.status} ${patch.text.slice(0, 500)}`);
  console.log('  ✓ form updated');

  console.log('Publishing form …');
  const publish = await c.post('/PublishXml', {
    ParameterXml: `<importexportxml><systemforms><systemform>${FORM_ID}</systemform></systemforms></importexportxml>`,
  });
  if (!publish.ok) throw new Error(`publish failed: ${publish.status} ${publish.text.slice(0, 500)}`);
  console.log('  ✓ published');

  console.log('\n═══ Done — column drop should now be unblocked ═══');
}

main().catch((e) => { console.error(e); process.exit(1); });
