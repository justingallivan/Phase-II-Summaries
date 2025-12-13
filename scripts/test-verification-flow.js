/**
 * Test the actual verification flow as the API uses it
 */

const { DiscoveryService } = require('../lib/services/discovery-service');

// Simulate what Claude sends
const mockAnalysisResult = {
  proposalInfo: {
    title: 'Death as a Source of Life',
    authorInstitution: 'UC Berkeley',
    primaryResearchArea: 'Microbial ecology',
    keywords: 'phage, viral lysis, nutrient cycling, microbial evolution'
  },
  reviewerSuggestions: [
    {
      name: 'Dr. Will Harcombe',
      expertiseAreas: ['nutrient crossfeeding', 'microbial evolution', 'phage'],
      seniorityEstimate: 'Mid-career',
      reasoning: 'Studies evolution of nutrient crossfeeding',
      source: 'Known expert'
    },
    {
      name: 'Dr. Curtis Suttle',
      expertiseAreas: ['marine virology', 'viral ecology'],
      seniorityEstimate: 'Senior',
      reasoning: 'Leading expert in viral ecology',
      source: 'Field leader'
    },
    {
      name: 'Dr. Forest Rohwer',
      expertiseAreas: ['viral ecology', 'phage', 'metagenomics'],
      seniorityEstimate: 'Senior',
      reasoning: 'Pioneer in environmental virology',
      source: 'Field leader'
    }
  ],
  searchQueries: {
    pubmed: ['phage bacterial lysis', 'viral nutrient cycling'],
    arxiv: [],
    biorxiv: []
  }
};

async function testVerification() {
  console.log('Testing verification flow...\n');

  console.log('Analysis Result:');
  console.log('  Suggestions:', mockAnalysisResult.reviewerSuggestions.length);
  console.log('  Names:', mockAnalysisResult.reviewerSuggestions.map(s => s.name).join(', '));
  console.log('');

  try {
    const results = await DiscoveryService.discover(mockAnalysisResult, {
      searchPubmed: true,
      searchArxiv: false,
      searchBiorxiv: false,
      onProgress: (progress) => {
        console.log('[Progress]', progress.message || progress.status);
      }
    });

    console.log('\n=== RESULTS ===');
    console.log('Verified:', results.verified.length);
    console.log('Unverified:', results.unverified.length);
    console.log('');

    if (results.verified.length > 0) {
      console.log('Verified candidates:');
      for (const v of results.verified) {
        console.log('  ✓', v.name, '-', v.publicationCount5yr, 'pubs');
      }
    }

    if (results.unverified.length > 0) {
      console.log('\nUnverified candidates:');
      for (const u of results.unverified) {
        console.log('  ✗', u.name, '-', u.reason);
      }
    }

  } catch (error) {
    console.error('ERROR:', error.message);
    console.error(error.stack);
  }
}

testVerification();
