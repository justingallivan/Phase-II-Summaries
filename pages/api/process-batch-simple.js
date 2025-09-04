import pdf from 'pdf-parse';
import { CONFIG, PROMPTS } from '../../lib/config';

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
    const { files, summaryLength = 2, summaryLevel = 'technical-non-expert', apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files to process' });
    }

    if (files.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 files allowed for batch processing' });
    }

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
      try {
        res.write(`data: ${JSON.stringify({
          progress: fileProgressStart,
          message: `Starting ${file.filename} (${i + 1}/${totalFiles})...`
        })}\n\n`);
      } catch (e) {
        console.error('JSON serialization error in progress update:', e);
      }
      
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
        
        // Extract text from PDF
        const pdfData = await pdf(buffer);
        const text = pdfData.text;

        if (!text || text.trim().length < 100) {
          throw new Error('PDF appears to be empty or contains insufficient text');
        }
        
        // Send AI processing update (50% of this file's progress)
        res.write(`data: ${JSON.stringify({
          progress: fileProgressStart + Math.round(fileProgressRange * 0.5),
          message: `Generating ${summaryLength}-page summary for ${file.filename}...`
        })}\n\n`);
        if (res.flush) res.flush();
        
        // Generate batch summary using Claude
        const prompt = BATCH_SUMMARY_PROMPT(text, file.filename, summaryLength, summaryLevel);
        const maxTokens = Math.min(4000, 800 * summaryLength);
        
        const response = await fetch(CONFIG.CLAUDE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey.trim(),
            'anthropic-version': CONFIG.ANTHROPIC_VERSION
          },
          body: JSON.stringify({
            model: CONFIG.CLAUDE_MODEL,
            max_tokens: maxTokens,
            temperature: 0.2,
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Claude API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const summary = data.content[0].text;

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

From: ${text.substring(0, 3000)}
Return only JSON.`;
          
          const metaResponse = await fetch(CONFIG.CLAUDE_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey.trim(),
              'anthropic-version': CONFIG.ANTHROPIC_VERSION
            },
            body: JSON.stringify({
              model: CONFIG.CLAUDE_MODEL,
              max_tokens: 300,
              temperature: 0.1,
              messages: [{
                role: 'user',
                content: metaPrompt
              }]
            })
          });
          
          if (metaResponse.ok) {
            const metaData = await metaResponse.json();
            const jsonText = metaData.content[0].text;
            structuredData = JSON.parse(jsonText);
          }
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
            pages: pdfData.numpages,
            wordCount: text.split(/\s+/).length,
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
    try {
      const finalResponse = {
        progress: 100,
        message: `Batch complete! Processed ${totalFiles} proposals with ${summaryLength}-page summaries.`,
        results,
        summary: {
          totalFiles,
          successCount: Object.values(results).filter(r => !r.metadata?.error).length,
          errorCount: Object.values(results).filter(r => r.metadata?.error).length,
          configuration: {
            summaryLength: `${summaryLength} page${summaryLength > 1 ? 's' : ''}`,
            summaryLevel: summaryLevel ? summaryLevel.replace('-', ' ') : 'technical non expert'
          }
        }
      };
      
      res.write(`data: ${JSON.stringify(finalResponse)}\n\n`);
    } catch (jsonError) {
      console.error('Error serializing final response:', jsonError);
      res.write(`data: ${JSON.stringify({
        progress: 100,
        message: 'Batch processing completed with serialization errors',
        error: true
      })}\n\n`);
    }

    res.end();

  } catch (error) {
    console.error('Batch processing error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
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