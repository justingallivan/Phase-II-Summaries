import pdf from 'pdf-parse';
import { CONFIG, PROMPTS } from '../../lib/config';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { files, apiKey, summaryLength, summaryLevel } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No file URLs provided' });
    }

    const pageLength = summaryLength || 2; // Default to 2 pages if not specified
    const techLevel = summaryLevel || 'technical-non-expert'; // Default to technical for non-expert

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const results = {};
    const totalFiles = files.length;

    for (let i = 0; i < files.length; i++) {
      const fileInfo = files[i];
      const progress = Math.round(((i + 0.5) / totalFiles) * 100);
      
      // Send progress update
      res.write(`data: ${JSON.stringify({
        progress,
        message: `Processing ${fileInfo.filename} (${i + 1}/${totalFiles})...`
      })}\n\n`);

      try {
        // Fetch PDF from Vercel Blob
        const response = await fetch(fileInfo.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.status}`);
        }
        
        const buffer = await response.arrayBuffer();
        const data = await pdf(Buffer.from(buffer));
        
        if (!data.text || data.text.trim().length < 100) {
          throw new Error('PDF appears to be empty or contains insufficient text');
        }

        // Generate batch summary with custom length and technical level
        const batchPrompt = getBatchPrompt(data.text, pageLength, techLevel, fileInfo.filename);
        
        const summaryResponse = await fetch(CONFIG.CLAUDE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey.trim(),
            'anthropic-version': CONFIG.ANTHROPIC_VERSION
          },
          body: JSON.stringify({
            model: CONFIG.CLAUDE_MODEL,
            max_tokens: getMaxTokensForPages(pageLength),
            temperature: CONFIG.SUMMARIZATION_TEMPERATURE,
            messages: [{
              role: 'user',
              content: batchPrompt
            }]
          })
        });

        if (!summaryResponse.ok) {
          const errorText = await summaryResponse.text();
          console.error('Claude API error for file:', fileInfo.filename, errorText);
          throw new Error(`Claude API error ${summaryResponse.status}: ${errorText}`);
        }

        const summaryData = await summaryResponse.json();
        const summaryText = summaryData.content[0].text;

        // Store result
        results[fileInfo.filename] = {
          formatted: summaryText,
          structured: {
            filename: fileInfo.filename,
            summaryLength: pageLength,
            processingDate: new Date().toISOString()
          }
        };

      } catch (error) {
        console.error(`Error processing ${fileInfo.filename}:`, error);
        results[fileInfo.filename] = {
          formatted: `# Error Processing ${fileInfo.filename}\n\n${error.message}`,
          structured: {
            filename: fileInfo.filename,
            error: error.message
          }
        };
      }
    }

    // Send final results
    res.write(`data: ${JSON.stringify({
      progress: 100,
      message: `Batch processing complete! Processed ${totalFiles} files.`,
      results: results
    })}\n\n`);

    res.end();

  } catch (error) {
    console.error('API error:', error);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({
        error: error.message
      })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: error.message });
    }
  }
}

function getMaxTokensForPages(pageLength) {
  // Approximate token counts for different page lengths
  const tokenMap = {
    1: 800,
    2: 1600,
    3: 2400,
    4: 3200,
    5: 4000
  };
  return tokenMap[pageLength] || 1600;
}

function getBatchPrompt(text, pageLength, techLevel, filename) {
  const lengthGuidance = {
    1: 'Create a CONCISE 1-page summary (approximately 500 words). Focus only on the most critical information.',
    2: 'Create a 2-page summary (approximately 1000 words). Include key details while maintaining brevity.',
    3: 'Create a 3-page summary (approximately 1500 words). Provide comprehensive coverage with moderate detail.',
    4: 'Create a 4-page summary (approximately 2000 words). Include substantial detail and supporting information.',
    5: 'Create a DETAILED 5-page summary (approximately 2500 words). Provide thorough coverage with full context.'
  };

  const technicalGuidance = {
    'non-technical': `
**TECHNICAL LEVEL: Non-Technical**
- Write for a general audience with no scientific background
- Avoid jargon and technical terminology
- Use simple analogies and everyday language
- Explain scientific concepts in accessible terms
- Focus on practical implications and real-world impact
- Define any necessary technical terms in plain language`,
    'technical-non-expert': `
**TECHNICAL LEVEL: Technical for Non-Expert**
- Write for an educated reader who is not a specialist in this field
- Use technical terms but provide brief explanations
- Include scientific concepts with appropriate context
- Balance accuracy with accessibility
- Assume familiarity with general scientific principles
- Explain field-specific terminology and methods`,
    'expert': `
**TECHNICAL LEVEL: Expert**
- Write for specialists in the field
- Use full technical terminology without simplification
- Include detailed methodological descriptions
- Discuss complex theoretical frameworks
- Reference specific techniques and protocols
- Assume deep knowledge of the subject area`
  };

  return `Please analyze this research proposal and create a ${pageLength}-page summary.

**LENGTH REQUIREMENT:** ${lengthGuidance[pageLength]}

${technicalGuidance[techLevel]}

**SUMMARY FORMAT:**
- Use clear section headings (##)
- Include: Executive Summary, Background, Methodology, Expected Outcomes, Research Team, and Budget/Timeline
- Adjust detail level based on both the requested page length and technical level
- For non-technical: emphasize goals, impact, and practical applications
- For technical non-expert: balance technical accuracy with clarity
- For expert: include full technical depth and specialized details

**TONE:** Professional, objective, and factual - adapted to the audience level

**FILENAME:** ${filename}

Research Proposal Text:
---
${text.substring(0, CONFIG.TEXT_TRUNCATE_LIMIT * 2)} ${text.length > CONFIG.TEXT_TRUNCATE_LIMIT * 2 ? '...' : ''}

Generate a ${pageLength}-page summary at the ${techLevel.replace('-', ' ')} level following the guidelines above.`;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb',
    },
    responseLimit: false,
  },
  maxDuration: 300, // 5 minutes timeout for batch processing
};