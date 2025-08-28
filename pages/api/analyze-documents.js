import { createClaudeClient } from '../../shared/api/handlers/claudeClient';
import { createFileProcessor } from '../../shared/api/handlers/fileProcessor';
import { BASE_CONFIG } from '../../shared/config/baseConfig';
import { getApiKeyManager } from '../../shared/utils/apiKeyManager';
import { applySecurityMiddleware } from '../../shared/api/middleware/security';
import { nextRateLimiter } from '../../shared/api/middleware/rateLimiter';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// Document analysis prompt
const ANALYSIS_PROMPT = (text, filename) => `Please analyze this document and provide a comprehensive analysis with the following sections:

**DOCUMENT OVERVIEW**
Provide a 2-3 sentence summary of what this document is about.

**KEY POINTS**
• List the 3-5 most important points or findings
• Use bullet points for clarity
• Each point should be 1-2 sentences

**MAIN THEMES**
Identify and briefly describe 2-3 main themes or topics discussed in the document.

**TECHNICAL DETAILS**
If applicable, note any important technical information, methodologies, or specifications mentioned.

**RECOMMENDATIONS OR CONCLUSIONS**
Summarize any recommendations, conclusions, or next steps mentioned in the document.

**NOTABLE INSIGHTS**
Highlight 1-2 particularly interesting or unexpected insights from the document.

Document title/filename: ${filename}
Document text:
---
${text.substring(0, 15000)}${text.length > 15000 ? '...[truncated]' : ''}

Please provide a well-structured analysis that would be valuable for someone who needs to quickly understand this document.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Apply security middleware
    const securityCheck = await applySecurityMiddleware(req, res);
    if (!securityCheck) {
      return;
    }

    // Apply rate limiting
    const rateLimitCheck = await nextRateLimiter({ 
      max: 30, 
      windowMs: 60000 
    })(req, res);
    if (!rateLimitCheck) {
      return;
    }

    const { uploadedFiles } = req.body;
    
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({ 
        error: 'No files to process',
        timestamp: new Date().toISOString()
      });
    }

    // Get API key (prefer server-side, fall back to client)
    const apiKeyManager = getApiKeyManager();
    let apiKey;
    
    try {
      apiKey = apiKeyManager.selectApiKey(req.apiKey);
    } catch (error) {
      return res.status(401).json({ 
        error: BASE_CONFIG.ERROR_MESSAGES.NO_API_KEY,
        timestamp: new Date().toISOString()
      });
    }

    // Initialize shared utilities
    const claudeClient = createClaudeClient(apiKey, {
      model: BASE_CONFIG.CLAUDE.DEFAULT_MODEL,
      defaultMaxTokens: BASE_CONFIG.MODEL_PARAMS.DEFAULT_MAX_TOKENS,
      defaultTemperature: BASE_CONFIG.MODEL_PARAMS.DEFAULT_TEMPERATURE,
    });

    const fileProcessor = createFileProcessor({
      maxTextLength: BASE_CONFIG.FILE_PROCESSING.MAX_TEXT_LENGTH,
      minTextLength: BASE_CONFIG.FILE_PROCESSING.MIN_TEXT_LENGTH,
    });

    // Set up streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    const results = {};
    const totalFiles = uploadedFiles.length;
    
    for (let i = 0; i < totalFiles; i++) {
      const file = uploadedFiles[i];
      const progress = Math.round(((i + 1) / totalFiles) * 90);
      
      // Send progress update
      res.write(`data: ${JSON.stringify({
        progress,
        message: `Analyzing ${file.filename} (${i + 1}/${totalFiles})...`
      })}\n\n`);

      try {
        // Fetch file from blob storage
        const response = await fetch(file.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        
        const buffer = Buffer.from(await response.arrayBuffer());
        
        // Process file with shared file processor
        const processedFile = await fileProcessor.processFile(buffer, file.filename);
        
        // Generate analysis using Claude
        const prompt = ANALYSIS_PROMPT(processedFile.text, file.filename);
        const analysis = await claudeClient.sendMessage(prompt, {
          maxTokens: 2500,
          temperature: 0.3
        });

        // Try to extract structured data
        let structuredData = null;
        try {
          const structurePrompt = `Based on this document, extract key metadata as JSON:
{
  "documentType": "type of document",
  "subject": "main subject/topic",
  "date": "date if mentioned",
  "author": "author if mentioned",
  "organization": "organization if mentioned",
  "keywords": ["list", "of", "keywords"],
  "sentiment": "positive/negative/neutral"
}

Document: ${processedFile.text.substring(0, 5000)}

Return only valid JSON, no other text.`;
          
          structuredData = await claudeClient.sendMessageForJSON(structurePrompt, {
            maxTokens: 500,
            temperature: 0.1
          });
        } catch (e) {
          console.warn('Failed to extract structured data:', e);
        }

        results[file.filename] = {
          filename: file.filename,
          summary: analysis,
          metadata: processedFile.metadata,
          structuredData
        };

      } catch (fileError) {
        console.error(`Error processing ${file.filename}:`, fileError);
        results[file.filename] = {
          filename: file.filename,
          summary: `Error processing file: ${fileError.message}`,
          metadata: {
            error: true,
            errorMessage: fileError.message
          },
          structuredData: null
        };
      }
    }

    // Send final results
    res.write(`data: ${JSON.stringify({
      progress: 100,
      message: 'Analysis complete!',
      results
    })}\n\n`);

    res.end();

  } catch (error) {
    console.error('API error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: BASE_CONFIG.ERROR_MESSAGES.PROCESSING_FAILED,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        timestamp: new Date().toISOString()
      });
    } else {
      // If headers were already sent, send error in stream
      res.write(`data: ${JSON.stringify({
        error: true,
        message: error.message || 'An error occurred during processing'
      })}\n\n`);
      res.end();
    }
  }
}