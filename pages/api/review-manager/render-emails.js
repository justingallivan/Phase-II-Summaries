/**
 * Review Manager - Render Emails (preview)
 *
 * POST /api/review-manager/render-emails
 *
 * Renders per-recipient email drafts by applying the template + settings to
 * each reviewer's data. No Dynamics calls, no DB writes — pure preview so the
 * UI can show editable subject/body per recipient before send.
 *
 * Request body:
 *   - suggestionIds: number[] — reviewer suggestion IDs
 *   - templateType: 'materials' | 'followup' | 'thankyou'
 *   - template: { subject, body } — the template content
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
  const userProfileId = access.profileId;

  const allowed = await limiter(req, res);
  if (allowed !== true) return;

  try {
    const {
      suggestionIds,
      templateType = 'materials',
      template,
      settings = {},
    } = req.body;

    if (!suggestionIds || !Array.isArray(suggestionIds) || suggestionIds.length === 0) {
      return res.status(400).json({ error: 'suggestionIds array is required' });
    }
    if (!template || !template.subject || !template.body) {
      return res.status(400).json({ error: 'template with subject and body is required' });
    }

    const reviewerData = await sql`
      SELECT
        rs.id as suggestion_id,
        rs.proposal_id,
        rs.proposal_title,
        rs.proposal_abstract,
        rs.proposal_authors,
        rs.proposal_institution,
        rs.proposal_url,
        rs.proposal_password,
        rs.co_investigators,
        rs.co_investigator_count,
        rs.request_number,
        r.name,
        r.primary_affiliation as affiliation,
        r.email,
        gc.name as cycle_name,
        gc.program_name,
        gc.review_deadline,
        gc.custom_fields
      FROM reviewer_suggestions rs
      JOIN researchers r ON rs.researcher_id = r.id
      LEFT JOIN grant_cycles gc ON rs.grant_cycle_id = gc.id
      WHERE rs.id = ANY(${suggestionIds})
        AND rs.user_profile_id = ${userProfileId}
    `;

    if (reviewerData.rows.length === 0) {
      return res.status(404).json({ error: 'No reviewers found for the provided IDs' });
    }

    const drafts = reviewerData.rows.map(row => {
      if (!row.email) {
        return {
          suggestionId: row.suggestion_id,
          candidateName: row.name,
          candidateEmail: null,
          requestNumber: row.request_number || null,
          subject: '',
          body: '',
          skipped: 'no_email',
        };
      }

      const candidate = {
        name: row.name,
        affiliation: row.affiliation,
        email: row.email,
      };
      const proposal = {
        title: row.proposal_title,
        abstract: row.proposal_abstract,
        authors: row.proposal_authors,
        institution: row.proposal_institution,
        coInvestigators: row.co_investigators,
        coInvestigatorCount: row.co_investigator_count,
      };
      const templateSettings = {
        signature: settings.signature || '',
        proposalUrl: row.proposal_url || settings.proposalUrl || '',
        proposalPassword: row.proposal_password || settings.proposalPassword || '',
        reviewDueDate: settings.reviewDueDate || row.review_deadline,
        reviewerFormLink: settings.reviewerFormLink || '',
        grantCycle: {
          programName: row.program_name || '',
          reviewDeadline: row.review_deadline,
          customFields: { ...(row.custom_fields || {}), ...(settings.customFields || {}) },
        },
      };

      const templateData = buildTemplateData(candidate, proposal, templateSettings);
      return {
        suggestionId: row.suggestion_id,
        candidateName: row.name,
        candidateEmail: row.email,
        requestNumber: row.request_number || null,
        subject: replacePlaceholders(template.subject, templateData),
        body: replacePlaceholders(template.body, templateData),
      };
    });

    return res.status(200).json({
      drafts,
      stats: {
        total: drafts.length,
        ready: drafts.filter(d => !d.skipped).length,
        skipped: drafts.filter(d => d.skipped).length,
      },
    });
  } catch (error) {
    console.error('Review Manager render-emails error:', error);
    return res.status(500).json({
      error: BASE_CONFIG.ERROR_MESSAGES?.EMAIL_GENERATION_FAILED || 'Failed to render emails',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
