/**
 * API Route: /api/reviewer-finder/generate-emails
 *
 * Generates .eml files for reviewer invitation emails.
 * Supports optional Claude personalization and file attachments via SSE streaming.
 *
 * POST body:
 * - candidates: Array of candidates with name, email, affiliation
 * - template: { subject, body } with placeholders
 * - settings: { senderName, senderEmail, signature, grantCycle }
 * - proposalInfo: { title, abstract, authors, institution }
 * - options: { useClaudePersonalization, claudeApiKey }
 * - attachments: { summaryBlobUrl, reviewTemplateBlobUrl } - URLs to fetch and attach
 */

import {
  generateEmlContent,
  generateEmlContentWithAttachments,
  replacePlaceholders,
  buildTemplateData,
  createFilename
} from '../../../lib/utils/email-generator';

import { createPersonalizationPrompt } from '../../../shared/config/prompts/email-reviewer';

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

    const { useClaudePersonalization, claudeApiKey } = options;

    // Filter candidates with email addresses
    const validCandidates = candidates.filter(c => c.email);
    const skippedCount = candidates.length - validCandidates.length;

    if (validCandidates.length === 0) {
      sendEvent('error', { message: 'No candidates have email addresses' });
      return res.end();
    }

    // Fetch attachments if provided
    const emailAttachments = [];
    const { summaryBlobUrl, reviewTemplateBlobUrl } = attachmentConfig;

    if (summaryBlobUrl || reviewTemplateBlobUrl) {
      sendEvent('progress', {
        stage: 'fetching_attachments',
        message: 'Fetching attachment files...'
      });

      // Fetch project summary PDF
      if (summaryBlobUrl) {
        try {
          const summaryResponse = await fetch(summaryBlobUrl);
          if (summaryResponse.ok) {
            const buffer = Buffer.from(await summaryResponse.arrayBuffer());
            emailAttachments.push({
              filename: 'Project_Summary.pdf',
              contentType: 'application/pdf',
              content: buffer
            });
            sendEvent('progress', {
              stage: 'fetching_attachments',
              message: 'Fetched project summary PDF'
            });
          } else {
            console.warn('Failed to fetch summary PDF:', summaryResponse.status);
          }
        } catch (err) {
          console.error('Error fetching summary PDF:', err.message);
        }
      }

      // Fetch review template
      if (reviewTemplateBlobUrl) {
        try {
          const templateResponse = await fetch(reviewTemplateBlobUrl);
          if (templateResponse.ok) {
            const buffer = Buffer.from(await templateResponse.arrayBuffer());
            // Determine filename and content type from URL or default to PDF
            const urlPath = new URL(reviewTemplateBlobUrl).pathname;
            const ext = urlPath.split('.').pop()?.toLowerCase() || 'pdf';
            const contentType = ext === 'docx'
              ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : ext === 'doc'
              ? 'application/msword'
              : 'application/pdf';
            emailAttachments.push({
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
    }

    const hasAttachments = emailAttachments.length > 0;

    sendEvent('progress', {
      stage: 'starting',
      message: `Generating ${validCandidates.length} emails${hasAttachments ? ` with ${emailAttachments.length} attachment(s)` : ''}...`,
      total: validCandidates.length,
      skipped: skippedCount,
      attachmentCount: emailAttachments.length
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
        // Build template data for this candidate
        const templateData = buildTemplateData(candidate, proposalInfo, settings);

        // Replace placeholders in template
        let subject = replacePlaceholders(template.subject, templateData);
        let body = replacePlaceholders(template.body, templateData);

        // Optionally personalize with Claude
        if (useClaudePersonalization && claudeApiKey) {
          try {
            const personalizedBody = await personalizeWithClaude(
              candidate,
              proposalInfo,
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
              attachments: emailAttachments
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
          filename,
          content: emlContent,
          subject
        });

        sendEvent('email_generated', {
          index: i,
          candidateName: candidate.name,
          candidateEmail: candidate.email,
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

    // Send final result with all email contents
    sendEvent('result', {
      emails: generatedEmails,
      stats: {
        total: candidates.length,
        generated: generatedEmails.length,
        skipped: skippedCount,
        errors: errors.length
      },
      errors: errors.length > 0 ? errors : undefined
    });

    sendEvent('complete', {
      message: `Generated ${generatedEmails.length} emails`,
      generated: generatedEmails.length,
      skipped: skippedCount
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
