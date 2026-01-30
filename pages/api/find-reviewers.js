import { createClaudeClient } from '../../shared/api/handlers/claudeClient';
import { createFileProcessor } from '../../shared/api/handlers/fileProcessor';
import { getApiKeyManager } from '../../shared/utils/apiKeyManager';
import { nextRateLimiter } from '../../shared/api/middleware/rateLimiter';
import { createExtractionPrompt, createReviewerPrompt, parseExtractionResponse } from '../../shared/config/prompts/find-reviewers';
import { parseReviewers, generateReviewerCSV } from '../../shared/utils/reviewerParser';
import { requireAuth } from '../../lib/utils/auth';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb', // Only for JSON payload with blob URLs
    },
  },
};

// Create rate limiter for this endpoint
const rateLimiter = nextRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute for AI processing
});

export default async function handler(req, res) {
  console.log('Find Reviewers API called:', new Date().toISOString());

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  // Apply rate limiting
  const rateLimitResult = await rateLimiter(req, res);
  if (!rateLimitResult) {
    console.log('Rate limit exceeded for request');
    return; // Response already sent by rate limiter
  }

  try {
    console.log('Parsing request body...');
    const { file, apiKey, additionalNotes = '', suggestedReviewers = '', excludedReviewers = '', reviewerCount = 15 } = req.body;
    
    if (!file) {
      console.log('Error: No file provided');
      return res.status(400).json({ error: 'No file provided' });
    }

    console.log('File received:', file.filename, 'Size:', file.size);

    // Validate and select API key
    const apiKeyManager = getApiKeyManager();
    let validatedKey;
    try {
      validatedKey = apiKeyManager.selectApiKey(apiKey);
      console.log('API key validated');
    } catch (error) {
      console.log('Error: Invalid or missing API key');
      return res.status(401).json({ error: 'Invalid or missing API key. Please check your Claude API key.' });
    }

    // Process the PDF file from blob URL
    console.log('Processing PDF file from blob URL...');
    const fileProcessor = createFileProcessor();
    
    // Fetch file from blob URL
    const fileResponse = await fetch(file.url);
    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch file from blob storage: ${fileResponse.statusText}`);
    }
    
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
    const { text: proposalText, metadata } = await fileProcessor.processFile(
      fileBuffer,
      file.filename || 'proposal.pdf'
    );

    if (!proposalText || proposalText.length < 100) {
      return res.status(400).json({ error: 'Could not extract sufficient text from the PDF' });
    }

    // Initialize Claude client
    console.log('Initializing Claude client...');
    const claudeClient = createClaudeClient(validatedKey);

    // Step 1: Extract structured information from the proposal
    console.log('Step 1: Extracting structured information from proposal...');
    const extractionPrompt = createExtractionPrompt(proposalText, additionalNotes);
    
    let extractionResponse;
    try {
      extractionResponse = await claudeClient.sendMessage(extractionPrompt, {
        maxTokens: 2000,
        temperature: 0.3
      });
      console.log('Extraction successful');
    } catch (claudeError) {
      console.error('Claude API error during extraction:', claudeError);
      if (claudeError.message.includes('429') || claudeError.message.includes('rate')) {
        return res.status(429).json({ 
          error: 'Claude API rate limit exceeded. Please wait a moment and try again.',
          retryAfter: 60,
          details: process.env.NODE_ENV === 'development' ? claudeError.message : undefined
        });
      }
      throw claudeError;
    }

    const extractedInfo = parseExtractionResponse(extractionResponse);
    console.log('Extracted info:', Object.keys(extractedInfo));

    // Step 2: Find expert reviewers using the comprehensive prompt
    console.log('Step 2: Finding expert reviewers...');
    const reviewerPrompt = createReviewerPrompt(
      extractedInfo,
      suggestedReviewers,
      excludedReviewers,
      proposalText,
      reviewerCount
    );

    let reviewerResponse;
    try {
      reviewerResponse = await claudeClient.sendMessage(reviewerPrompt, {
        maxTokens: 4000,
        temperature: 0.5
      });
      console.log('Reviewer search successful');
    } catch (claudeError) {
      console.error('Claude API error during reviewer search:', claudeError);
      if (claudeError.message.includes('429') || claudeError.message.includes('rate')) {
        return res.status(429).json({ 
          error: 'Claude API rate limit exceeded. Please wait a moment and try again.',
          retryAfter: 60,
          details: process.env.NODE_ENV === 'development' ? claudeError.message : undefined
        });
      }
      throw claudeError;
    }

    // Parse reviewers and generate CSV
    let parsedReviewers = [];
    let csvData = 'name,institution\n';
    
    try {
      parsedReviewers = parseReviewers(reviewerResponse);
      csvData = generateReviewerCSV(parsedReviewers);
      console.log(`Successfully parsed ${parsedReviewers.length} reviewers`);
    } catch (parseError) {
      console.error('Error parsing reviewers:', parseError);
      // Continue with empty data rather than failing the whole request
    }
    
    // No cleanup needed for blob files

    // Return the results
    return res.status(200).json({
      success: true,
      extractedInfo,
      reviewers: reviewerResponse,
      csvData,
      parsedReviewers,
      metadata: {
        fileName: file.filename,
        processingTime: new Date().toISOString(),
        proposalLength: proposalText.length,
        reviewerCount: parsedReviewers.length,
        ...metadata
      }
    });

  } catch (error) {
    console.error('Error in find-reviewers API:', error);
    return res.status(500).json({ 
      error: 'Failed to process proposal and find reviewers',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}