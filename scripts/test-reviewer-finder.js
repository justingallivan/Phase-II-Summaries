#!/usr/bin/env node
/**
 * Consolidated Test Suite for Expert Reviewer Finder
 *
 * Usage:
 *   node scripts/test-reviewer-finder.js [command] [options]
 *
 * Commands:
 *   all           - Run all tests
 *   verification  - Test verification flow with mock data
 *   candidates    - Test specific candidates against PubMed
 *   confidence    - Test confidence scoring
 *   parsing       - Test relevance parsing
 *   coi           - Test COI detection (requires REAL_COI_TEST=true for real coauthors)
 *   single <name> - Test a single candidate by name
 *
 * Options:
 *   --verbose     - Show detailed output
 *   --help        - Show this help message
 *
 * Examples:
 *   node scripts/test-reviewer-finder.js all
 *   node scripts/test-reviewer-finder.js verification
 *   node scripts/test-reviewer-finder.js single "Forest Rohwer"
 *   REAL_COI_TEST=true node scripts/test-reviewer-finder.js coi
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
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
}

// Services
const { PubMedService } = require('../lib/services/pubmed-service');
const { DiscoveryService } = require('../lib/services/discovery-service');
const { parseDiscoveredReasoningResponse } = require('../shared/config/prompts/reviewer-finder');

// ============================================
// TEST DATA
// ============================================

const TEST_CANDIDATES = [
  {
    name: 'Curtis Suttle',
    expertiseAreas: ['marine virology', 'viral ecology', 'phage ecology'],
    expectedInstitution: 'British Columbia'
  },
  {
    name: 'Forest Rohwer',
    expertiseAreas: ['viral ecology', 'phage', 'metagenomics'],
    expectedInstitution: 'San Diego'
  },
  {
    name: 'Mya Breitbart',
    expertiseAreas: ['environmental virology', 'viral diversity', 'viral ecology'],
    expectedInstitution: 'South Florida'
  },
  {
    name: 'Joshua Weitz',
    expertiseAreas: ['quantitative viral ecology', 'phage-bacteria dynamics', 'mathematical biology'],
    expectedInstitution: 'Maryland',
    notes: 'Recently moved from Georgia Tech to UMD'
  },
  {
    name: 'Will Harcombe',
    expertiseAreas: ['nutrient crossfeeding', 'microbial evolution', 'phage'],
    expectedInstitution: 'Minnesota'
  }
];

const MOCK_ANALYSIS_RESULT = {
  proposalInfo: {
    title: 'Death as a Source of Life',
    proposalAuthors: process.env.REAL_COI_TEST === 'true' ? 'Mya Breitbart' : 'John Doe, Jane Smith',
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

// ============================================
// UTILITIES
// ============================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const dedupeByPmid = (articles) => {
  const seen = new Set();
  return articles.filter(a => {
    if (!a.pmid || seen.has(a.pmid)) return false;
    seen.add(a.pmid);
    return true;
  });
};

// ============================================
// TEST FUNCTIONS
// ============================================

async function testSingleCandidate(candidate, verbose = false) {
  const nameVariants = DiscoveryService.generateNameVariants(candidate.name);

  if (verbose) {
    console.log(`\nTesting: ${candidate.name}`);
    console.log(`Variants: ${nameVariants.join(', ')}`);
  }

  let allSimple = [];
  let allDisambiguated = [];

  for (const variant of nameVariants) {
    const simpleQuery = DiscoveryService.buildAuthorQuery(variant);
    const simpleArticles = await PubMedService.search(simpleQuery, 30);
    allSimple.push(...simpleArticles);
    await sleep(400);

    const suggestionVariant = { ...candidate, name: variant };
    const disambiguatedQuery = DiscoveryService.buildDisambiguatedAuthorQuery(suggestionVariant);
    const disambiguatedArticles = await PubMedService.search(disambiguatedQuery, 20);
    allDisambiguated.push(...disambiguatedArticles);
    await sleep(400);
  }

  const filteredSimple = DiscoveryService.filterToMatchingAuthorMultiVariant(allSimple, nameVariants);
  const filteredDisambiguated = DiscoveryService.filterToMatchingAuthorMultiVariant(allDisambiguated, nameVariants);

  const dedupedSimple = dedupeByPmid(filteredSimple);
  const dedupedDisambiguated = dedupeByPmid(filteredDisambiguated);

  const MIN_PUBLICATIONS = 3;
  let finalArticles;
  let selectionReason;

  if (dedupedDisambiguated.length >= MIN_PUBLICATIONS) {
    finalArticles = dedupedDisambiguated;
    selectionReason = 'disambiguated';
  } else if (dedupedSimple.length >= MIN_PUBLICATIONS) {
    const relevantSimple = DiscoveryService.filterByExpertiseRelevance(dedupedSimple, candidate.expertiseAreas);
    finalArticles = relevantSimple.length >= MIN_PUBLICATIONS ? relevantSimple : dedupedSimple;
    selectionReason = relevantSimple.length >= MIN_PUBLICATIONS ? 'relevantSimple' : 'simple';
  } else {
    finalArticles = dedupedSimple.length > dedupedDisambiguated.length ? dedupedSimple : dedupedDisambiguated;
    selectionReason = 'fallback';
  }

  const affiliation = DiscoveryService.extractBestAffiliationMultiVariant(finalArticles, nameVariants);
  const confidence = DiscoveryService.calculateExpertiseMatch(finalArticles, candidate.expertiseAreas);
  const passes = finalArticles.length >= MIN_PUBLICATIONS;
  const matchesExpected = affiliation?.toLowerCase().includes(candidate.expectedInstitution?.toLowerCase() || '');

  if (verbose) {
    console.log(`  Simple: ${dedupedSimple.length}, Disambiguated: ${dedupedDisambiguated.length}`);
    console.log(`  Final: ${finalArticles.length} articles (${selectionReason})`);
    console.log(`  Affiliation: ${affiliation?.substring(0, 60) || 'NONE'}...`);
    console.log(`  Confidence: ${Math.round(confidence * 100)}%`);
    console.log(`  Passes: ${passes ? 'YES' : 'NO'}`);
  }

  return {
    name: candidate.name,
    simpleCount: dedupedSimple.length,
    disambiguatedCount: dedupedDisambiguated.length,
    finalCount: finalArticles.length,
    selectionReason,
    affiliation,
    confidence,
    passes,
    matchesExpected
  };
}

async function runCandidatesTest(verbose = false) {
  console.log('\n=== CANDIDATES VERIFICATION TEST ===\n');

  const results = [];
  for (const candidate of TEST_CANDIDATES) {
    console.log(`Testing ${candidate.name}...`);
    const result = await testSingleCandidate(candidate, verbose);
    results.push(result);
    await sleep(1000);
  }

  console.log('\n--- SUMMARY ---\n');
  for (const r of results) {
    const status = r.passes ? 'PASS' : 'FAIL';
    const instMatch = r.matchesExpected ? '✓' : '✗';
    console.log(`${status} ${r.name}: ${r.finalCount} articles (${r.selectionReason}), ${Math.round(r.confidence * 100)}% conf.`);
    console.log(`     ${instMatch} Affiliation: ${r.affiliation?.substring(0, 50) || 'NONE'}...`);
  }

  const passCount = results.filter(r => r.passes).length;
  console.log(`\n${passCount}/${results.length} candidates would be verified`);

  return passCount === results.length;
}

async function runConfidenceTest(verbose = false) {
  console.log('\n=== CONFIDENCE SCORING TEST ===\n');

  const results = [];
  for (const candidate of TEST_CANDIDATES) {
    console.log(`Testing ${candidate.name}...`);
    const result = await testSingleCandidate(candidate, verbose);
    results.push(result);
    await sleep(1000);
  }

  console.log('\n--- CONFIDENCE SCORES ---\n');
  for (const r of results) {
    const status = r.confidence >= 0.5 ? 'OK' : 'LOW';
    console.log(`${status} ${r.name}: ${Math.round(r.confidence * 100)}% (${r.finalCount} articles)`);
    if (verbose) {
      const candidate = TEST_CANDIDATES.find(c => c.name === r.name);
      console.log(`    Expertise: ${candidate.expertiseAreas.join(', ')}`);
    }
  }

  const goodCount = results.filter(r => r.confidence >= 0.5).length;
  console.log(`\n${goodCount}/${results.length} candidates have >= 50% confidence`);

  return goodCount >= results.length - 1; // Allow one low confidence
}

async function runVerificationFlowTest(verbose = false) {
  console.log('\n=== VERIFICATION FLOW TEST ===\n');

  console.log('Mock Analysis Result:');
  console.log(`  Title: ${MOCK_ANALYSIS_RESULT.proposalInfo.title}`);
  console.log(`  Proposal Authors: ${MOCK_ANALYSIS_RESULT.proposalInfo.proposalAuthors}`);
  console.log(`  Suggestions: ${MOCK_ANALYSIS_RESULT.reviewerSuggestions.map(s => s.name).join(', ')}`);
  console.log('');

  try {
    const results = await DiscoveryService.discover(MOCK_ANALYSIS_RESULT, {
      searchPubmed: true,
      searchArxiv: false,
      searchBiorxiv: false,
      onProgress: (progress) => {
        if (verbose) console.log('[Progress]', progress.message || progress.status);
      }
    });

    console.log('\n--- RESULTS ---\n');
    console.log(`Verified: ${results.verified.length}`);
    console.log(`Unverified: ${results.unverified.length}`);

    if (results.verified.length > 0) {
      console.log('\nVerified candidates:');
      for (const v of results.verified) {
        console.log(`  ✓ ${v.name} - ${v.publicationCount5yr} publications`);
      }
    }

    if (results.unverified.length > 0) {
      console.log('\nUnverified candidates:');
      for (const u of results.unverified) {
        console.log(`  ✗ ${u.name} - ${u.reason}`);
      }
    }

    return results.verified.length >= 2; // At least 2 should verify
  } catch (error) {
    console.error('ERROR:', error.message);
    return false;
  }
}

async function runCOITest(verbose = false) {
  console.log('\n=== COI DETECTION TEST ===\n');

  const isRealTest = process.env.REAL_COI_TEST === 'true';
  console.log(`Mode: ${isRealTest ? 'REAL (using actual coauthors)' : 'MOCK (fake authors)'}`);
  console.log(`Proposal Authors: ${MOCK_ANALYSIS_RESULT.proposalInfo.proposalAuthors}`);
  console.log('');

  try {
    const results = await DiscoveryService.discover(MOCK_ANALYSIS_RESULT, {
      searchPubmed: true,
      searchArxiv: false,
      searchBiorxiv: false,
      onProgress: (progress) => {
        if (verbose) console.log('[Progress]', progress.message || progress.status);
      }
    });

    const proposalAuthors = MOCK_ANALYSIS_RESULT.proposalInfo.proposalAuthors
      .split(',')
      .map(a => a.trim())
      .filter(a => a.length > 0);

    if (proposalAuthors.length > 0 && results.verified.length > 0) {
      console.log(`Checking coauthorship history...`);

      const verifiedWithCOI = await DiscoveryService.checkCoauthorshipsForCandidates(
        results.verified,
        proposalAuthors,
        (progress) => { if (verbose) console.log('[COI Check]', progress.message); }
      );

      console.log('\n--- COI RESULTS ---\n');
      let coiFound = false;
      for (const v of verifiedWithCOI) {
        if (v.hasCoauthorCOI) {
          coiFound = true;
          console.log(`🚨 ${v.name} - COI DETECTED!`);
          for (const c of v.coauthorships) {
            console.log(`   Co-authored ${c.paperCount} paper(s) with ${c.proposalAuthor}`);
            if (verbose && c.recentPapers) {
              c.recentPapers.forEach(p => console.log(`     - ${p.title?.substring(0, 50)}...`));
            }
          }
        } else {
          console.log(`✓ ${v.name} - No COI`);
        }
      }

      if (isRealTest) {
        return coiFound; // Should find COI when using real coauthors
      } else {
        return !coiFound; // Should NOT find COI with fake authors
      }
    } else {
      console.log('Skipping COI check (no proposal authors or no verified candidates)');
      return false;
    }
  } catch (error) {
    console.error('ERROR:', error.message);
    return false;
  }
}

function runParsingTest(verbose = false) {
  console.log('\n=== RELEVANCE PARSING TEST ===\n');

  const mockCandidates = [
    { name: 'Dr. Relevant Person' },
    { name: 'Dr. Irrelevant Person' },
    { name: 'Dr. Another Relevant' }
  ];

  const mockResponse = `
1. RELEVANT: Yes | REASONING: This researcher studies microbial ecology which directly relates to the proposal. | SENIORITY: Mid-career
2. RELEVANT: No | REASONING: This researcher is a physicist studying orbital mechanics, unrelated to microbiology. | SENIORITY: Senior
3. RELEVANT: Yes | REASONING: Studies viral dynamics which is relevant to the phage research proposed. | SENIORITY: Early-career
`;

  const result = parseDiscoveredReasoningResponse(mockResponse, mockCandidates);

  console.log('Parsing test results:');
  result.forEach(c => {
    console.log(`  - ${c.name}`);
    console.log(`    isRelevant: ${c.isRelevant}`);
    console.log(`    seniority: ${c.seniorityEstimate}`);
    if (verbose) {
      console.log(`    reasoning: ${c.generatedReasoning?.substring(0, 50) || 'N/A'}...`);
    }
  });

  const relevant = result.filter(c => c.isRelevant !== false);
  const irrelevant = result.filter(c => c.isRelevant === false);

  console.log(`\nSummary: ${relevant.length} relevant, ${irrelevant.length} irrelevant`);

  const passed = relevant.length === 2 && irrelevant.length === 1;
  console.log(passed ? '\n✓ PASS: Parsing works correctly!' : '\n✗ FAIL: Expected 2 relevant, 1 irrelevant');

  return passed;
}

// ============================================
// CLI INTERFACE
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const verbose = args.includes('--verbose') || args.includes('-v');

  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(`
Expert Reviewer Finder - Test Suite

Usage: node scripts/test-reviewer-finder.js [command] [options]

Commands:
  all           Run all tests
  verification  Test verification flow with mock data
  candidates    Test specific candidates against PubMed
  confidence    Test confidence scoring
  parsing       Test relevance parsing (no API calls)
  coi           Test COI detection
  single <name> Test a single candidate by name

Options:
  --verbose, -v Show detailed output
  --help, -h    Show this help message

Examples:
  node scripts/test-reviewer-finder.js all
  node scripts/test-reviewer-finder.js candidates --verbose
  node scripts/test-reviewer-finder.js single "Forest Rohwer"
  REAL_COI_TEST=true node scripts/test-reviewer-finder.js coi
`);
    return;
  }

  console.log('Expert Reviewer Finder - Test Suite');
  console.log('====================================');

  let results = {};

  switch (command) {
    case 'all':
      results.parsing = runParsingTest(verbose);
      results.candidates = await runCandidatesTest(verbose);
      results.confidence = await runConfidenceTest(verbose);
      results.verification = await runVerificationFlowTest(verbose);
      results.coi = await runCOITest(verbose);

      console.log('\n\n=== OVERALL RESULTS ===\n');
      for (const [test, passed] of Object.entries(results)) {
        console.log(`${passed ? '✓ PASS' : '✗ FAIL'}: ${test}`);
      }

      const allPassed = Object.values(results).every(v => v);
      process.exit(allPassed ? 0 : 1);
      break;

    case 'verification':
      const verificationPassed = await runVerificationFlowTest(verbose);
      process.exit(verificationPassed ? 0 : 1);
      break;

    case 'candidates':
      const candidatesPassed = await runCandidatesTest(verbose);
      process.exit(candidatesPassed ? 0 : 1);
      break;

    case 'confidence':
      const confidencePassed = await runConfidenceTest(verbose);
      process.exit(confidencePassed ? 0 : 1);
      break;

    case 'parsing':
      const parsingPassed = runParsingTest(verbose);
      process.exit(parsingPassed ? 0 : 1);
      break;

    case 'coi':
      const coiPassed = await runCOITest(verbose);
      process.exit(coiPassed ? 0 : 1);
      break;

    case 'single':
      const candidateName = args[1];
      if (!candidateName) {
        console.error('Error: Please provide a candidate name');
        console.error('Usage: node scripts/test-reviewer-finder.js single "Name Here"');
        process.exit(1);
      }

      const candidate = TEST_CANDIDATES.find(c =>
        c.name.toLowerCase().includes(candidateName.toLowerCase())
      ) || {
        name: candidateName,
        expertiseAreas: ['research'],
        expectedInstitution: ''
      };

      console.log(`\nTesting: ${candidate.name}`);
      const result = await testSingleCandidate(candidate, true);
      console.log('\n--- RESULT ---');
      console.log(`Passes verification: ${result.passes ? 'YES ✓' : 'NO ✗'}`);
      process.exit(result.passes ? 0 : 1);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run with --help for usage information');
      process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
