/**
 * Debug script for Expert Reviewer Finder
 *
 * Tests the verification and affiliation extraction logic
 * without needing to run the full UI.
 *
 * Usage: node scripts/debug-reviewer-finder.js
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

const { PubMedService } = require('../lib/services/pubmed-service');
const { DiscoveryService } = require('../lib/services/discovery-service');

// Test candidates from the proposal's peer groups
const testCandidates = [
  {
    name: 'Joshua Weitz',
    expertiseAreas: ['quantitative viral ecology', 'phage-bacteria dynamics', 'mathematical biology', 'ecological modeling'],
    expectedInstitution: 'Maryland', // Recently moved from Georgia Tech to UMD, email should hint at this
    notes: 'EDGE CASE: Recently moved from Georgia Tech to UMD. Email (jsweitz@umd.edu) should help identify correct affiliation.'
  },
  {
    name: 'Will Harcombe',
    expertiseAreas: ['nutrient crossfeeding', 'microbial evolution', 'phage'],
    expectedInstitution: 'Minnesota'
  },
  {
    name: 'Benjamin Kerr',
    expertiseAreas: ['microbial evolution', 'experimental evolution', 'mathematical modeling'],
    expectedInstitution: 'Washington'
  },
  {
    name: 'Jeff Gore',
    expertiseAreas: ['microbial population dynamics', 'bacterial cooperation', 'quantitative biology'],
    expectedInstitution: 'MIT'
  },
  {
    name: 'Mya Breitbart',
    expertiseAreas: ['environmental virology', 'viral diversity', 'viral ecology'],
    expectedInstitution: 'South Florida'
  }
];

async function testPubMedSearch(candidate) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${candidate.name}`);
  console.log(`Expected institution: ${candidate.expectedInstitution}`);
  console.log(`Expertise: ${candidate.expertiseAreas.join(', ')}`);
  if (candidate.notes) {
    console.log(`Notes: ${candidate.notes}`);
  }
  console.log('='.repeat(60));

  // Test 0: Name variants
  console.log('\n--- Test 0: Name variants ---');
  const nameVariants = DiscoveryService.generateNameVariants(candidate.name);
  console.log(`Variants: ${nameVariants.join(', ')}`);

  // Test 1: Simple name search (try all variants)
  console.log('\n--- Test 1: Simple name search (all variants) ---');
  let simpleResults = [];
  for (const variant of nameVariants) {
    const simpleQuery = DiscoveryService.buildAuthorQuery(variant);
    console.log(`Query: ${simpleQuery}`);
    const results = await PubMedService.search(simpleQuery, 10);
    console.log(`  -> ${results.length} articles`);
    simpleResults.push(...results);
    await sleep(500);
  }
  console.log(`Total across variants: ${simpleResults.length} articles`);

  if (simpleResults.length > 0) {
    console.log('\nFirst article:');
    const first = simpleResults[0];
    console.log(`  Title: ${first.title?.substring(0, 60)}...`);
    console.log(`  Year: ${first.year}`);
    console.log(`  Authors (${first.authors?.length || 0}):`);
    first.authors?.slice(0, 5).forEach((a, i) => {
      console.log(`    ${i + 1}. ${a.name} - ${a.affiliation?.substring(0, 50) || 'NO AFFILIATION'}...`);
    });
  }

  await sleep(500);

  // Test 2: Disambiguated search
  console.log('\n--- Test 2: Disambiguated search ---');
  const disambiguatedQuery = DiscoveryService.buildDisambiguatedAuthorQuery(candidate);
  console.log(`Query: ${disambiguatedQuery}`);

  const disambiguatedResults = await PubMedService.search(disambiguatedQuery, 10);
  console.log(`Results: ${disambiguatedResults.length} articles`);

  await sleep(500);

  // Test 2.5: Filter to matching author (critical fix for cache issues)
  console.log('\n--- Test 2.5: Author filtering (multi-variant) ---');
  const filteredSimple = DiscoveryService.filterToMatchingAuthorMultiVariant(simpleResults, nameVariants);
  const filteredDisambiguated = DiscoveryService.filterToMatchingAuthorMultiVariant(disambiguatedResults, nameVariants);
  console.log(`Simple after author filter: ${filteredSimple.length} articles (was ${simpleResults.length})`);
  console.log(`Disambiguated after filter: ${filteredDisambiguated.length} articles (was ${disambiguatedResults.length})`);

  // Test 3: Extract affiliation for specific author
  console.log('\n--- Test 3: Affiliation extraction ---');
  const allResults = filteredSimple.length > filteredDisambiguated.length ? filteredSimple : filteredDisambiguated;

  // Note: extractBestAffiliationMultiVariant returns a string, not an object
  const affiliation = DiscoveryService.extractBestAffiliationMultiVariant(allResults, nameVariants);

  console.log(`Extracted affiliation: ${affiliation?.substring(0, 80) || 'NONE FOUND'}...`);

  const matchesExpected = affiliation?.toLowerCase().includes(candidate.expectedInstitution.toLowerCase());
  console.log(`Matches expected institution: ${matchesExpected ? 'YES ✓' : 'NO ✗'}`);

  // Test 4: Check all authors in first few articles
  console.log('\n--- Test 4: All authors with affiliations ---');
  for (let i = 0; i < Math.min(3, allResults.length); i++) {
    const article = allResults[i];
    console.log(`\nArticle ${i + 1}: ${article.title?.substring(0, 50)}...`);

    // Find our candidate in the author list
    const matchingAuthor = article.authors?.find(a => {
      const normalizedSearch = candidate.name.toLowerCase();
      const normalizedAuthor = a.name?.toLowerCase() || '';
      return normalizedAuthor.includes(normalizedSearch.split(' ').pop()); // Match by last name
    });

    if (matchingAuthor) {
      console.log(`  FOUND: ${matchingAuthor.name}`);
      console.log(`  Affiliation: ${matchingAuthor.affiliation || 'NONE'}`);
    } else {
      console.log(`  Candidate NOT in author list`);
      console.log(`  Authors: ${article.authors?.map(a => a.name).join(', ')}`);
    }
  }

  // Test 5: Confidence calculation
  console.log('\n--- Test 5: Expertise match confidence ---');
  const confidence = DiscoveryService.calculateExpertiseMatch(allResults, candidate.expertiseAreas);
  console.log(`Confidence: ${Math.round(confidence * 100)}%`);

  return {
    name: candidate.name,
    simpleResultCount: simpleResults.length,
    filteredSimpleCount: filteredSimple.length,
    disambiguatedResultCount: disambiguatedResults.length,
    filteredDisambiguatedCount: filteredDisambiguated.length,
    extractedAffiliation: affiliation,
    matchesExpected,
    confidence
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Expert Reviewer Finder - Debug Script');
  console.log('=====================================\n');

  const results = [];

  for (const candidate of testCandidates) {
    try {
      const result = await testPubMedSearch(candidate);
      results.push(result);
    } catch (error) {
      console.error(`Error testing ${candidate.name}:`, error.message);
      results.push({ name: candidate.name, error: error.message });
    }

    // Rate limit between candidates
    await sleep(1000);
  }

  // Summary
  console.log('\n\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  for (const r of results) {
    if (r.error) {
      console.log(`${r.name}: ERROR - ${r.error}`);
    } else {
      const status = r.matchesExpected ? '✓' : '✗';
      console.log(`${status} ${r.name}: ${r.filteredSimpleCount}/${r.simpleResultCount} simple, ${r.filteredDisambiguatedCount}/${r.disambiguatedResultCount} disamb., ${Math.round(r.confidence * 100)}% conf.`);
      console.log(`  Affiliation: ${r.extractedAffiliation?.substring(0, 60) || 'NONE'}...`);
    }
  }
}

main().catch(console.error);
