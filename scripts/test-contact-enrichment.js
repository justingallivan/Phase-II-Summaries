/**
 * Test script for contact enrichment services
 *
 * Run: node scripts/test-contact-enrichment.js
 *
 * Tests:
 * 1. Claude web search (requires CLAUDE_API_KEY)
 * 2. ORCID lookup (requires ORCID_CLIENT_ID, ORCID_CLIENT_SECRET)
 * 3. SerpAPI (requires SERP_API_KEY)
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        let value = valueParts.join('=');
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  });
  console.log('Loaded environment variables from .env.local\n');
}

const { ContactEnrichmentService } = require('../lib/services/contact-enrichment-service');
const { ORCIDService } = require('../lib/services/orcid-service');
const { SerpContactService } = require('../lib/services/serp-contact-service');

// Test candidate - use a well-known academic
const testCandidate = {
  name: 'Kevin Weeks',
  affiliation: 'Department of Chemistry, University of North Carolina, Chapel Hill, NC, USA',
};

async function testClaudeWebSearch() {
  console.log('=== Testing Claude Web Search ===');
  const apiKey = process.env.CLAUDE_API_KEY;

  if (!apiKey) {
    console.log('❌ CLAUDE_API_KEY not set in environment');
    return false;
  }

  console.log('✓ CLAUDE_API_KEY is set');
  console.log(`Testing with: ${testCandidate.name}`);

  try {
    const result = await ContactEnrichmentService.claudeWebSearch(testCandidate, apiKey);
    console.log('Result:', JSON.stringify(result, null, 2));

    if (result) {
      console.log('✓ Claude web search returned results');
      if (result.email) console.log(`  Email: ${result.email}`);
      if (result.facultyPageUrl) console.log(`  Faculty URL: ${result.facultyPageUrl}`);
      if (result.website) console.log(`  Website: ${result.website}`);
      return true;
    } else {
      console.log('⚠ Claude web search returned null');
      return false;
    }
  } catch (error) {
    console.log('❌ Claude web search error:', error.message);
    return false;
  }
}

async function testOrcid() {
  console.log('\n=== Testing ORCID API ===');
  const clientId = process.env.ORCID_CLIENT_ID;
  const clientSecret = process.env.ORCID_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log('❌ ORCID credentials not set (need ORCID_CLIENT_ID and ORCID_CLIENT_SECRET)');
    return false;
  }

  console.log('✓ ORCID credentials are set');
  console.log(`Testing with: ${testCandidate.name}`);

  try {
    // First test authentication
    console.log('Testing authentication...');
    const token = await ORCIDService.getAccessToken(clientId, clientSecret);
    console.log('✓ ORCID authentication successful');

    // Now test search
    console.log('Testing search...');
    const result = await ORCIDService.findContact({
      name: testCandidate.name,
      affiliation: testCandidate.affiliation,
      clientId,
      clientSecret,
    });

    console.log('Result:', JSON.stringify(result, null, 2));

    if (result) {
      console.log('✓ ORCID search returned results');
      if (result.orcidId) console.log(`  ORCID ID: ${result.orcidId}`);
      if (result.email) console.log(`  Email: ${result.email}`);
      if (result.website) console.log(`  Website: ${result.website}`);
      return true;
    } else {
      console.log('⚠ ORCID search returned null (researcher may not have ORCID profile)');
      return false;
    }
  } catch (error) {
    console.log('❌ ORCID error:', error.message);
    return false;
  }
}

async function testSerpApi() {
  console.log('\n=== Testing SerpAPI Google Search ===');
  const apiKey = process.env.SERP_API_KEY;

  if (!apiKey) {
    console.log('❌ SERP_API_KEY not set in environment');
    return false;
  }

  console.log('✓ SERP_API_KEY is set');
  console.log(`Testing with: ${testCandidate.name}`);

  try {
    const result = await SerpContactService.findContact(testCandidate, apiKey);
    console.log('Result:', JSON.stringify(result, null, 2));

    if (result) {
      console.log('✓ SerpAPI search returned results');
      if (result.email) console.log(`  Email: ${result.email}`);
      if (result.facultyPageUrl) console.log(`  Faculty URL: ${result.facultyPageUrl}`);
      if (result.website) console.log(`  Website: ${result.website}`);
      return true;
    } else {
      console.log('⚠ SerpAPI search returned null');
      return false;
    }
  } catch (error) {
    console.log('❌ SerpAPI error:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('Contact Enrichment Service Test');
  console.log('================================\n');

  const results = {
    claude: await testClaudeWebSearch(),
    orcid: await testOrcid(),
    serpapi: await testSerpApi(),
  };

  console.log('\n=== Summary ===');
  console.log(`Claude Web Search: ${results.claude ? '✓ Working' : '❌ Not working'}`);
  console.log(`ORCID API: ${results.orcid ? '✓ Working' : '❌ Not working'}`);
  console.log(`SerpAPI: ${results.serpapi ? '✓ Working' : '❌ Not working'}`);

  process.exit(0);
}

runTests().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
