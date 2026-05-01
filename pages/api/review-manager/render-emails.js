/**
 * Review Manager - Render Emails (Dataverse-backed preview)
 *
 * POST /api/review-manager/render-emails
 *
 * Renders per-recipient email drafts by applying the template + settings to
 * each reviewer's data. Recipient + proposal data come from Dataverse so the
 * preview matches what `send-emails` will use. Cycle-level template config
 * (deadline, programName, customFields) still lives in Postgres `grant_cycles`.
 *
 * suggestionIds are Dataverse GUIDs (strings).
 *
 * Request body:
 *   - suggestionIds: string[]
 *   - templateType: 'materials' | 'followup' | 'thankyou'
 *   - template: { subject, body }
 *   - settings: { signature, proposalUrl, reviewerFormLink, customFields, ... }
 *
 * Response:
 *   - drafts: Array<{ suggestionId, candidateName, candidateEmail, requestNumber,
 *                     subject, body, skipped?: 'no_email' }>
 */

import { sql } from '@vercel/postgres';
import { BASE_CONFIG } from '../../../shared/config/baseConfig';
import {
  replacePlaceholders,
  buildTemplateData,
} from '../../../lib/utils/email-generator';
import { requireAppAccess } from '../../../lib/utils/auth';
import { nextRateLimiter } from '../../../shared/api/middleware/rateLimiter';
import { DynamicsService } from '../../../lib/services/dynamics-service';
import { bypassDynamicsRestrictions } from '../../../lib/services/dynamics-context';
import { meetingDateToCycleCode } from '../../../lib/utils/cycle-code';
import * as suggestionAdapter from '../../../lib/dataverse/adapters/reviewer-suggestion';

const limiter = nextRateLimiter({ max: 30 });

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const access = await requireAppAccess(req, res, 'review-manager');
  if (!access) return;

  const allowed = await limiter(req, res);
  if (allowed !== true) return;

  return bypassDynamicsRestrictions('review-manager-render', async () => {
  try {
    const {
      suggestionIds,
      templateType = 'materials',
      template,
      settings = {},
    } = req.body;

    if (!Array.isArray(suggestionIds) || suggestionIds.length === 0) {
      return res.status(400).json({ error: 'suggestionIds array is required' });
    }
    if (!template || !template.subject || !template.body) {
      return res.status(400).json({ error: 'template with subject and body is required' });
    }

    // Hydrate each suggestion: suggestion row + linked person + linked request.
    const rows = [];
    for (const suggestionId of suggestionIds) {
      const sug = await suggestionAdapter.findById(suggestionId);
      if (!sug) continue;
      const personId = sug._wmkf_potentialreviewer_value;
      const requestId = sug._wmkf_request_value;
      const [person, request] = await Promise.all([
        personId ? DynamicsService.getRecord('wmkf_potentialreviewerses', personId, {
          select: 'wmkf_name,wmkf_emailaddress,wmkf_organizationname',
        }).catch(() => null) : null,
        requestId ? DynamicsService.getRecord('akoya_requests', requestId, {
          select: 'akoya_requestid,akoya_requestnum,akoya_title,wmkf_abstract,wmkf_organizationname,_akoya_applicantid_value,_wmkf_projectleader_value,wmkf_meetingdate',
        }).catch(() => null) : null,
      ]);
      rows.push({ suggestionId, sug, person, request });
    }

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No reviewers found for the provided IDs' });
    }

    // Cycle-level config still in Postgres.
    const distinctCycleCodes = [...new Set(
      rows.map((r) => r.request?.wmkf_meetingdate ? meetingDateToCycleCode(r.request.wmkf_meetingdate) : null).filter(Boolean)
    )];
    const cycleByCode = await loadCycleConfigs(distinctCycleCodes);

    const drafts = rows.map(({ suggestionId, sug, person, request }) => {
      const requestNumber = request?.akoya_requestnum || null;
      const candidateName = person?.wmkf_name || null;
      const candidateEmail = person?.wmkf_emailaddress || null;

      if (!candidateEmail) {
        return {
          suggestionId,
          candidateName,
          candidateEmail: null,
          requestNumber,
          subject: '',
          body: '',
          skipped: 'no_email',
        };
      }

      const cycleCode = request?.wmkf_meetingdate ? meetingDateToCycleCode(request.wmkf_meetingdate) : null;
      const cycle = cycleByCode[cycleCode] || {};

      const candidate = {
        name: candidateName,
        affiliation: person?.wmkf_organizationname || null,
        email: candidateEmail,
      };
      const proposal = {
        title: request?.akoya_title || null,
        abstract: request?.wmkf_abstract || null,
        authors: request?._wmkf_projectleader_value_formatted
          || request?._akoya_applicantid_value_formatted
          || null,
        institution: (request?.wmkf_organizationname || request?._akoya_applicantid_value_formatted || '').trim() || null,
        coInvestigators: null, // historical Postgres-only field; not migrated
        coInvestigatorCount: null,
      };
      const templateSettings = {
        signature: settings.signature || '',
        proposalUrl: sug.wmkf_proposalurl || settings.proposalUrl || '',
        proposalPassword: sug.wmkf_proposalpassword || settings.proposalPassword || '',
        reviewDueDate: settings.reviewDueDate || cycle.review_deadline || null,
        reviewerFormLink: settings.reviewerFormLink || '',
        grantCycle: {
          programName: cycle.program_name || '',
          reviewDeadline: cycle.review_deadline || null,
          customFields: { ...(cycle.custom_fields || {}), ...(settings.customFields || {}) },
        },
      };

      const templateData = buildTemplateData(candidate, proposal, templateSettings);
      return {
        suggestionId,
        candidateName,
        candidateEmail,
        requestNumber,
        subject: replacePlaceholders(template.subject, templateData),
        body: replacePlaceholders(template.body, templateData),
      };
    });

    return res.status(200).json({
      drafts,
      stats: {
        total: drafts.length,
        ready: drafts.filter((d) => !d.skipped).length,
        skipped: drafts.filter((d) => d.skipped).length,
      },
    });
  } catch (error) {
    console.error('Review Manager render-emails error:', error);
    return res.status(500).json({
      error: BASE_CONFIG.ERROR_MESSAGES?.EMAIL_GENERATION_FAILED || 'Failed to render emails',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
  });
}

async function loadCycleConfigs(cycleCodes) {
  const out = {};
  if (!cycleCodes.length) return out;
  const result = await sql`
    SELECT short_code, name, program_name, review_deadline, custom_fields
    FROM grant_cycles
    WHERE short_code = ANY(${cycleCodes})
  `;
  for (const row of result.rows) {
    if (!out[row.short_code]) out[row.short_code] = row;
  }
  return out;
}
