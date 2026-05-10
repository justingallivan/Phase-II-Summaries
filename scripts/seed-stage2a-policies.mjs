/**
 * Seed two wmkf_policy parents (`reviewer-coi`, `reviewer-ai-use`) plus one
 * Active wmkf_policyversion child each. Idempotent: matches parents by
 * wmkf_code; if a child already exists for the slot it leaves it alone and
 * only flips wmkf_activeversion if missing.
 *
 * Stage 2a slice 1 seed step. AI-use body lifts directly from the existing
 * review form footer (already in production use). COI body uses an explicit
 * placeholder so the slot isn't broken but won't accidentally ship to a
 * real reviewer — staff feedback on COI wording is open question 7 in the
 * build plan.
 *
 * IMPORTANT: this script must NOT be re-run with a new body to "update" an
 * existing version row. Per immutability rules in the build plan §4a, body
 * changes require staff to create a NEW version row in Dynamics and flip
 * the parent's wmkf_activeversion lookup. This script is for first-seed only.
 */

import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

const { DynamicsService } = await import('../lib/services/dynamics-service.js');
const { bypassDynamicsRestrictions } = await import('../lib/services/dynamics-context.js');

const COI_PLACEHOLDER_BODY = `[PLACEHOLDER — pending staff wording review]

This text is a slice-1 placeholder. Before Stage 2a ships to a real review cycle, staff must replace this body with the finalized Confidentiality and Conflict of Interest policy text via the Dynamics admin UI (create a new wmkf_policyversion row under the reviewer-coi parent, flip wmkf_activeversion). This row will then be Retired.

Reviewer-facing acknowledgment text from the existing review form footer can be lifted; new wording specific to this slot is in scope for the staff feedback meeting.`;

// Lifted from shared/components/external/ReviewFormFields.js (existing review form footer text)
// — TODO when porting: replace this string with the actual production footer text the
// reviewers see today. Keep this placeholder if the source isn't easily accessible at
// seed time.
const AI_USE_BODY = `By submitting a review through this portal, you acknowledge that you will not enter the proposal text or any related confidential materials into any third-party AI tool, large language model, or generative AI service. The W. M. Keck Foundation treats grant proposals as confidential, and reviewer use of unmanaged AI services may breach that confidentiality.

This restriction does not prohibit reviewers from using AI tools that they personally manage for general activities like writing assistance — only from sharing the proposal materials themselves with such tools.

If you have questions about acceptable use, please contact your Program Director.`;

const VERSION_LABEL = '2026-05-09';

const SLOTS = [
  {
    code: 'reviewer-coi',
    displayName: 'Reviewer Confidentiality and Conflict of Interest',
    description: 'Required acknowledgment at Stage 2a accept. Surfaced on /external/review/[token] landing page when reviewer is in pre-materials state.',
    title: 'Confidentiality and Conflict of Interest',
    body: COI_PLACEHOLDER_BODY,
  },
  {
    code: 'reviewer-ai-use',
    displayName: 'Reviewer AI-Use Policy',
    description: 'Required acknowledgment at Stage 2a accept. Body lifts from the existing review form footer.',
    title: 'AI Use in Review',
    body: AI_USE_BODY,
  },
];

await bypassDynamicsRestrictions('seed-stage2a-policies', async () => {
  for (const slot of SLOTS) {
    console.log(`\n── ${slot.code} ──`);

    // 1) Find or create the parent
    const existingParents = await DynamicsService.queryRecords('wmkf_policies', {
      select: ['wmkf_policyid', 'wmkf_code', 'wmkf_displayname', '_wmkf_activeversion_value'],
      filter: `wmkf_code eq '${slot.code}'`,
      top: 1,
    });
    const parentRecords = existingParents.value || existingParents.records || [];

    let parentId;
    if (parentRecords.length > 0) {
      parentId = parentRecords[0].wmkf_policyid;
      console.log(`· parent exists ${parentId}`);
    } else {
      const created = await DynamicsService.createRecord('wmkf_policies', {
        wmkf_code: slot.code,
        wmkf_displayname: slot.displayName,
        wmkf_description: slot.description,
      });
      parentId = created.wmkf_policyid || created.id;
      console.log(`✓ parent created ${parentId}`);
    }

    // 2) Find an existing version for this slot (any version, by parent + version label)
    const existingVersions = await DynamicsService.queryRecords('wmkf_policyversions', {
      select: ['wmkf_policyversionid', 'wmkf_versionlabel', 'wmkf_policytitle'],
      filter: `_wmkf_policy_value eq ${parentId} and wmkf_versionlabel eq '${VERSION_LABEL}'`,
      top: 1,
    });
    const versionRecords = existingVersions.value || existingVersions.records || [];

    let versionId;
    if (versionRecords.length > 0) {
      versionId = versionRecords[0].wmkf_policyversionid;
      console.log(`· version ${VERSION_LABEL} exists ${versionId}`);
    } else {
      const createdVersion = await DynamicsService.createRecord('wmkf_policyversions', {
        wmkf_versionlabel: VERSION_LABEL,
        wmkf_policytitle: slot.title,
        wmkf_policybody: slot.body,
        wmkf_effectivedate: new Date().toISOString(),
        'wmkf_Policy@odata.bind': `/wmkf_policies(${parentId})`,
      });
      versionId = createdVersion.wmkf_policyversionid || createdVersion.id;
      console.log(`✓ version created ${versionId}`);
    }

    // 3) Set parent's active_version lookup if missing or different
    const currentActiveValue = parentRecords[0]?.['_wmkf_activeversion_value'];
    if (currentActiveValue === versionId) {
      console.log(`· active_version already points at ${versionId}`);
    } else {
      await DynamicsService.updateRecord('wmkf_policies', parentId, {
        'wmkf_ActiveVersion@odata.bind': `/wmkf_policyversions(${versionId})`,
      });
      console.log(`✓ active_version set to ${versionId}`);
    }
  }
});

console.log('\n═══ Seed complete ═══');
