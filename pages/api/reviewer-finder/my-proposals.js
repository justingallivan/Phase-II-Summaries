/**
 * API: /api/reviewer-finder/my-proposals
 *
 * Surfaces akoya_request rows assigned to the authenticated user as program
 * director (`wmkf_programdirector` lookup → systemuser). Replaces the PDF-
 * upload entry path for Reviewer Finder.
 *
 * GET (no cycleCode): returns distinct cycle codes (Jxx/Dxx) the current PD
 *   has proposals in, newest first.
 * GET ?cycleCode=Jxx: returns the proposals in that cycle.
 *
 * Filter: `_wmkf_programdirector_value eq {systemuserId}` — primary PD only.
 *   `wmkf_programdirector2` (secondary) does not assign reviewers; see memory
 *   `project_akoya_request_pd_fields.md`.
 */

import { requireAppAccess } from '../../../lib/utils/auth';
import { DynamicsService } from '../../../lib/services/dynamics-service';
import { resolveByEmail } from '../../../lib/services/program-director-resolver';
import { meetingDateToCycleCode, cycleCodeToOdataFilter } from '../../../lib/utils/cycle-code';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const access = await requireAppAccess(req, res, 'reviewer-finder');
  if (!access) return;

  const azureEmail = access.session?.user?.azureEmail;
  if (!azureEmail) {
    return res.status(400).json({
      error: 'Could not determine your email from the session. Sign out and back in.',
    });
  }

  // Read-only Dynamics queries; bypass field/table restrictions for this trusted endpoint.
  DynamicsService.bypassRestrictions('reviewer-finder-my-proposals');

  try {
    const pd = await resolveByEmail(azureEmail);
    if (!pd) {
      return res.status(404).json({
        error: `No active Dynamics systemuser found for ${azureEmail}.`,
      });
    }

    const { cycleCode } = req.query;

    if (!cycleCode) {
      return await listCycles(res, pd);
    }
    return await listProposalsInCycle(res, pd, String(cycleCode));
  } catch (err) {
    console.error('my-proposals error:', err);
    return res.status(500).json({
      error: 'Failed to load proposals',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}

async function listCycles(res, pd) {
  // Pull all PD-owned proposals (just meeting dates) and dedupe to cycle codes.
  // Per Justin: ~6 proposals per cycle per PD, so even across all history
  // this is a small set. Filter out rows with no meeting date or non-J/D months.
  const filter = `_wmkf_programdirector_value eq ${pd.systemuserid} and wmkf_meetingdate ne null`;
  const { records } = await DynamicsService.queryAllRecords('akoya_requests', {
    select: 'akoya_requestid,wmkf_meetingdate',
    filter,
    orderby: 'wmkf_meetingdate desc',
  });

  const seen = new Map(); // code → { code, year, month, count, latestMeetingDate }
  for (const r of records) {
    const code = meetingDateToCycleCode(r.wmkf_meetingdate);
    if (!code) continue;
    const existing = seen.get(code);
    if (existing) {
      existing.count += 1;
    } else {
      const d = new Date(r.wmkf_meetingdate);
      seen.set(code, {
        code,
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        count: 1,
        latestMeetingDate: r.wmkf_meetingdate,
      });
    }
  }

  const cycles = Array.from(seen.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  return res.status(200).json({
    success: true,
    programDirector: { systemuserid: pd.systemuserid, fullName: pd.fullName },
    cycles,
  });
}

async function listProposalsInCycle(res, pd, cycleCode) {
  const cycleFilter = cycleCodeToOdataFilter(cycleCode);
  if (!cycleFilter) {
    return res.status(400).json({ error: `Invalid cycleCode: ${cycleCode}` });
  }

  const filter = `_wmkf_programdirector_value eq ${pd.systemuserid} and ${cycleFilter}`;
  const { records } = await DynamicsService.queryAllRecords('akoya_requests', {
    select: [
      'akoya_requestid',
      'akoya_requestnum',
      'wmkf_meetingdate',
      'wmkf_abstract',
      'akoya_requeststatus',
      'wmkf_phaseiistatus',
      '_akoya_applicantid_value',
      '_wmkf_projectleader_value',
      '_wmkf_grantprogram_value',
      '_wmkf_programareaserved_value',
      '_wmkf_potentialreviewer1_value',
      '_wmkf_potentialreviewer2_value',
      '_wmkf_potentialreviewer3_value',
      '_wmkf_potentialreviewer4_value',
      '_wmkf_potentialreviewer5_value',
    ].join(','),
    filter,
    orderby: 'wmkf_meetingdate asc',
  });

  const proposals = records.map((r) => {
    const slotsFilled = ['1', '2', '3', '4', '5'].filter(
      (n) => r[`_wmkf_potentialreviewer${n}_value`]
    ).length;
    return {
      requestId: r.akoya_requestid,
      requestNumber: r.akoya_requestnum,
      meetingDate: r.wmkf_meetingdate,
      meetingDateFormatted: r.wmkf_meetingdate_formatted || null,
      abstract: r.wmkf_abstract || null,
      requestStatus: r.akoya_requeststatus || null,
      phaseIIStatus: r.wmkf_phaseiistatus_formatted || null,
      applicant: r._akoya_applicantid_value_formatted || null,
      projectLeader: r._wmkf_projectleader_value_formatted || null,
      grantProgram: r._wmkf_grantprogram_value_formatted || null,
      programArea: r._wmkf_programareaserved_value_formatted || null,
      reviewerSlotsFilled: slotsFilled,
      reviewerSlotsTotal: 5,
    };
  });

  return res.status(200).json({
    success: true,
    programDirector: { systemuserid: pd.systemuserid, fullName: pd.fullName },
    cycleCode: cycleCode.toUpperCase(),
    proposals,
  });
}
