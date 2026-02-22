/**
 * Review Manager - Send Emails
 *
 * POST /api/review-manager/send-emails
 *
 * Generates .eml files for selected reviewers using specified template type
 * (materials, followup, thankyou). Uses SSE streaming for progress.
 *
 * Request body:
 *   - suggestionIds: number[] — reviewer suggestion IDs
 *   - templateType: 'materials' | 'followup' | 'thankyou'
 *   - template: { subject, body } — the template content
 *   - settings: { signature, proposalUrl, reviewerFormLink, grantCycle }
 *   - attachmentUrls: string[] — URLs of attachments to include (optional)
 *   - markAsSent: boolean — whether to update DB timestamps
 */

import { sql } from '@vercel/postgres';
import { BASE_CONFIG } from '../../../shared/config/baseConfig';
import {
  generateEmlContent,
  generateEmlContentWithAttachments,
  replacePlaceholders,
  buildTemplateData,
  createFilename,
} from '../../../lib/utils/email-generator';
import { requireAuth } from '../../../lib/utils/auth';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
  maxDuration: 300,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const {
      suggestionIds,
      templateType = 'materials',
      template,
      settings = {},
      attachmentUrls = [],
      markAsSent = true,
    } = req.body;

    if (!suggestionIds || !Array.isArray(suggestionIds) || suggestionIds.length === 0) {
      sendEvent('error', { message: 'suggestionIds array is required' });
      return res.end();
    }
    if (!template || !template.subject || !template.body) {
      sendEvent('error', { message: 'template with subject and body is required' });
      return res.end();
    }

    sendEvent('progress', { stage: 'starting', message: `Generating ${templateType} emails...`, total: suggestionIds.length });

    // Fetch reviewer data for all suggestion IDs
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
        rs.summary_blob_url,
        rs.grant_cycle_id,
        r.name,
        r.primary_affiliation as affiliation,
        r.email,
        gc.name as cycle_name,
        gc.program_name,
        gc.review_deadline,
        gc.custom_fields,
        gc.review_template_blob_url,
        gc.additional_attachments
      FROM reviewer_suggestions rs
      JOIN researchers r ON rs.researcher_id = r.id
      LEFT JOIN grant_cycles gc ON rs.grant_cycle_id = gc.id
      WHERE rs.id = ANY(${suggestionIds})
    `;

    if (reviewerData.rows.length === 0) {
      sendEvent('error', { message: 'No reviewers found for the provided IDs' });
      return res.end();
    }

    // Fetch shared attachments (review template, etc.)
    const attachmentCache = new Map();
    const sharedAttachments = [];

    for (const url of attachmentUrls) {
      if (!url) continue;
      try {
        const attachment = await fetchAttachment(url, attachmentCache);
        if (attachment) sharedAttachments.push(attachment);
      } catch (err) {
        console.warn('Failed to fetch attachment:', url, err.message);
      }
    }

    // Also fetch grant cycle attachments (review template + additional) if available
    const firstRow = reviewerData.rows[0];
    if (firstRow.review_template_blob_url && !attachmentCache.has(firstRow.review_template_blob_url)) {
      try {
        const templateAttachment = await fetchAttachment(firstRow.review_template_blob_url, attachmentCache);
        if (templateAttachment) sharedAttachments.push(templateAttachment);
      } catch (err) {
        console.warn('Failed to fetch review template:', err.message);
      }
    }

    // Fetch additional attachments from grant cycle
    if (firstRow.additional_attachments && Array.isArray(firstRow.additional_attachments)) {
      for (const att of firstRow.additional_attachments) {
        const attUrl = att.blobUrl || att.url;
        if (attUrl && !attachmentCache.has(attUrl)) {
          try {
            const additional = await fetchAttachment(attUrl, attachmentCache);
            if (additional) sharedAttachments.push(additional);
          } catch (err) {
            console.warn('Failed to fetch additional attachment:', attUrl, err.message);
          }
        }
      }
    }

    sendEvent('progress', { stage: 'generating', message: `Processing ${reviewerData.rows.length} reviewers...` });

    const emails = [];
    let generated = 0;
    let skipped = 0;

    for (const row of reviewerData.rows) {
      if (!row.email) {
        skipped++;
        sendEvent('progress', {
          stage: 'generating',
          current: generated + skipped,
          total: reviewerData.rows.length,
          message: `Skipped ${row.name} (no email)`,
        });
        continue;
      }

      // Build template data
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
      const subject = replacePlaceholders(template.subject, templateData);
      const body = replacePlaceholders(template.body, templateData);
      const from = settings.fromEmail || 'noreply@example.com';

      // Generate EML
      const hasAttachments = sharedAttachments.length > 0;
      const emlContent = hasAttachments
        ? generateEmlContentWithAttachments({
            from,
            to: row.email,
            subject,
            body,
            attachments: sharedAttachments,
          })
        : generateEmlContent({ from, to: row.email, subject, body });

      const filename = `${templateType}_${createFilename(row.name)}`;

      emails.push({
        suggestionId: row.suggestion_id,
        candidateName: row.name,
        candidateEmail: row.email,
        filename,
        subject,
        content: emlContent,
      });

      generated++;
      sendEvent('email_generated', {
        index: generated,
        candidateName: row.name,
        candidateEmail: row.email,
        suggestionId: row.suggestion_id,
        filename,
        subject,
      });

      sendEvent('progress', {
        stage: 'generating',
        current: generated + skipped,
        total: reviewerData.rows.length,
        message: `Generated email for ${row.name}`,
      });
    }

    // Update database timestamps if markAsSent
    if (markAsSent && generated > 0) {
      sendEvent('progress', { stage: 'updating_database', message: 'Updating tracking data...' });

      const generatedIds = emails.map(e => e.suggestionId);
      const now = new Date().toISOString();

      if (templateType === 'materials') {
        await sql`
          UPDATE reviewer_suggestions
          SET materials_sent_at = ${now},
              review_status = CASE
                WHEN review_status IS NULL OR review_status = 'accepted'
                THEN 'materials_sent'
                ELSE review_status
              END
          WHERE id = ANY(${generatedIds})
        `;
      } else if (templateType === 'followup') {
        await sql`
          UPDATE reviewer_suggestions
          SET reminder_sent_at = ${now},
              reminder_count = COALESCE(reminder_count, 0) + 1,
              review_status = CASE
                WHEN review_status IN ('materials_sent', 'accepted')
                THEN 'under_review'
                ELSE review_status
              END
          WHERE id = ANY(${generatedIds})
        `;
      } else if (templateType === 'thankyou') {
        await sql`
          UPDATE reviewer_suggestions
          SET thankyou_sent_at = ${now},
              review_status = 'complete'
          WHERE id = ANY(${generatedIds})
        `;
      }
    }

    sendEvent('result', {
      emails: emails.map(e => ({
        suggestionId: e.suggestionId,
        candidateName: e.candidateName,
        candidateEmail: e.candidateEmail,
        filename: e.filename,
        subject: e.subject,
        content: e.content,
      })),
      stats: { generated, skipped, total: reviewerData.rows.length },
    });

    sendEvent('complete', {
      message: `Generated ${generated} ${templateType} email(s)`,
      generated,
      skipped,
    });

    res.end();
  } catch (error) {
    console.error('Review Manager send-emails error:', error);
    sendEvent('error', {
      message: BASE_CONFIG.ERROR_MESSAGES.EMAIL_GENERATION_FAILED,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
    res.end();
  }
}

/**
 * Fetch a URL and return as an attachment object
 */
async function fetchAttachment(url, cache) {
  if (cache.has(url)) return cache.get(url);

  const response = await fetch(url);
  if (!response.ok) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'application/octet-stream';

  // Extract filename from URL
  const urlPath = new URL(url).pathname;
  const filename = urlPath.split('/').pop() || 'attachment';

  const attachment = { filename, contentType, content: buffer };
  cache.set(url, attachment);
  return attachment;
}
