import { createClaudeClient } from '../../shared/api/handlers/claudeClient';
import { createFileProcessor } from '../../shared/api/handlers/fileProcessor';
import { BASE_CONFIG } from '../../shared/config/baseConfig';
import { CONFIG, PROMPTS } from '../../lib/config';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uploadedFiles, apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: BASE_CONFIG.ERROR_MESSAGES.NO_API_KEY });
    }

    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'No files to process' });
    }

    const claudeClient = createClaudeClient(apiKey, {
      model: CONFIG.CLAUDE_MODEL,
      defaultMaxTokens: CONFIG.DEFAULT_MAX_TOKENS,
      defaultTemperature: CONFIG.SUMMARIZATION_TEMPERATURE,
    });

    const fileProcessor = createFileProcessor({
      maxTextLength: BASE_CONFIG.FILE_PROCESSING.MAX_TEXT_LENGTH,
      minTextLength: BASE_CONFIG.FILE_PROCESSING.MIN_TEXT_LENGTH,
    });

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    const results = {};
    
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      const progress = Math.round((i / uploadedFiles.length) * 90);
      
      res.write(`data: ${JSON.stringify({
        progress,
        message: `Processing ${file.filename}...`
      })}\n\n`);

      try {
        const summary = await generateSummaryFromBlobUrl(
          file.url,
          file.filename,
          claudeClient,
          fileProcessor
        );
        
        const structuredData = await extractStructuredData(
          file.url,
          file.filename,
          claudeClient,
          fileProcessor
        );

        results[file.filename] = {
          ...summary,
          structuredData
        };

      } catch (fileError) {
        console.error(`Error processing ${file.filename}:`, fileError);
        results[file.filename] = createErrorResult(file.filename, fileError.message);
      }
    }

    res.write(`data: ${JSON.stringify({
      progress: 100,
      message: 'Complete!',
      results
    })}\n\n`);

    res.end();

  } catch (error) {
    console.error('API error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: BASE_CONFIG.ERROR_MESSAGES.PROCESSING_FAILED,
        details: error.message 
      });
    }
  }
}

async function generateSummaryFromBlobUrl(blobUrl, filename, claudeClient, fileProcessor) {
  try {
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const processedFile = await fileProcessor.processFile(buffer, filename);
    
    const prompt = PROMPTS.SUMMARIZATION(processedFile.text);
    const summary = await claudeClient.sendMessage(prompt);

    return {
      filename,
      summary,
      metadata: processedFile.metadata
    };
  } catch (error) {
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

async function extractStructuredData(blobUrl, filename, claudeClient, fileProcessor) {
  try {
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const processedFile = await fileProcessor.processFile(buffer, filename);
    
    const prompt = PROMPTS.STRUCTURED_DATA_EXTRACTION(processedFile.text, filename);
    const structuredData = await claudeClient.sendMessageForJSON(prompt);

    return structuredData;
  } catch (error) {
    console.warn('Failed to extract structured data:', error);
    return null;
  }
}

function createErrorResult(filename, errorMessage) {
  return {
    filename,
    summary: `Error processing file: ${errorMessage}`,
    metadata: {
      error: true,
      errorMessage
    },
    structuredData: null
  };
}