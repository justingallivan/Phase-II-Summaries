import { createClaudeClient } from '../../shared/api/handlers/claudeClient';
import { createFileProcessor } from '../../shared/api/handlers/fileProcessor';
import { BASE_CONFIG, getModelForApp } from '../../shared/config/baseConfig';
import { getApiKeyManager } from '../../shared/utils/apiKeyManager';
import { applySecurityMiddleware } from '../../shared/api/middleware/security';
import { nextRateLimiter } from '../../shared/api/middleware/rateLimiter';
import { createSummarizationPrompt, createStructuredDataExtractionPrompt } from '../../shared/config/prompts/proposal-summarizer';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

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
      max: 20, 
      windowMs: 60000 
    })(req, res);
    if (!rateLimitCheck) {
      return;
    }

    const { files, apiKey: clientApiKey } = req.body;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ 
        error: 'No files to process',
        timestamp: new Date().toISOString()
      });
    }

    if (files.length > 10) {
      return res.status(400).json({ 
        error: 'Maximum 10 files allowed for proposal processing',
        timestamp: new Date().toISOString()
      });
    }

    // Get API key (prefer server-side, fall back to client)
    const apiKeyManager = getApiKeyManager();
    let apiKey;
    
    try {
      apiKey = apiKeyManager.selectApiKey(clientApiKey || req.apiKey);
    } catch (error) {
      return res.status(401).json({ 
        error: BASE_CONFIG.ERROR_MESSAGES.NO_API_KEY,
        timestamp: new Date().toISOString()
      });
    }

    // Initialize shared utilities
    const claudeClient = createClaudeClient(apiKey, {
      model: getModelForApp('phase-ii-writeup'),
      defaultMaxTokens: BASE_CONFIG.MODEL_PARAMS.DEFAULT_MAX_TOKENS,
      defaultTemperature: 0.3,
    });

    const fileProcessor = createFileProcessor({
      maxTextLength: BASE_CONFIG.FILE_PROCESSING.MAX_TEXT_LENGTH,
      minTextLength: BASE_CONFIG.FILE_PROCESSING.MIN_TEXT_LENGTH,
    });

    // Set up streaming response with proper SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const results = {};
    const totalFiles = files.length;
    
    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];
      
      // Calculate progress for this file (each file gets equal portion of 90%)
      const fileProgressStart = Math.round((i / totalFiles) * 90);
      const fileProgressEnd = Math.round(((i + 1) / totalFiles) * 90);
      const fileProgressRange = fileProgressEnd - fileProgressStart;
      
      // Send start-of-file progress update
      res.write(`data: ${JSON.stringify({
        progress: fileProgressStart,
        message: `Starting ${file.filename} (${i + 1}/${totalFiles})...`
      })}\n\n`);
      
      // Force flush and small delay to ensure streaming works
      if (res.flush) res.flush();
      await new Promise(resolve => setTimeout(resolve, 50));

      try {
        // Send file reading update (10% of this file's progress)
        res.write(`data: ${JSON.stringify({
          progress: fileProgressStart + Math.round(fileProgressRange * 0.1),
          message: `Reading ${file.filename}...`
        })}\n\n`);
        if (res.flush) res.flush();
        await new Promise(resolve => setTimeout(resolve, 50));

        // Decode base64 content
        const buffer = Buffer.from(file.content, 'base64');
        
        // Send PDF processing update (30% of this file's progress)
        res.write(`data: ${JSON.stringify({
          progress: fileProgressStart + Math.round(fileProgressRange * 0.3),
          message: `Extracting text from ${file.filename}...`
        })}\n\n`);
        if (res.flush) res.flush();
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Process PDF file
        const processedFile = await fileProcessor.processPDF(buffer, file.filename);
        
        // Send AI processing update (50% of this file's progress)
        res.write(`data: ${JSON.stringify({
          progress: fileProgressStart + Math.round(fileProgressRange * 0.5),
          message: `Generating Phase II writeup draft for ${file.filename}...`
        })}\n\n`);
        if (res.flush) res.flush();
        
        // Generate Phase II writeup using original prompt
        const prompt = createSummarizationPrompt(processedFile.text);
        const summary = await claudeClient.sendMessage(prompt, {
          maxTokens: 2000,
          temperature: 0.3
        });

        // Send structured data extraction update (80% of this file's progress)
        res.write(`data: ${JSON.stringify({
          progress: fileProgressStart + Math.round(fileProgressRange * 0.8),
          message: `Extracting proposal data from ${file.filename}...`
        })}\n\n`);
        if (res.flush) res.flush();

        // Try to extract structured data
        let structuredData = null;
        try {
          const structDataPrompt = createStructuredDataExtractionPrompt(
            processedFile.text,
            file.filename
          );
          
          structuredData = await claudeClient.sendMessageForJSON(structDataPrompt, {
            maxTokens: 300,
            temperature: 0.1
          });
        } catch (e) {
          console.warn('Failed to extract structured data for proposal:', e);
        }

        // Send completion update for this file (100% of this file's progress)
        res.write(`data: ${JSON.stringify({
          progress: fileProgressEnd,
          message: `Completed ${file.filename} (${i + 1}/${totalFiles})`
        })}\n\n`);
        if (res.flush) res.flush();

        results[file.filename] = {
          filename: file.filename,
          summary,
          metadata: {
            ...processedFile.metadata,
            processedAt: new Date().toISOString()
          },
          structuredData
        };

      } catch (fileError) {
        console.error(`Error processing ${file.filename}:`, fileError);
        results[file.filename] = {
          filename: file.filename,
          summary: `Error processing file: ${fileError.message}`,
          metadata: {
            error: true,
            errorMessage: fileError.message,
            processedAt: new Date().toISOString()
          },
          structuredData: null
        };
      }

      // Small delay to prevent overwhelming the API
      if (i < totalFiles - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Send final results
    res.write(`data: ${JSON.stringify({
      progress: 100,
      message: `Complete! Generated ${totalFiles} Phase II writeup draft${totalFiles > 1 ? 's' : ''}.`,
      results,
      summary: {
        totalFiles,
        successCount: Object.values(results).filter(r => !r.metadata?.error).length,
        errorCount: Object.values(results).filter(r => r.metadata?.error).length
      }
    })}\n\n`);

    res.end();

  } catch (error) {
    console.error('Proposal processing error:', error);
    
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
        message: error.message || 'An error occurred during proposal processing'
      })}\n\n`);
      res.end();
    }
  }
}