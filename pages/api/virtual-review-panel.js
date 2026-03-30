/**
 * Virtual Review Panel API Endpoint
 *
 * Orchestrates multi-LLM review of a grant proposal:
 * - Stage 1 (optional): Claim verification across all selected LLMs
 * - Stage 2: Structured review (WMKF reviewer form) across all selected LLMs
 * - Synthesis: Claude panel summary with consensus, disagreements, questions
 *
 * Streams progress via SSE. Results persisted to panel_reviews/panel_review_items.
 */

import { loadModelOverrides } from '../../shared/config/baseConfig';
import { requireAppAccess } from '../../lib/utils/auth';
import { nextRateLimiter } from '../../shared/api/middleware/rateLimiter';
import { safeFetch } from '../../lib/utils/safe-fetch';
import { MultiLLMService } from '../../lib/services/multi-llm-service';
import { PanelReviewService } from '../../lib/services/panel-review-service';
import pdf from 'pdf-parse';

const limiter = nextRateLimiter({ max: 3 });

export const config = {
  api: {
    bodyParser: { sizeLimit: '1mb' },
    responseLimit: false,
    externalResolver: true,
  },
  maxDuration: 600,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const access = await requireAppAccess(req, res, 'virtual-review-panel');
  if (!access) return;

  const allowed = await limiter(req, res);
  if (allowed !== true) return;

  await loadModelOverrides();

  // SSE streaming headers
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event, data) => {
    try {
      res.write(`data: ${JSON.stringify({ event, ...data })}\n\n`);
    } catch {
      // Client disconnected
    }
  };

  try {
    const {
      files,
      providers: requestedProviders = ['claude', 'openai'],
      includeClaimVerification = true,
    } = req.body;

    const userProfileId = access.profileId;

    // Validate files
    if (!files || files.length === 0) {
      sendEvent('error', { message: 'No files provided' });
      return res.end();
    }

    if (files.length > 1) {
      sendEvent('error', { message: 'Please upload one file at a time' });
      return res.end();
    }

    // Validate providers
    const availableProviders = MultiLLMService.getAvailableProviders();
    const providers = requestedProviders.filter(p => availableProviders.includes(p));

    if (providers.length < 2) {
      sendEvent('error', {
        message: `Need at least 2 configured LLM providers. Available: ${availableProviders.join(', ')}. ` +
                 `Requested: ${requestedProviders.join(', ')}. Check API keys in environment variables.`
      });
      return res.end();
    }

    sendEvent('progress', {
      message: `Starting virtual review panel with ${providers.length} reviewers: ${providers.map(p => MultiLLMService.getProviderName(p)).join(', ')}`,
      providers: providers.map(p => ({ key: p, name: MultiLLMService.getProviderName(p) })),
    });

    // Extract text from PDF
    const file = files[0];
    sendEvent('progress', { message: `Extracting text from ${file.filename}...` });

    const fileResponse = await safeFetch(file.url);
    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch file: ${fileResponse.statusText}`);
    }

    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
    const pdfData = await pdf(fileBuffer);
    const proposalText = pdfData.text;

    if (!proposalText || proposalText.trim().length < 100) {
      sendEvent('error', { message: 'PDF appears to be empty or contains insufficient text for review' });
      return res.end();
    }

    sendEvent('progress', {
      message: `Extracted ${proposalText.length.toLocaleString()} characters from ${pdfData.numpages} pages`,
    });

    // Create panel review in DB
    const panelReviewId = await PanelReviewService.createPanelReview(userProfileId, {
      proposalTitle: file.filename.replace(/\.pdf$/i, ''),
      proposalFilename: file.filename,
      proposalText,
      config: {
        providers,
        includeClaimVerification,
        availableProviders,
      },
    });

    sendEvent('progress', { message: 'Panel review created, starting LLM evaluations...', panelReviewId });

    // Run the full pipeline
    const loggingContext = { userProfileId, appName: 'virtual-review-panel' };

    await PanelReviewService.runFullPanel(panelReviewId, proposalText, providers, {
      includeClaimVerification,
      loggingContext,
      sendEvent,
    });

    res.end();

  } catch (error) {
    console.error('[VirtualReviewPanel] Error:', error);
    sendEvent('error', { message: error.message || 'An unexpected error occurred' });
    res.end();
  }
}
