/**
 * API Endpoint: Enrich Contacts
 *
 * POST /api/reviewer-finder/enrich-contacts
 *
 * Enriches selected candidates with contact information using the tiered system:
 * - Tier 1: PubMed (free)
 * - Tier 2: ORCID (free, requires credentials)
 * - Tier 3: Claude Web Search (paid, requires opt-in)
 *
 * Request body:
 * {
 *   candidates: [{ name, affiliation, publications }],
 *   credentials: { orcidClientId, orcidClientSecret },
 *   options: { usePubmed, useOrcid, useClaudeSearch }
 * }
 *
 * Response: Server-Sent Events (SSE) stream with progress updates
 */

import { requireAuth } from '../../../lib/utils/auth';
import { BASE_CONFIG } from '../../../shared/config/baseConfig';

const { ContactEnrichmentService } = require('../../../lib/services/contact-enrichment-service');

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  const { candidates, credentials = {}, options = {} } = req.body;

  // Validate input
  if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: 'No candidates provided' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // First, send cost estimate
    const estimate = ContactEnrichmentService.estimateCost(candidates, options);
    sendEvent({
      type: 'estimate',
      estimate,
    });

    // Enrich candidates with progress updates
    // Client-provided serpApiKey takes priority over server env var
    const results = await ContactEnrichmentService.enrichCandidates(candidates, {
      credentials: {
        ...credentials,
        claudeApiKey: process.env.CLAUDE_API_KEY,
        serpApiKey: credentials.serpApiKey || process.env.SERP_API_KEY,
      },
      usePubmed: options.usePubmed !== false,
      useOrcid: options.useOrcid !== false,
      useClaudeSearch: options.useClaudeSearch === true,
      useSerpSearch: options.useSerpSearch === true,
      onProgress: (progress) => {
        sendEvent({
          type: 'progress',
          ...progress,
        });
      },
    });

    // Send final results
    sendEvent({
      type: 'complete',
      results: results.enriched,
      stats: results.stats,
    });

  } catch (error) {
    console.error('Contact enrichment error:', error);
    sendEvent({
      type: 'error',
      message: BASE_CONFIG.ERROR_MESSAGES.PROCESSING_FAILED,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    res.end();
  }
}
