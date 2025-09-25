import { createClaudeClient } from '../../shared/api/handlers/claudeClient';
import { createFileProcessor } from '../../shared/api/handlers/fileProcessor';
import { getApiKeyManager } from '../../shared/utils/apiKeyManager';
import { nextRateLimiter } from '../../shared/api/middleware/rateLimiter';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb', // For JSON payload with blob URLs
    },
  },
};

// Create rate limiter for this endpoint
const rateLimiter = nextRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
});

// Expense extraction prompt
const createExpenseExtractionPrompt = (fileContent, fileName, fileType) => {
  const isImage = ['png', 'jpg', 'jpeg'].includes(fileType.toLowerCase());

  return `You are an expert bookkeeper analyzing receipts and invoices to extract expense data.

${isImage ? 'This is an image of a receipt or invoice. Please analyze the visual content to extract expense information.' : 'Please analyze this document to extract expense information.'}

File name: ${fileName}

${!isImage ? `Document content:\n${fileContent}\n` : ''}

Extract the following information in a structured format:
1. Date of transaction (format: YYYY-MM-DD if possible, or MM/DD/YYYY)
2. Vendor/merchant name
3. Description of items/services purchased
4. Total amount (with currency symbol)
5. Tax amount (if shown separately)
6. Payment method details:
   - Card type (VISA, MasterCard, AMEX, Discover, etc.)
   - Last 4 digits of card/account number (if shown)
   - Full payment method string (e.g., "VISA ****1234", "Cash", "Check", etc.)
7. Category (analyze the vendor/description and suggest the most appropriate category):
   - Meals & Entertainment: Restaurants, bars, catering, business dinners
   - Lodging: Hotels, motels, B&Bs, vacation rentals, accommodation
   - Airfare: Airlines, flights, baggage fees, seat upgrades
   - Car Rentals: Rental cars, truck rentals, vehicle hire services
   - Rideshare & Taxi: Uber, Lyft, taxi services, ride-hailing apps
   - Parking: Parking meters, garages, airport parking, valet services
   - Fuel & Gas: Gas stations, fuel purchases, vehicle refueling
   - Tolls: Highway tolls, bridge tolls, road usage fees
   - Office Supplies: Pens, paper, folders, printer ink, desk items
   - Equipment: Computers, monitors, phones, furniture, machinery
   - Software & Technology: Apps, subscriptions, cloud services, licenses
   - Professional Services: Legal, accounting, consulting, contractors
   - Marketing & Advertising: Ads, promotional materials, website costs
   - Utilities: Internet, phone, electricity, water (for office/business)
   - Training & Education: Courses, books, conferences, workshops
   - Transportation: Public transit, vehicle maintenance, shipping
   - Healthcare: Medical expenses, insurance, wellness programs
   - Maintenance & Repairs: Building maintenance, equipment repairs
   - Communications: Phone bills, internet, postal services
   - Other: If none of the above categories clearly apply

Provide the extracted data in this exact JSON format (do not wrap in markdown code blocks):
{
  "date": "extracted date or null",
  "vendor": "vendor name or null",
  "description": "brief description or null",
  "amount": "total amount with currency or null",
  "tax": "tax amount or null",
  "paymentMethod": "full payment method string or null",
  "cardType": "VISA/MasterCard/AMEX/Discover/etc or null",
  "cardLast4": "last 4 digits or null",
  "category": "suggested category",
  "confidence": "high/medium/low",
  "notes": "any important notes or issues"
}

CATEGORIZATION GUIDANCE:
- Look for keywords in vendor names (e.g., "RESTAURANT", "HOTEL", "UBER", "OFFICE DEPOT")
- Consider the business type based on the vendor name
- Use description context to help determine category
- Common vendor patterns:
  * Airlines/Airfare: "AMERICAN AIRLINES", "DELTA", "SOUTHWEST", "UNITED"
  * Hotels/Lodging: "MARRIOTT", "HILTON", "HOLIDAY INN", "AIRBNB", "EXPEDIA"
  * Car Rentals: "HERTZ", "ENTERPRISE", "AVIS", "BUDGET", "ZIPCAR"
  * Rideshare/Taxi: "UBER", "LYFT", "TAXI", "YELLOW CAB"
  * Parking: "PARKING", "IMPARK", "SPOTHERO", "PARKWHIZ"
  * Gas/Fuel: "SHELL", "EXXON", "BP", "CHEVRON", "MOBIL", "ARCO"
  * Tolls: "TOLL", "TURNPIKE", "E-ZPASS", "FASTRAK"
  * Restaurants: "MCDONALD'S", "STARBUCKS", "SUBWAY", "RESTAURANT"
  * Office stores: "STAPLES", "OFFICE DEPOT", "BEST BUY"
  * Software: "MICROSOFT", "ADOBE", "GOOGLE", "SUBSCRIPTION"

IMPORTANT: Return only the JSON object, no markdown formatting, no explanations, no code blocks.
If you cannot extract certain information, use null for that field.
Be precise with amounts and include currency symbols.`;
};

export default async function handler(req, res) {
  console.log('Process Expenses API called:', new Date().toISOString());

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting
  const rateLimitResult = await rateLimiter(req, res);
  if (!rateLimitResult) {
    console.log('Rate limit exceeded');
    return;
  }

  try {
    const { files, apiKey } = req.body;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    console.log(`Processing ${files.length} files`);

    // Validate API key
    const apiKeyManager = getApiKeyManager();
    let validatedKey;
    try {
      validatedKey = apiKeyManager.selectApiKey(apiKey);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or missing API key' });
    }

    // Set up streaming response
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Helper functions for streaming
    const sendProgress = (message) => {
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        message,
        timestamp: new Date().toISOString()
      })}\n\n`);
    };

    const sendData = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const sendError = (error) => {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error,
        timestamp: new Date().toISOString()
      })}\n\n`);
    };

    // Initialize Claude client
    const claudeClient = createClaudeClient(validatedKey);
    const fileProcessor = createFileProcessor();

    const expenses = [];
    let processedCount = 0;

    // Process each file
    for (const file of files) {
      processedCount++;
      const progressMessage = `Processing file ${processedCount}/${files.length}: ${file.filename}`;
      sendProgress(progressMessage);

      try {
        const fileExt = file.filename.toLowerCase().split('.').pop();
        const isImage = ['png', 'jpg', 'jpeg'].includes(fileExt);

        if (isImage) {
          // For images, we'll send them directly to Claude's vision API
          sendProgress(`Analyzing image: ${file.filename}`);

          // Fetch the image from blob storage
          const imageResponse = await fetch(file.url);
          if (!imageResponse.ok) {
            throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
          }

          const imageBuffer = await imageResponse.arrayBuffer();
          const base64Image = Buffer.from(imageBuffer).toString('base64');

          // Create a message with image for Claude's vision API
          const messages = [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
                  data: base64Image
                }
              },
              {
                type: 'text',
                text: createExpenseExtractionPrompt('', file.filename, fileExt)
              }
            ]
          }];

          // Send to Claude with vision capabilities
          const response = await claudeClient.sendMessageWithVision(messages, {
            maxTokens: 1000,
            temperature: 0.2
          });

          // Parse the JSON response
          try {
            // Clean up the response to handle markdown code blocks
            let cleanResponse = response.trim();

            // Remove markdown code block markers if present
            if (cleanResponse.startsWith('```json') || cleanResponse.startsWith('```')) {
              cleanResponse = cleanResponse.replace(/^```(?:json)?\s*/, '');
              cleanResponse = cleanResponse.replace(/```\s*$/, '');
            }

            // Try to extract JSON from the response
            const jsonMatch = cleanResponse.match(/\{[\s\S]*?\}/);
            if (jsonMatch) {
              cleanResponse = jsonMatch[0];
            }

            const expenseData = JSON.parse(cleanResponse);
            expenses.push({
              ...expenseData,
              sourceFile: file.filename
            });
          } catch (parseError) {
            console.error('Failed to parse expense data:', parseError);
            console.error('Raw response:', response);
            expenses.push({
              date: null,
              vendor: 'Parse Error',
              description: `Failed to extract data from ${file.filename}`,
              amount: null,
              category: 'Error',
              sourceFile: file.filename,
              confidence: 'low',
              notes: `Parse error: ${parseError.message}`
            });
          }

        } else {
          // For PDFs, use existing file processor
          sendProgress(`Extracting text from PDF: ${file.filename}`);

          const fileResponse = await fetch(file.url);
          if (!fileResponse.ok) {
            throw new Error(`Failed to fetch file: ${fileResponse.statusText}`);
          }

          const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
          const { text } = await fileProcessor.processFile(fileBuffer, file.filename);

          if (!text || text.trim().length < 5) {
            expenses.push({
              date: null,
              vendor: 'Extraction Error',
              description: `No text found in ${file.filename}`,
              amount: null,
              category: 'Error',
              sourceFile: file.filename,
              confidence: 'low',
              notes: 'Could not extract text from PDF'
            });
            continue;
          }

          // Send to Claude for analysis
          const prompt = createExpenseExtractionPrompt(text, file.filename, 'pdf');
          const response = await claudeClient.sendMessage(prompt, {
            maxTokens: 1000,
            temperature: 0.2
          });

          // Parse the JSON response
          try {
            // Clean up the response to handle markdown code blocks
            let cleanResponse = response.trim();

            // Remove markdown code block markers if present
            if (cleanResponse.startsWith('```json') || cleanResponse.startsWith('```')) {
              cleanResponse = cleanResponse.replace(/^```(?:json)?\s*/, '');
              cleanResponse = cleanResponse.replace(/```\s*$/, '');
            }

            // Try to extract JSON from the response
            const jsonMatch = cleanResponse.match(/\{[\s\S]*?\}/);
            if (jsonMatch) {
              cleanResponse = jsonMatch[0];
            }

            const expenseData = JSON.parse(cleanResponse);
            expenses.push({
              ...expenseData,
              sourceFile: file.filename
            });
          } catch (parseError) {
            console.error('Failed to parse expense data:', parseError);
            console.error('Raw response:', response);
            expenses.push({
              date: null,
              vendor: 'Parse Error',
              description: `Failed to extract structured data from ${file.filename}`,
              amount: null,
              category: 'Error',
              sourceFile: file.filename,
              confidence: 'low',
              notes: `Parse error: ${parseError.message}`
            });
          }
        }

      } catch (fileError) {
        console.error(`Error processing file ${file.filename}:`, fileError);
        expenses.push({
          date: null,
          vendor: 'Processing Error',
          description: `Error processing ${file.filename}`,
          amount: null,
          category: 'Error',
          sourceFile: file.filename,
          confidence: 'low',
          notes: fileError.message
        });
      }
    }

    // Sort expenses by date
    expenses.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });

    // Calculate summary statistics
    const summary = `Processed ${files.length} file(s). Extracted ${expenses.filter(e => e.confidence !== 'low').length} valid expense(s). ${expenses.filter(e => e.confidence === 'low').length} file(s) had processing issues.`;

    // Send final results
    sendData({
      type: 'result',
      expenses,
      summary,
      processedFiles: files.length,
      timestamp: new Date().toISOString()
    });

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Processing error:', error);

    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    } else {
      sendError(error.message);
      res.end();
    }
  }
}