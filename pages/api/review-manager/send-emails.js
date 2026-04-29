/**
 * Review Manager - Send Emails (direct via Dynamics)
 *
 * POST /api/review-manager/send-emails
 *
 * Sends per-recipient emails via Dynamics email activities. Accepts
 * already-rendered drafts (subject/body per recipient) so the UI can show a
 * preview/edit step before send. Links each email to the proposal's
 * akoya_request via regardingobjectid so it shows in the request's CRM
 * timeline. Updates lifecycle timestamps only for successfully-sent rows.
 *
 * Request body:
 *   - drafts: Array<{ suggestionId, subject, body }> — pre-rendered per recipient
 *   - templateType: 'materials' | 'followup' | 'thankyou' — drives DB status update
 *   - attachmentUrls: string[] — additional attachment URLs (optional)
 *   - markAsSent: boolean — whether to update DB timestamps (default true)
 *
 * SSE events:
 *   - progress { stage, message, current?, total? }
 *   - email_sent { suggestionId, candidateName, candidateEmail, emailId }
 *   - email_failed { suggestionId, candidateName, candidateEmail, error }
 *   - result { sent: [...], failed: [...], stats: { sent, failed, skipped, total } }
 *   - complete { message, sent, failed }
 *   - error { message }
 */

import { sql } from '@vercel/postgres';
import { BASE_CONFIG } from '../../../shared/config/baseConfig';
import { requireAppAccess } from '../../../lib/utils/auth';
import { nextRateLimiter } from '../../../shared/api/middleware/rateLimiter';
import { safeFetch, isAllowedUrl } from '../../../lib/utils/safe-fetch';
import { DynamicsService } from '../../../lib/services/dynamics-service';

const limiter = nextRateLimiter({ max: 10 });

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
  maxDuration: 300,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const access = await requireAppAccess(req, res, 'review-manager');
  if (!access) return;
  const userProfileId = access.profileId;

  // Sender must resolve to a Dynamics systemuser. azureEmail is the
  // canonical accessor (matches /api/test-email).
  const fromEmail = access.session?.user?.azureEmail;
  if (!fromEmail) {
    return res.status(400).json({
      error: 'Could not determine sender email from your session. Please sign out and back in.',
    });
  }

  const allowed = await limiter(req, res);
  if (allowed !== true) return;

  // DynamicsService is fail-closed; this endpoint operates with full access
  // (resolving akoya_request GUIDs, creating email activities) so opt out
  // explicitly. Other server endpoints (grant-reporting, expertise-finder,
  // phase-i-dynamics) follow the same pattern.
  DynamicsService.bypassRestrictions('review-manager-send');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const {
      drafts,
      templateType = 'materials',
      attachmentUrls = [],
      markAsSent = true,
    } = req.body;

    if (!Array.isArray(drafts) || drafts.length === 0) {
      sendEvent('error', { message: 'drafts array is required' });
      return res.end();
    }
    for (const d of drafts) {
      if (!d || typeof d.suggestionId !== 'number' || !d.subject || !d.body) {
        sendEvent('error', { message: 'each draft must have suggestionId, subject, body' });
        return res.end();
      }
    }

    sendEvent('progress', {
      stage: 'starting',
      message: `Preparing ${drafts.length} email(s)...`,
      total: drafts.length,
    });

    // Refetch authoritative recipient data from Postgres — never trust
    // client-supplied email/request_number for routing.
    const suggestionIds = drafts.map(d => d.suggestionId);
    const reviewerData = await sql`
      SELECT
        rs.id as suggestion_id,
        rs.request_number,
        rs.grant_cycle_id,
        r.name,
        r.email,
        gc.review_template_blob_url,
        gc.additional_attachments
      FROM reviewer_suggestions rs
      JOIN researchers r ON rs.researcher_id = r.id
      LEFT JOIN grant_cycles gc ON rs.grant_cycle_id = gc.id
      WHERE rs.id = ANY(${suggestionIds})
        AND rs.user_profile_id = ${userProfileId}
    `;

    if (reviewerData.rows.length === 0) {
      sendEvent('error', { message: 'No reviewers found for the provided IDs' });
      return res.end();
    }

    const rowBySuggestionId = new Map(reviewerData.rows.map(r => [r.suggestion_id, r]));

    // Batched akoya_request GUID lookup so each email can be linked to its
    // proposal in the CRM timeline. Failures here are non-fatal — emails still
    // send, just without the regarding link.
    const distinctRequestNumbers = Array.from(
      new Set(reviewerData.rows.map(r => r.request_number).filter(Boolean))
    );
    const guidByRequestNumber = await resolveRequestGuids(distinctRequestNumbers, sendEvent);

    // Fetch shared attachments once. Same shape as before — review template,
    // grant cycle additional attachments, and any caller-supplied URLs.
    sendEvent('progress', { stage: 'fetching_attachments', message: 'Fetching attachments...' });
    const attachmentCache = new Map();
    const sharedAttachments = [];

    for (const url of attachmentUrls) {
      if (!url) continue;
      try {
        const att = await fetchAttachment(url, attachmentCache);
        if (att) sharedAttachments.push(att);
      } catch (err) {
        console.warn('Failed to fetch attachment:', url, err.message);
      }
    }

    const firstRow = reviewerData.rows[0];
    if (firstRow.review_template_blob_url && !attachmentCache.has(firstRow.review_template_blob_url)) {
      try {
        const att = await fetchAttachment(firstRow.review_template_blob_url, attachmentCache);
        if (att) sharedAttachments.push(att);
      } catch (err) {
        console.warn('Failed to fetch review template:', err.message);
      }
    }
    if (firstRow.additional_attachments && Array.isArray(firstRow.additional_attachments)) {
      for (const a of firstRow.additional_attachments) {
        const url = a.blobUrl || a.url;
        if (url && !attachmentCache.has(url)) {
          try {
            const att = await fetchAttachment(url, attachmentCache);
            if (att) sharedAttachments.push(att);
          } catch (err) {
            console.warn('Failed to fetch additional attachment:', url, err.message);
          }
        }
      }
    }

    sendEvent('progress', {
      stage: 'sending',
      message: `Sending ${drafts.length} email(s) from ${fromEmail}...`,
      total: drafts.length,
    });

    const sent = [];
    const failed = [];
    const skipped = [];
    let processed = 0;

    for (const draft of drafts) {
      processed++;
      const row = rowBySuggestionId.get(draft.suggestionId);

      if (!row) {
        failed.push({
          suggestionId: draft.suggestionId,
          candidateName: '(unknown)',
          candidateEmail: null,
          error: 'Suggestion not found or not owned by you',
        });
        sendEvent('email_failed', failed[failed.length - 1]);
        continue;
      }

      if (!row.email) {
        skipped.push({
          suggestionId: row.suggestion_id,
          candidateName: row.name,
          candidateEmail: null,
          reason: 'no_email',
        });
        sendEvent('progress', {
          stage: 'sending',
          current: processed,
          total: drafts.length,
          message: `Skipped ${row.name} (no email)`,
        });
        continue;
      }

      const regardingId = row.request_number ? guidByRequestNumber.get(row.request_number) : null;

      try {
        const { emailId } = await DynamicsService.createAndSendEmail({
          subject: draft.subject,
          body: plainTextToHtml(draft.body),
          from: fromEmail,
          to: row.email,
          regardingId: regardingId || undefined,
          regardingType: regardingId ? 'akoya_request' : undefined,
          attachments: sharedAttachments,
        });

        sent.push({
          suggestionId: row.suggestion_id,
          candidateName: row.name,
          candidateEmail: row.email,
          emailId,
          regardingLinked: Boolean(regardingId),
        });
        sendEvent('email_sent', sent[sent.length - 1]);
        sendEvent('progress', {
          stage: 'sending',
          current: processed,
          total: drafts.length,
          message: `Sent to ${row.name}`,
        });
      } catch (err) {
        console.error(`Failed to send to ${row.name} <${row.email}>:`, err.message);
        failed.push({
          suggestionId: row.suggestion_id,
          candidateName: row.name,
          candidateEmail: row.email,
          error: err.message,
        });
        sendEvent('email_failed', failed[failed.length - 1]);
        sendEvent('progress', {
          stage: 'sending',
          current: processed,
          total: drafts.length,
          message: `Failed to send to ${row.name}`,
        });
      }
    }

    if (markAsSent && sent.length > 0) {
      sendEvent('progress', { stage: 'updating_database', message: 'Updating tracking data...' });
      const sentIds = sent.map(s => s.suggestionId);
      const now = new Date().toISOString();

      try {
        if (templateType === 'materials') {
          await sql`
            UPDATE reviewer_suggestions
            SET materials_sent_at = ${now},
                review_status = CASE
                  WHEN review_status IS NULL OR review_status = 'accepted'
                  THEN 'materials_sent'
                  ELSE review_status
                END
            WHERE id = ANY(${sentIds})
              AND user_profile_id = ${userProfileId}
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
            WHERE id = ANY(${sentIds})
              AND user_profile_id = ${userProfileId}
          `;
        } else if (templateType === 'thankyou') {
          await sql`
            UPDATE reviewer_suggestions
            SET thankyou_sent_at = ${now},
                review_status = 'complete'
            WHERE id = ANY(${sentIds})
              AND user_profile_id = ${userProfileId}
          `;
        }
      } catch (err) {
        console.error('DB update after send failed (emails were sent):', err.message);
        sendEvent('progress', {
          stage: 'updating_database',
          message: `Warning: emails sent but DB update failed: ${err.message}`,
        });
      }
    }

    sendEvent('result', {
      sent,
      failed,
      skipped,
      stats: {
        sent: sent.length,
        failed: failed.length,
        skipped: skipped.length,
        total: drafts.length,
      },
    });

    sendEvent('complete', {
      message: `Sent ${sent.length} of ${drafts.length} ${templateType} email(s)`
        + (failed.length ? `; ${failed.length} failed` : '')
        + (skipped.length ? `; ${skipped.length} skipped (no email)` : ''),
      sent: sent.length,
      failed: failed.length,
      skipped: skipped.length,
    });

    res.end();
  } catch (error) {
    console.error('Review Manager send-emails error:', error);
    sendEvent('error', {
      message: BASE_CONFIG.ERROR_MESSAGES?.EMAIL_GENERATION_FAILED || 'Failed to send emails',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
    res.end();
  }
}

/**
 * Resolve akoya_request GUIDs from request numbers in a single batched query.
 * Returns Map<requestNumber, guid>. Missing rows mean the email will send
 * without a regarding link (graceful degrade).
 */
async function resolveRequestGuids(requestNumbers, sendEvent) {
  const map = new Map();
  if (requestNumbers.length === 0) return map;

  try {
    sendEvent('progress', {
      stage: 'resolving_requests',
      message: `Looking up ${requestNumbers.length} request(s) in Dynamics...`,
    });

    const filter = requestNumbers
      .map(n => `akoya_requestnum eq '${String(n).replace(/'/g, "''")}'`)
      .join(' or ');

    const { records } = await DynamicsService.queryRecords('akoya_requests', {
      select: 'akoya_requestid,akoya_requestnum',
      filter,
      top: requestNumbers.length,
    });

    for (const r of records) {
      if (r.akoya_requestnum && r.akoya_requestid) {
        map.set(r.akoya_requestnum, r.akoya_requestid);
      }
    }
  } catch (err) {
    console.warn('Request GUID resolution failed; emails will send without regarding link:', err.message);
  }
  return map;
}

// Dynamics email activity `description` is rendered as HTML, so plain-text
// templates (with `\n` line breaks) lose their formatting. Escape HTML special
// chars, then convert newlines to <br>. Bare URLs become anchor tags so links
// stay clickable.
function plainTextToHtml(text) {
  if (!text) return '';
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    (m) => `<a href="${m}">${m}</a>`
  );
  return linked.replace(/\r\n|\r|\n/g, '<br>');
}

async function fetchAttachment(url, cache) {
  if (cache.has(url)) return cache.get(url);
  if (!isAllowedUrl(url)) {
    console.warn('fetchAttachment blocked non-allowed URL:', url);
    return null;
  }
  const response = await safeFetch(url);
  if (!response.ok) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const urlPath = new URL(url).pathname;
  const filename = urlPath.split('/').pop() || 'attachment';

  const attachment = { filename, contentType, content: buffer };
  cache.set(url, attachment);
  return attachment;
}
