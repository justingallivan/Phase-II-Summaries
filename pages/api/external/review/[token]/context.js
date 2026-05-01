/**
 * GET /api/external/review/[token]/context
 *
 * Public endpoint (allowlisted in middleware). Verifies the magic-link token
 * and returns everything the landing page needs to render: proposal title,
 * reviewer info, downloadable file list, current submission state.
 *
 * Side effect: stamps `wmkf_proposalfirstaccessed` if not already set. The
 * stamp is best-effort — a failed PATCH does not fail the page load.
 *
 * Errors return shape `{ ok: false, reason }` with one of the verifier's
 * discriminated reasons. This lets the landing page show a specific error
 * state (expired vs. revoked vs. malformed) without 500-ing on bad input.
 */

import { verifySuggestionToken } from '../../../../../lib/external/verify-suggestion-token';
import { DynamicsService } from '../../../../../lib/services/dynamics-service';
import { GraphService } from '../../../../../lib/services/graph-service';
import { getRequestSharePointBuckets } from '../../../../../lib/utils/sharepoint-buckets';
import { bypassDynamicsRestrictions } from '../../../../../lib/services/dynamics-context';
import { reviewFormSchema } from '../../../../../lib/external/review-form-schema';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  try {
    const verified = await verifySuggestionToken(req.query.token);
    if (!verified.ok) {
      return res.status(verified.reason === 'not_found' ? 404 : 401).json({
        ok: false,
        reason: verified.reason,
      });
    }

    const { suggestion, request, reviewer } = verified;

    // Walk all SharePoint buckets for this request and surface
    // proposal-related files (everything except the Reviews/ subtree, which
    // would leak other reviewers' uploads).
    let files = [];
    try {
      files = await listProposalFiles(request.akoya_requestid, request.akoya_requestnum);
    } catch (e) {
      console.error('[external context] file listing failed:', e.message);
      // Non-fatal — page still renders, file list shows the error.
    }

    // Best-effort first-access stamp.
    if (!suggestion.wmkf_proposalfirstaccessed) {
      try {
        await bypassDynamicsRestrictions('external-first-access', () =>
          DynamicsService.updateRecord(
            'wmkf_appreviewersuggestions',
            suggestion.wmkf_appreviewersuggestionid,
            { wmkf_proposalfirstaccessed: new Date().toISOString() },
          ),
        );
      } catch (e) {
        console.error('[external context] failed to stamp first-accessed:', e.message);
      }
    }

    return res.status(200).json({
      ok: true,
      proposal: {
        title: request.akoya_title || 'Untitled proposal',
        requestNumber: request.akoya_requestnum,
        meetingDate: request.wmkf_meetingdate || null,
      },
      reviewer: {
        name: reviewer?.wmkf_name || null,
        email: reviewer?.wmkf_emailaddress || null,
        organization: reviewer?.wmkf_organizationname || null,
      },
      // Soft deadline shown on the page. Token expiry is review due + 4 weeks
      // grace, so this is the wall-clock cutoff for self-serve submission.
      tokenExpiresAt: suggestion.wmkf_externaltokenexpires || null,
      submission: {
        receivedAt: suggestion.wmkf_reviewreceivedat || null,
        filename: suggestion.wmkf_reviewfilename || null,
      },
      prefill: {
        affiliation:
          suggestion.wmkf_revieweraffiliation || reviewer?.wmkf_organizationname || '',
        impact: suggestion.wmkf_reviewerimpact ?? null,
        risk: suggestion.wmkf_reviewerrisk ?? null,
        overallRating: suggestion.wmkf_revieweroverallrating ?? null,
      },
      files,
      formSchema: reviewFormSchema,
    });
  } catch (e) {
    console.error('[external context] unexpected error:', e);
    return res.status(500).json({ ok: false, reason: 'server_error' });
  }
}

/**
 * Walk every plausible SharePoint bucket for a request and return a flat
 * list of downloadable proposal files. Files inside `Reviews/` are excluded
 * — those are reviewer-uploaded and shouldn't be visible to peer reviewers.
 *
 * Each file carries its `library` so the proposal-download endpoint can
 * resolve back to the right Graph drive without trusting client input.
 */
async function listProposalFiles(requestId, requestNumber) {
  const buckets = await getRequestSharePointBuckets(requestId, requestNumber);
  const out = [];
  for (const bucket of buckets) {
    try {
      const items = await GraphService.listFiles(bucket.library, bucket.folder, {
        recursive: true,
        maxDepth: 3,
      });
      for (const f of items) {
        // Filter out files in any Reviews/ subtree (peer review privacy).
        if (/(^|\/)Reviews(\/|$)/i.test(f.folder || '')) continue;
        out.push({
          id: f.id,
          name: f.name,
          size: f.size,
          mimeType: f.mimeType,
          folder: f.folder,
          library: bucket.library,
          source: bucket.source,
        });
      }
    } catch (e) {
      // Archive libraries 404 frequently — that's expected. Log but continue.
      if (process.env.NODE_ENV === 'development') {
        console.log(`[external context] bucket ${bucket.library}/${bucket.folder} unavailable: ${e.message}`);
      }
    }
  }
  return out;
}
