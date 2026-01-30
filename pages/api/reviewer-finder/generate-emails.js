/**
 * API Route: /api/reviewer-finder/generate-emails
 *
 * Generates .eml files for reviewer invitation emails.
 * Supports optional Claude personalization and file attachments via SSE streaming.
 *
 * POST body:
 * - candidates: Array of candidates with name, email, affiliation, suggestionId (required for multi-proposal)
 * - template: { subject, body } with placeholders
 * - settings: { senderName, senderEmail, signature, grantCycle }
 * - proposalInfo: { title, abstract, authors, institution } - fallback if no suggestionId
 * - options: { useClaudePersonalization, claudeApiKey, markAsSent }
 * - attachments: { summaryBlobUrl, reviewTemplateBlobUrl } - URLs to fetch and attach (fallback)
 *
 * Multi-proposal support:
 * When candidates have suggestionId, their proposal info is looked up from the database,
 * allowing each email to have the correct proposal title, PI, and summary attachment.
 */

import { sql } from '@vercel/postgres';
import {
  generateEmlContent,
  generateEmlContentWithAttachments,
  replacePlaceholders,
  buildTemplateData,
  createFilename
} from '../../../lib/utils/email-generator';

import { createPersonalizationPrompt } from '../../../shared/config/prompts/email-reviewer';
import { requireAuth } from '../../../lib/utils/auth';

/**
 * Look up proposal info for candidates from the database
 * Returns a map of suggestionId -> proposalInfo
 */
async function lookupProposalInfoForCandidates(suggestionIds) {
  if (!suggestionIds || suggestionIds.length === 0) {
    return new Map();
  }

  try {
    // Query proposal info for all suggestionIds in one batch
    const result = await sql`
      SELECT
        id as suggestion_id,
        proposal_title,
        proposal_abstract,
        proposal_authors,
        proposal_institution,
        summary_blob_url,
        co_investigators,
        co_investigator_count
      FROM reviewer_suggestions
      WHERE id = ANY(${suggestionIds})
    `;

    const proposalInfoMap = new Map();
    for (const row of result.rows) {
      // Use string key to match frontend's JSON-serialized suggestionId
      proposalInfoMap.set(String(row.suggestion_id), {
        title: row.proposal_title || '',
        abstract: row.proposal_abstract || '',
        authors: row.proposal_authors || '',
        institution: row.proposal_institution || '',
        summaryBlobUrl: row.summary_blob_url || '',
        coInvestigators: row.co_investigators || '',
        coInvestigatorCount: row.co_investigator_count || 0
      });
    }

    return proposalInfoMap;
  } catch (error) {
    console.error('Error looking up proposal info:', error.message);
    return new Map();
  }
}

/**
 * Fetch attachment from URL and cache by URL to avoid re-fetching
 */
async function fetchAttachment(url, attachmentCache, filename, contentType) {
  if (!url) return null;

  // Check cache first
  if (attachmentCache.has(url)) {
    return attachmentCache.get(url);
  }

  try {
    const response = await fetch(url);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      const attachment = {
        filename,
        contentType,
        content: buffer
      };
      attachmentCache.set(url, attachment);
      return attachment;
    } else {
      console.warn(`Failed to fetch attachment from ${url}:`, response.status);
      return null;
    }
  } catch (err) {
    console.error(`Error fetching attachment from ${url}:`, err.message);
    return null;
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Increased for attachments
    },
  },
  maxDuration: 300, // 5 minutes for large batches
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication (before setting up SSE)
  const session = await requireAuth(req, res);
  if (!session) return;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const {
      candidates,
      template,
      settings,
      proposalInfo,
      options = {},
      attachments: attachmentConfig = {}
    } = req.body;

    // Validate inputs
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      sendEvent('error', { message: 'No candidates provided' });
      return res.end();
    }

    if (!template || !template.subject || !template.body) {
      sendEvent('error', { message: 'Email template is required' });
      return res.end();
    }

    if (!settings || !settings.senderEmail) {
      sendEvent('error', { message: 'Sender email is required' });
      return res.end();
    }

    const { useClaudePersonalization, claudeApiKey, markAsSent } = options;

    // Filter candidates with email addresses
    const validCandidates = candidates.filter(c => c.email);
    const skippedCount = candidates.length - validCandidates.length;

    if (validCandidates.length === 0) {
      sendEvent('error', { message: 'No candidates have email addresses' });
      return res.end();
    }

    // Look up proposal info for candidates with suggestionIds (multi-proposal support)
    const suggestionIds = validCandidates
      .map(c => c.suggestionId)
      .filter(id => id != null);

    let proposalInfoMap = new Map();
    if (suggestionIds.length > 0) {
      sendEvent('progress', {
        stage: 'lookup',
        message: 'Looking up proposal info for candidates...'
      });
      proposalInfoMap = await lookupProposalInfoForCandidates(suggestionIds);
    }

    // Attachment cache to avoid re-fetching the same files
    const attachmentCache = new Map();

    // Fetch shared attachments (review template, additional attachments)
    const { summaryBlobUrl: fallbackSummaryUrl, reviewTemplateBlobUrl, additionalAttachments = [] } = attachmentConfig;
    const sharedAttachments = [];

    if (reviewTemplateBlobUrl || additionalAttachments.length > 0) {
      sendEvent('progress', {
        stage: 'fetching_attachments',
        message: 'Fetching shared attachment files...'
      });

      // Fetch review template (shared across all emails)
      if (reviewTemplateBlobUrl) {
        try {
          const templateResponse = await fetch(reviewTemplateBlobUrl);
          if (templateResponse.ok) {
            const buffer = Buffer.from(await templateResponse.arrayBuffer());
            const urlPath = new URL(reviewTemplateBlobUrl).pathname;
            const ext = urlPath.split('.').pop()?.toLowerCase() || 'pdf';
            const contentType = ext === 'docx'
              ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : ext === 'doc'
              ? 'application/msword'
              : 'application/pdf';
            sharedAttachments.push({
              filename: `Review_Template.${ext}`,
              contentType,
              content: buffer
            });
            sendEvent('progress', {
              stage: 'fetching_attachments',
              message: 'Fetched review template'
            });
          } else {
            console.warn('Failed to fetch review template:', templateResponse.status);
          }
        } catch (err) {
          console.error('Error fetching review template:', err.message);
        }
      }

      // Fetch additional attachments (shared across all emails)
      for (const attachment of additionalAttachments) {
        if (!attachment.blobUrl) continue;
        try {
          const response = await fetch(attachment.blobUrl);
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            sharedAttachments.push({
              filename: attachment.filename || 'Attachment.pdf',
              contentType: attachment.contentType || 'application/octet-stream',
              content: buffer
            });
            sendEvent('progress', {
              stage: 'fetching_attachments',
              message: `Fetched ${attachment.filename}`
            });
          } else {
            console.warn(`Failed to fetch additional attachment ${attachment.filename}:`, response.status);
          }
        } catch (err) {
          console.error(`Error fetching additional attachment ${attachment.filename}:`, err.message);
        }
      }
    }

    // Count unique summary URLs for progress reporting
    const uniqueSummaryUrls = new Set();
    for (const candidate of validCandidates) {
      const candidateProposalInfo = proposalInfoMap.get(candidate.suggestionId);
      const summaryUrl = candidateProposalInfo?.summaryBlobUrl || fallbackSummaryUrl;
      if (summaryUrl) uniqueSummaryUrls.add(summaryUrl);
    }

    sendEvent('progress', {
      stage: 'starting',
      message: `Generating ${validCandidates.length} emails (${uniqueSummaryUrls.size} unique proposal${uniqueSummaryUrls.size !== 1 ? 's' : ''})...`,
      total: validCandidates.length,
      skipped: skippedCount,
      uniqueProposals: uniqueSummaryUrls.size
    });

    const generatedEmails = [];
    const errors = [];

    // Process each candidate
    for (let i = 0; i < validCandidates.length; i++) {
      const candidate = validCandidates[i];

      sendEvent('progress', {
        stage: 'generating',
        current: i + 1,
        total: validCandidates.length,
        candidate: candidate.name,
        message: useClaudePersonalization
          ? `Personalizing email for ${candidate.name}...`
          : `Generating email for ${candidate.name}...`
      });

      try {
        // Get this candidate's specific proposal info (from DB lookup or fallback)
        // Convert suggestionId to string to match Map keys
        const candidateProposalInfo = proposalInfoMap.get(String(candidate.suggestionId)) || proposalInfo || {};

        // Build template data for this candidate with their specific proposal
        const templateData = buildTemplateData(candidate, candidateProposalInfo, settings);

        // Replace placeholders in template
        let subject = replacePlaceholders(template.subject, templateData);
        let body = replacePlaceholders(template.body, templateData);

        // Optionally personalize with Claude
        if (useClaudePersonalization && claudeApiKey) {
          try {
            const personalizedBody = await personalizeWithClaude(
              candidate,
              candidateProposalInfo,
              body,
              claudeApiKey
            );
            if (personalizedBody) {
              body = personalizedBody;
            }
          } catch (claudeError) {
            console.error(`Claude personalization failed for ${candidate.name}:`, claudeError.message);
            // Continue with non-personalized email
          }
        }

        // Build per-candidate attachments (shared + candidate-specific summary)
        const candidateAttachments = [...sharedAttachments];

        // Fetch this candidate's summary PDF (cached to avoid re-fetching same URL)
        const summaryUrl = candidateProposalInfo.summaryBlobUrl || fallbackSummaryUrl;
        if (summaryUrl) {
          const summaryAttachment = await fetchAttachment(
            summaryUrl,
            attachmentCache,
            'Project_Summary.pdf',
            'application/pdf'
          );
          if (summaryAttachment) {
            candidateAttachments.unshift(summaryAttachment); // Add at beginning
          }
        }

        const hasAttachments = candidateAttachments.length > 0;

        // Build sender string
        const from = settings.senderName
          ? `${settings.senderName} <${settings.senderEmail}>`
          : settings.senderEmail;

        // Generate EML content (with or without attachments)
        const emlContent = hasAttachments
          ? generateEmlContentWithAttachments({
              from,
              to: candidate.email,
              subject,
              body,
              attachments: candidateAttachments
            })
          : generateEmlContent({
              from,
              to: candidate.email,
              subject,
              body
            });

        const filename = createFilename(candidate.name);

        generatedEmails.push({
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          suggestionId: candidate.suggestionId,
          filename,
          content: emlContent,
          subject
        });

        sendEvent('email_generated', {
          index: i,
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          suggestionId: candidate.suggestionId,
          filename,
          subject
        });

      } catch (error) {
        console.error(`Error generating email for ${candidate.name}:`, error.message);
        errors.push({
          candidateName: candidate.name,
          error: error.message
        });
      }
    }

    // Update database to mark emails as sent (if option enabled and suggestionIds provided)
    let markedAsSentCount = 0;
    if (markAsSent) {
      const suggestionIdsToUpdate = generatedEmails
        .filter(e => e.suggestionId)
        .map(e => e.suggestionId);

      if (suggestionIdsToUpdate.length > 0) {
        sendEvent('progress', {
          stage: 'updating_database',
          message: `Marking ${suggestionIdsToUpdate.length} candidates as sent...`
        });

        const now = new Date().toISOString();
        for (const suggestionId of suggestionIdsToUpdate) {
          try {
            await sql`
              UPDATE reviewer_suggestions
              SET email_sent_at = ${now}, invited = true
              WHERE id = ${suggestionId}
            `;
            markedAsSentCount++;
          } catch (dbError) {
            console.error(`Failed to update email_sent_at for suggestion ${suggestionId}:`, dbError.message);
          }
        }
      }
    }

    // Send final result with all email contents
    sendEvent('result', {
      emails: generatedEmails,
      stats: {
        total: candidates.length,
        generated: generatedEmails.length,
        skipped: skippedCount,
        errors: errors.length,
        markedAsSent: markedAsSentCount
      },
      errors: errors.length > 0 ? errors : undefined
    });

    sendEvent('complete', {
      message: `Generated ${generatedEmails.length} emails${markedAsSentCount > 0 ? `, marked ${markedAsSentCount} as sent` : ''}`,
      generated: generatedEmails.length,
      skipped: skippedCount,
      markedAsSent: markedAsSentCount
    });

  } catch (error) {
    console.error('Generate emails error:', error);
    sendEvent('error', {
      message: error.message || 'An unexpected error occurred',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }

  res.end();
}

/**
 * Use Claude to personalize an email body
 */
async function personalizeWithClaude(candidate, proposalInfo, baseBody, apiKey) {
  const prompt = createPersonalizationPrompt(candidate, proposalInfo, baseBody);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      temperature: 0.3, // Low temperature for consistent, professional output
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const textContent = data.content?.find(c => c.type === 'text');

  if (textContent && textContent.text) {
    return textContent.text.trim();
  }

  return null;
}
