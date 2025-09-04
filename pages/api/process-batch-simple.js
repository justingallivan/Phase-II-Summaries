import { createClaudeClient } from '../../shared/api/handlers/claudeClient';
import { createFileProcessor } from '../../shared/api/handlers/fileProcessor';
import { BASE_CONFIG } from '../../shared/config/baseConfig';
import { getApiKeyManager } from '../../shared/utils/apiKeyManager';
import { applySecurityMiddleware } from '../../shared/api/middleware/security';
import { nextRateLimiter } from '../../shared/api/middleware/rateLimiter';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

// Batch processing prompt with customizable length and level
const BATCH_SUMMARY_PROMPT = (text, filename, length, level) => {
  const lengthInstructions = {
    1: 'approximately 300-400 words (1 page)',
    2: 'approximately 600-800 words (2 pages)', 
    3: 'approximately 1000-1200 words (3 pages)',
    4: 'approximately 1400-1600 words (4 pages)',
    5: 'approximately 1800-2000 words (5 pages)'
  };

  const levelInstructions = {
    'general-audience': 'Use clear, accessible language suitable for general audiences. Avoid technical jargon and explain complex concepts simply.',
    'technical-non-expert': 'Use professional language with some technical terms, but explain specialized concepts for readers with general technical background.',
    'technical-expert': 'Use technical terminology appropriate for experts in the field. Assume familiarity with domain-specific concepts.',
    'academic': 'Use formal academic language and terminology. Focus on methodology, theoretical frameworks, and scholarly significance.'
  };

  return `Please create a research proposal summary following these specifications:

**LENGTH**: ${lengthInstructions[length]}
**AUDIENCE**: ${levelInstructions[level]}

**STRUCTURE** (use this exact format):

**EXECUTIVE SUMMARY**
• [Key scientific problem - 1-2 sentences]
• [Main hypothesis/approach - 1-2 sentences] 
• [Principal investigator and qualifications - 1-2 sentences]
• [Expected impact - 1-2 sentences]
• [Funding justification - 1-2 sentences]

**BACKGROUND & SIGNIFICANCE**
[Detailed paragraph explaining the scientific context, current knowledge gaps, and why this research matters]

**RESEARCH APPROACH**
[Comprehensive description of methodology, techniques, experimental design, and timeline]

**PERSONNEL & EXPERTISE**
[Information about the research team, their qualifications, and relevant experience]

**INNOVATION & IMPACT**
[Discussion of novel aspects, potential breakthroughs, and broader implications]

${length >= 3 ? '**TECHNICAL DETAILS**\n[Additional technical methodology, equipment, protocols if length permits]\n\n' : ''}

${length >= 4 ? '**PRELIMINARY DATA**\n[Any existing results, feasibility studies, or supporting evidence if mentioned]\n\n' : ''}

${length >= 5 ? '**BROADER IMPACTS**\n[Educational components, societal benefits, commercialization potential if mentioned]\n\n' : ''}

**FUNDING JUSTIFICATION**
[Why traditional funding wouldn't support this work - emphasize innovation, risk, or interdisciplinary nature]

Document: ${filename}
Content: ${text.substring(0, 12000)}${text.length > 12000 ? '...[truncated]' : ''}

Write ${lengthInstructions[length]} maintaining ${level.replace('-', ' ')} level throughout.`;
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

    // Apply rate limiting (more restrictive for batch processing)
    const rateLimitCheck = await nextRateLimiter({ 
      max: 10, 
      windowMs: 60000 
    })(req, res);
    if (!rateLimitCheck) {
      return;
    }

    const { files, summaryLength = 2, summaryLevel = 'technical-non-expert', apiKey: clientApiKey } = req.body;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ 
        error: 'No files to process',
        timestamp: new Date().toISOString()
      });
    }

    if (files.length > 20) {
      return res.status(400).json({ 
        error: 'Maximum 20 files allowed for batch processing',
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

    // Initialize shared utilities with higher token limit for longer summaries
    const maxTokens = Math.min(4000, 800 * summaryLength);
    const claudeClient = createClaudeClient(apiKey, {
      model: BASE_CONFIG.CLAUDE.DEFAULT_MODEL,
      defaultMaxTokens: maxTokens,
      defaultTemperature: 0.2, // Lower temperature for consistency
    });

    const fileProcessor = createFileProcessor({
      maxTextLength: BASE_CONFIG.FILE_PROCESSING.MAX_TEXT_LENGTH,
      minTextLength: BASE_CONFIG.FILE_PROCESSING.MIN_TEXT_LENGTH,
    });

    // Set up streaming response with proper SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

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
          message: `Generating ${summaryLength}-page summary for ${file.filename}...`
        })}\n\n`);
        if (res.flush) res.flush();
        
        // Generate batch summary using Claude
        const prompt = BATCH_SUMMARY_PROMPT(
          processedFile.text, 
          file.filename, 
          summaryLength, 
          summaryLevel
        );
        
        const summary = await claudeClient.sendMessage(prompt, {
          maxTokens,
          temperature: 0.2
        });

        // Send metadata extraction update (80% of this file's progress)
        res.write(`data: ${JSON.stringify({
          progress: fileProgressStart + Math.round(fileProgressRange * 0.8),
          message: `Extracting metadata from ${file.filename}...`
        })}\n\n`);
        if (res.flush) res.flush();

        // Try to extract basic metadata
        let structuredData = null;
        try {
          const metaPrompt = `Extract basic proposal info as JSON:
{
  "institution": "primary institution",
  "principal_investigator": "PI name",
  "research_area": "field of research",
  "funding_amount": "amount if mentioned",
  "keywords": ["key", "terms"]
}

From: ${processedFile.text.substring(0, 3000)}
Return only JSON.`;
          
          structuredData = await claudeClient.sendMessageForJSON(metaPrompt, {
            maxTokens: 300,
            temperature: 0.1
          });
        } catch (e) {
          console.warn('Failed to extract structured data for batch:', e);
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
            summaryLength,
            summaryLevel,
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
            summaryLength,
            summaryLevel,
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
      message: `Batch complete! Processed ${totalFiles} proposals with ${summaryLength}-page summaries.`,
      results,
      summary: {
        totalFiles,
        successCount: Object.values(results).filter(r => !r.metadata?.error).length,
        errorCount: Object.values(results).filter(r => r.metadata?.error).length,
        configuration: {
          summaryLength: `${summaryLength} page${summaryLength > 1 ? 's' : ''}`,
          summaryLevel: summaryLevel.replace('-', ' ')
        }
      }
    })}\n\n`);

    res.end();

  } catch (error) {
    console.error('Batch processing error:', error);
    
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
        message: error.message || 'An error occurred during batch processing'
      })}\n\n`);
      res.end();
    }
  }
}