/**
 * API Route: /api/reviewer-finder/discover
 *
 * Stage 2 of Expert Reviewer Finder - Database Discovery
 *
 * Accepts analysis results from Stage 1 and:
 * - Track A: Verifies Claude's suggestions via PubMed
 * - Track B: Discovers new candidates from database searches
 * - Generates reasoning for discovered candidates (second Claude call)
 *
 * Uses streaming SSE for real-time progress updates.
 */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
  maxDuration: 300, // Allow up to 5 minutes for database searches
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
      apiKey,
      analysisResult,
      options = {}
    } = req.body;

    if (!apiKey) {
      sendEvent('error', { message: 'API key is required' });
      return res.end();
    }

    if (!analysisResult) {
      sendEvent('error', { message: 'Analysis result from Stage 1 is required' });
      return res.end();
    }

    const {
      searchPubmed = true,
      searchArxiv = true,
      searchBiorxiv = true,
      generateReasoning = true
    } = options;

    // Debug: Log what we received from Stage 1
    console.log('[Discover API] Received analysisResult:', {
      proposalTitle: analysisResult.proposalInfo?.title,
      suggestionCount: analysisResult.reviewerSuggestions?.length,
      suggestions: analysisResult.reviewerSuggestions?.map(s => ({ name: s.name, expertise: s.expertiseAreas }))
    });

    sendEvent('progress', {
      stage: 'discovery',
      message: 'Starting database discovery...',
      options: { searchPubmed, searchArxiv, searchBiorxiv }
    });

    // Import discovery service
    const { DiscoveryService } = require('../../../lib/services/discovery-service');

    // Run discovery
    const discoveryResults = await DiscoveryService.discover(analysisResult, {
      searchPubmed,
      searchArxiv,
      searchBiorxiv,
      onProgress: (progress) => {
        sendEvent('progress', progress);
      }
    });

    sendEvent('progress', {
      stage: 'discovery',
      status: 'verified',
      message: `Verified ${discoveryResults.verified.length} Claude suggestions`,
      data: {
        verified: discoveryResults.verified.length,
        unverified: discoveryResults.unverified.length
      }
    });

    // Check for coauthor COI if we have proposal authors
    let verifiedWithCOI = discoveryResults.verified;
    const proposalAuthorsRaw = analysisResult.proposalInfo?.proposalAuthors;

    if (proposalAuthorsRaw && proposalAuthorsRaw.toLowerCase() !== 'not specified') {
      // Parse proposal authors (comma-separated)
      const proposalAuthors = proposalAuthorsRaw
        .split(',')
        .map(a => a.trim())
        .filter(a => a.length > 0);

      if (proposalAuthors.length > 0 && discoveryResults.verified.length > 0) {
        sendEvent('progress', {
          stage: 'coi_check',
          status: 'starting',
          message: `Checking coauthorship history with ${proposalAuthors.length} proposal author(s)...`
        });

        verifiedWithCOI = await DiscoveryService.checkCoauthorshipsForCandidates(
          discoveryResults.verified,
          proposalAuthors,
          (progress) => sendEvent('progress', progress)
        );

        const coiCount = verifiedWithCOI.filter(c => c.hasCoauthorCOI).length;
        sendEvent('progress', {
          stage: 'coi_check',
          status: 'complete',
          message: coiCount > 0
            ? `Found ${coiCount} candidate(s) with coauthorship history`
            : 'No coauthorship conflicts found'
        });
      }
    }

    sendEvent('progress', {
      stage: 'discovery',
      status: 'discovered',
      message: `Discovered ${discoveryResults.discovered.length} new candidates`,
      data: {
        discovered: discoveryResults.discovered.length,
        stats: discoveryResults.stats
      }
    });

    // Generate reasoning for discovered candidates (second Claude call)
    let enhancedDiscovered = discoveryResults.discovered;

    if (generateReasoning && discoveryResults.discovered.length > 0) {
      sendEvent('progress', {
        stage: 'reasoning',
        message: `Generating reasoning for ${discoveryResults.discovered.length} discovered candidates...`
      });

      const { ClaudeReviewerService } = require('../../../lib/services/claude-reviewer-service');

      enhancedDiscovered = await ClaudeReviewerService.generateDiscoveredReasoning(
        analysisResult.proposalInfo,
        discoveryResults.discovered,
        apiKey,
        (progress) => {
          sendEvent('progress', progress);
        }
      );

      // Filter out irrelevant candidates (those marked as not relevant by Claude)
      const beforeFilter = enhancedDiscovered.length;
      enhancedDiscovered = enhancedDiscovered.filter(c => c.isRelevant !== false);
      const filtered = beforeFilter - enhancedDiscovered.length;

      if (filtered > 0) {
        sendEvent('progress', {
          stage: 'filtering',
          message: `Filtered out ${filtered} irrelevant candidates from database discoveries`
        });
      }
    }

    // Combine and rank all candidates
    const proposalKeywords = analysisResult.proposalInfo?.keywords?.split(',').map(k => k.trim()) || [];

    const combinedResults = {
      verified: verifiedWithCOI,
      unverified: discoveryResults.unverified,
      discovered: enhancedDiscovered,
      stats: discoveryResults.stats
    };

    const rankedCandidates = DiscoveryService.rankAllCandidates(
      combinedResults,
      proposalKeywords
    );

    sendEvent('result', {
      verified: verifiedWithCOI,
      unverified: discoveryResults.unverified,
      discovered: enhancedDiscovered,
      ranked: rankedCandidates,
      stats: discoveryResults.stats
    });

    sendEvent('complete', {
      message: 'Discovery complete',
      totalCandidates: rankedCandidates.length,
      verifiedCount: verifiedWithCOI.length,
      discoveredCount: enhancedDiscovered.length
    });

  } catch (error) {
    console.error('Discover API error:', error);
    sendEvent('error', {
      message: error.message || 'An unexpected error occurred',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }

  res.end();
}
