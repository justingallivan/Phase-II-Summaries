import { CONFIG, PROMPTS } from '../../lib/config';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { currentResults, feedback, apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }

    if (!currentResults || !feedback) {
      return res.status(400).json({ error: 'Current results and feedback required' });
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    const refinedResults = {};
    const resultEntries = Object.entries(currentResults);
    
    for (let i = 0; i < resultEntries.length; i++) {
      const [filename, result] = resultEntries[i];
      const progress = Math.round((i / resultEntries.length) * 90);
      
      // Send progress update
      res.write(`data: ${JSON.stringify({
        progress,
        message: `Refining ${filename}...`
      })}\n\n`);

      try {
        // Generate refined summary
        const refined = await refineWithFeedback(result.formatted, feedback, filename, apiKey);
        refinedResults[filename] = {
          formatted: refined.formatted,
          structured: result.structured // Keep the same structured data
        };

      } catch (error) {
        console.error(`Error refining ${filename}:`, error);
        refinedResults[filename] = result; // Keep original if refinement fails
      }
    }

    // Send final results
    res.write(`data: ${JSON.stringify({
      progress: 100,
      message: 'Refinement complete!',
      results: refinedResults
    })}\n\n`);

    res.end();

  } catch (error) {
    console.error('Refinement API error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function refineWithFeedback(currentSummary, feedback, filename, apiKey) {
  try {
    const refinementPrompt = PROMPTS.REFINEMENT(currentSummary, feedback);

    const response = await fetch(CONFIG.CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': CONFIG.ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: CONFIG.CLAUDE_MODEL,
        max_tokens: CONFIG.REFINEMENT_MAX_TOKENS,
        temperature: CONFIG.REFINEMENT_TEMPERATURE,
        messages: [{
          role: 'user',
          content: refinementPrompt
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const refinedText = data.content[0].text;

    // Enhance formatting
    const institution = extractInstitutionFromFilename(filename) || 'Research Institution';
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    
    let formatted = `# ${institution}\n`;
    formatted += `Phase II Review: ${date}\n\n`;
    formatted += `**Filename:** ${filename}\n`;
    formatted += `**Date Processed:** ${new Date().toLocaleDateString()}\n\n`;
    formatted += '---\n\n';
    
    // Process the summary with proper section headers
    let processedSummary = refinedText
      .replace(/\*\*Executive Summary\*\*/g, '## Executive Summary')
      .replace(/\*\*Background & Impact\*\*/g, '## Background & Impact')
      .replace(/\*\*Methodology\*\*/g, '## Methodology') 
      .replace(/\*\*Personnel\*\*/g, '## Personnel')
      .replace(/\*\*Justification for Keck Funding\*\*/g, '## Justification for Keck Funding');
    
    return {
      formatted: formatted + processedSummary
    };

  } catch (error) {
    console.error('Refinement error:', error);
    throw new Error(`Failed to refine summary: ${error.message}`);
  }
}

function extractInstitutionFromFilename(filename) {
  if (!filename) return 'Research Institution';
  
  // Remove file extension and common suffixes
  const cleanName = filename
    .replace(/\.(pdf|PDF)$/, '')
    .replace(/_SE_Phase_II_Staff_Version$/, '')
    .replace(/_Phase_II.*$/, '')
    .replace(/_Staff_Version$/, '')
    .replace(/_Final$/, '')
    .replace(/_Draft$/, '');
  
  // Look for institution patterns in filename
  const patterns = [
    // Specific institutions first (more precise)
    /California Institute of Technology/i,
    /Massachusetts Institute of Technology/i,
    /University of California[^_]*/i,
    /University of [A-Za-z\s]+/i,
    /[A-Za-z\s]+ University/i,
    /[A-Za-z\s]+ Institute of Technology/i,
    /[A-Za-z\s]+ College/i,
    /[A-Za-z\s]+ State University/i,
    /[A-Za-z\s]+ Medical Center/i,
    /[A-Za-z\s]+ Research Institute/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanName.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  
  return 'Research Institution';
}
