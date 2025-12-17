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
 *   credentials: { orcidClientId, orcidClientSecret, claudeApiKey },
 *   options: { usePubmed, useOrcid, useClaudeSearch }
 * }
 *
 * Response: Server-Sent Events (SSE) stream with progress updates
 */

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

  const { candidates, credentials = {}, options = {} } = req.body;

  // Validate input
  if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: 'No candidates provided' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

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
      message: error.message || 'Enrichment failed',
    });
  } finally {
    res.end();
  }
}
