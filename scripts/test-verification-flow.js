/**
 * Test the actual verification flow as the API uses it
 */

const { DiscoveryService } = require('../lib/services/discovery-service');

// Simulate what Claude sends
// Test scenario: Proposal by a known author who has co-authored with some candidates
// This tests the COI detection feature
// NOTE: Set REAL_COI_TEST=true to test with a real coauthor (Mya Breitbart)
// which will find COI with Forest Rohwer
const USE_REAL_COAUTHOR = process.env.REAL_COI_TEST === 'true';

const mockAnalysisResult = {
  proposalInfo: {
    title: 'Death as a Source of Life',
    // Use real coauthor (Mya Breitbart) for COI testing, or fake authors
    proposalAuthors: USE_REAL_COAUTHOR ? 'Mya Breitbart' : 'John Doe, Jane Smith',
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
  console.log('Testing verification flow with COI detection...\n');

  console.log('Analysis Result:');
  console.log('  Title:', mockAnalysisResult.proposalInfo.title);
  console.log('  Proposal Authors:', mockAnalysisResult.proposalInfo.proposalAuthors);
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

    console.log('\n=== VERIFICATION RESULTS ===');
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

    // Test COI detection
    console.log('\n=== COI DETECTION TEST ===');
    const proposalAuthors = mockAnalysisResult.proposalInfo.proposalAuthors
      .split(',')
      .map(a => a.trim())
      .filter(a => a.length > 0);

    if (proposalAuthors.length > 0 && results.verified.length > 0) {
      console.log('Checking coauthorship with:', proposalAuthors.join(', '));
      console.log('');

      const verifiedWithCOI = await DiscoveryService.checkCoauthorshipsForCandidates(
        results.verified,
        proposalAuthors,
        (progress) => console.log('[COI Check]', progress.message)
      );

      console.log('\nCOI Results:');
      for (const v of verifiedWithCOI) {
        if (v.hasCoauthorCOI) {
          console.log('  🚨', v.name, '- COI DETECTED!');
          for (const c of v.coauthorships) {
            console.log('     Co-authored', c.paperCount, 'paper(s) with', c.proposalAuthor);
          }
        } else {
          console.log('  ✓', v.name, '- No COI');
        }
      }
    } else {
      console.log('Skipping COI check (no proposal authors or no verified candidates)');
    }

  } catch (error) {
    console.error('ERROR:', error.message);
    console.error(error.stack);
  }
}

testVerification();
