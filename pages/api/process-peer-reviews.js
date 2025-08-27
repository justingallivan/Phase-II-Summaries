import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { CONFIG, PROMPTS } from '../../lib/config';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { files, apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No file URLs provided' });
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const reviewTexts = [];
    
    // Process each file and extract text
    for (let i = 0; i < files.length; i++) {
      const fileInfo = files[i];
      const progress = Math.round((i / files.length) * 50); // First 50% for file processing
      
      // Send progress update
      res.write(`data: ${JSON.stringify({
        progress,
        message: `Extracting text from ${fileInfo.filename}...`
      })}\n\n`);

      try {
        // Fetch file from Vercel Blob
        const response = await fetch(fileInfo.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.status}`);
        }
        
        const buffer = await response.arrayBuffer();
        let text = '';

        // Extract text based on file type
        if (fileInfo.filename.toLowerCase().endsWith('.pdf')) {
          const pdfData = await pdf(Buffer.from(buffer));
          text = pdfData.text;
        } else if (fileInfo.filename.toLowerCase().endsWith('.docx')) {
          const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
          text = result.value;
        } else if (fileInfo.filename.toLowerCase().endsWith('.doc')) {
          // For older .doc files, mammoth might work but with limitations
          try {
            const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
            text = result.value;
          } catch (docError) {
            throw new Error('Unable to process .doc file - please convert to .docx or PDF format');
          }
        }

        if (!text || text.trim().length < 50) {
          throw new Error('Document appears to be empty or contains insufficient text');
        }

        reviewTexts.push({
          filename: fileInfo.filename,
          text: text.trim()
        });

      } catch (fileError) {
        console.error(`Error processing ${fileInfo.filename}:`, fileError);
        // Continue processing other files even if one fails
        reviewTexts.push({
          filename: fileInfo.filename,
          text: `Error processing ${fileInfo.filename}: ${fileError.message}`,
          error: true
        });
      }
    }

    // Send progress update for analysis phase
    res.write(`data: ${JSON.stringify({
      progress: 60,
      message: 'Analyzing peer reviews with Claude AI...'
    })}\n\n`);

    // Generate comprehensive analysis
    const analysisResult = await analyzePeerReviews(reviewTexts, apiKey);

    // Send final results
    res.write(`data: ${JSON.stringify({
      progress: 100,
      message: 'Peer review analysis complete!',
      results: analysisResult
    })}\n\n`);

    res.end();

  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function analyzePeerReviews(reviewTexts, apiKey) {
  try {
    // Filter out error entries and extract just the text
    const validTexts = reviewTexts
      .filter(review => !review.error)
      .map(review => review.text);

    if (validTexts.length === 0) {
      throw new Error('No valid review texts to analyze');
    }

    // Generate comprehensive analysis
    const analysisPrompt = PROMPTS.PEER_REVIEW_ANALYSIS(validTexts);
    
    const response = await fetch(CONFIG.CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': CONFIG.ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: CONFIG.CLAUDE_MODEL,
        max_tokens: CONFIG.REFINEMENT_MAX_TOKENS, // Use higher token limit for comprehensive analysis
        temperature: CONFIG.SUMMARIZATION_TEMPERATURE,
        messages: [{
          role: 'user',
          content: analysisPrompt
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', errorText);
      throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const analysisText = data.content[0].text;

    // Split the analysis into summary and questions
    const parts = analysisText.split('**OUTPUT 2 - QUESTIONS:**');
    let summary = parts[0]?.replace('**OUTPUT 1 - SUMMARY:**', '').trim() || analysisText;
    let questions = parts[1]?.trim() || '';

    // If the questions section is empty, try to extract questions separately
    if (!questions || questions.length < 50) {
      try {
        const questionsPrompt = PROMPTS.PEER_REVIEW_QUESTIONS(validTexts);
        
        const questionsResponse = await fetch(CONFIG.CLAUDE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey.trim(),
            'anthropic-version': CONFIG.ANTHROPIC_VERSION
          },
          body: JSON.stringify({
            model: CONFIG.CLAUDE_MODEL,
            max_tokens: CONFIG.DEFAULT_MAX_TOKENS,
            temperature: CONFIG.SUMMARIZATION_TEMPERATURE,
            messages: [{
              role: 'user',
              content: questionsPrompt
            }]
          })
        });

        if (questionsResponse.ok) {
          const questionsData = await questionsResponse.json();
          questions = questionsData.content[0].text;
        }
      } catch (questionsError) {
        console.warn('Failed to extract questions separately:', questionsError);
        questions = 'Unable to extract questions from the peer reviews.';
      }
    }

    return {
      summary: summary,
      questions: questions,
      metadata: {
        reviewCount: validTexts.length,
        processedFiles: reviewTexts.map(r => r.filename),
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('Peer review analysis error:', error);
    throw new Error(`Failed to analyze peer reviews: ${error.message}`);
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb',
    },
    responseLimit: false,
    externalResolver: true,
  },
  maxDuration: 300, // 5 minutes timeout for processing
};