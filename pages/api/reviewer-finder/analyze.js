/**
 * API Route: /api/reviewer-finder/analyze
 *
 * Stage 1 of Expert Reviewer Finder - Claude Analysis
 *
 * Accepts a proposal (via Vercel Blob URL or direct text) and returns:
 * - Proposal metadata
 * - Reviewer suggestions with reasoning
 * - Optimized search queries for databases
 *
 * Uses streaming SSE for real-time progress updates.
 */

import { put } from '@vercel/blob';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
  maxDuration: 60, // Allow up to 60 seconds for Claude analysis
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
    const { apiKey, proposalText, blobUrl, additionalNotes, excludedNames } = req.body;

    if (!apiKey) {
      sendEvent('error', { message: 'API key is required' });
      return res.end();
    }

    // Get proposal text
    let text = proposalText;

    if (!text && blobUrl) {
      sendEvent('progress', { stage: 'upload', message: 'Fetching uploaded file...' });

      // Fetch from Vercel Blob
      const blobResponse = await fetch(blobUrl);
      if (!blobResponse.ok) {
        throw new Error('Failed to fetch uploaded file');
      }

      const contentType = blobResponse.headers.get('content-type');

      if (contentType?.includes('application/pdf')) {
        // Parse PDF
        sendEvent('progress', { stage: 'processing', message: 'Extracting text from PDF...' });
        const pdfParse = (await import('pdf-parse')).default;
        const buffer = Buffer.from(await blobResponse.arrayBuffer());
        const pdfData = await pdfParse(buffer);
        text = pdfData.text;
      } else {
        // Plain text
        text = await blobResponse.text();
      }
    }

    if (!text || text.trim().length < 100) {
      sendEvent('error', { message: 'Proposal text is too short or empty' });
      return res.end();
    }

    sendEvent('progress', {
      stage: 'analysis',
      message: 'Analyzing proposal with Claude...',
      textLength: text.length
    });

    // Import and run Claude analysis
    const { ClaudeReviewerService } = require('../../../lib/services/claude-reviewer-service');

    const result = await ClaudeReviewerService.analyzeProposal(text, apiKey, {
      additionalNotes: additionalNotes || '',
      excludedNames: excludedNames || [],
      onProgress: (progress) => {
        sendEvent('progress', progress);
      }
    });

    // DEBUG: Log what we got from Claude analysis
    console.log('=== ANALYZE API DEBUG ===');
    console.log('Result success:', result.success);
    console.log('Reviewer suggestions count:', result.reviewerSuggestions?.length);
    console.log('First suggestion:', JSON.stringify(result.reviewerSuggestions?.[0], null, 2));
    console.log('Search queries:', JSON.stringify(result.searchQueries, null, 2));
    console.log('=========================');

    if (!result.success) {
      sendEvent('error', { message: 'Analysis failed', details: result });
      return res.end();
    }

    // Send results
    sendEvent('result', {
      proposalInfo: result.proposalInfo,
      reviewerSuggestions: result.reviewerSuggestions,
      searchQueries: result.searchQueries,
      validation: result.validation
    });

    sendEvent('complete', {
      message: 'Analysis complete',
      suggestionCount: result.reviewerSuggestions?.length || 0,
      queryCount: Object.values(result.searchQueries || {}).flat().length
    });

  } catch (error) {
    console.error('Analyze API error:', error);
    sendEvent('error', {
      message: error.message || 'An unexpected error occurred',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }

  res.end();
}
