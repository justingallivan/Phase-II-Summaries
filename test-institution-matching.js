/**
 * Test script for institution name matching
 * Run with: node test-institution-matching.js
 */

// Import the functions (we'll simulate them here for testing)
function normalizeInstitutionName(institutionName) {
  if (!institutionName) return new Set();

  let normalized = institutionName.toLowerCase();

  const removeTerms = [
    'regents of',
    'regents of the',
    'the regents of',
    'the',
    'university of',
    'college of',
    'institute of',
    'inc',
    'incorporated',
    'foundation',
    'center',
    'centre'
  ];

  removeTerms.forEach(term => {
    normalized = normalized.replace(new RegExp(`\\b${term}\\b`, 'gi'), '');
  });

  const words = normalized
    .split(/[\s,.-]+/)
    .filter(word => word.length > 2)
    .filter(word => !['and', 'for', 'the'].includes(word));

  return new Set(words);
}

function institutionsMatch(institution1, institution2) {
  if (!institution1 || !institution2) return false;

  const keywords1 = normalizeInstitutionName(institution1);
  const keywords2 = normalizeInstitutionName(institution2);

  if (keywords1.size === 0 || keywords2.size === 0) return false;

  const intersection = new Set([...keywords1].filter(x => keywords2.has(x)));

  if (intersection.size === 0) return false;

  // Campus/location-specific keywords that distinguish branches
  const campusKeywords = ['berkeley', 'davis', 'irvine', 'los', 'angeles', 'merced',
                         'riverside', 'san', 'diego', 'francisco', 'santa', 'barbara',
                         'cruz', 'boulder', 'denver', 'springs'];

  const campus1 = Array.from(keywords1).filter(k => campusKeywords.includes(k));
  const campus2 = Array.from(keywords2).filter(k => campusKeywords.includes(k));

  // Case 1: Both have campus-specific keywords
  if (campus1.length > 0 && campus2.length > 0) {
    // They must share at least one campus keyword to match
    const campusIntersection = campus1.filter(k => campus2.includes(k));
    if (campusIntersection.length === 0) {
      return false; // Different campuses
    }
  }

  // Require at least one non-generic keyword match
  const genericTerms = ['university', 'college', 'school', 'academy'];
  const significantMatches = Array.from(intersection).filter(k => !genericTerms.includes(k));

  return significantMatches.length > 0;
}

// Test cases
const testCases = [
  {
    name: "UC Berkeley variations",
    institution1: "University of California, Berkeley",
    institution2: "Regents of the University of California",
    expectedMatch: true
  },
  {
    name: "UCLA variations",
    institution1: "University of California, Los Angeles",
    institution2: "Regents of the University of California",
    expectedMatch: true
  },
  {
    name: "UC Colorado variations",
    institution1: "University of Colorado Boulder",
    institution2: "Regents Of The University Of Colorado",
    expectedMatch: true
  },
  {
    name: "UC Riverside vs UC San Diego (different campuses)",
    institution1: "University of California, Riverside",
    institution2: "University of California, San Diego",
    expectedMatch: false // Different campuses - should NOT match
  },
  {
    name: "Different universities",
    institution1: "Stanford University",
    institution2: "Harvard University",
    expectedMatch: false
  },
  {
    name: "MIT variations",
    institution1: "Massachusetts Institute of Technology",
    institution2: "MIT",
    expectedMatch: false // Not enough keywords
  },
  {
    name: "Stanford vs UC",
    institution1: "Stanford University",
    institution2: "University of California, Berkeley",
    expectedMatch: false
  }
];

console.log("=====================================");
console.log("Institution Matching Test");
console.log("=====================================\n");

testCases.forEach((test, index) => {
  const keywords1 = normalizeInstitutionName(test.institution1);
  const keywords2 = normalizeInstitutionName(test.institution2);
  const match = institutionsMatch(test.institution1, test.institution2);
  const passed = match === test.expectedMatch;

  console.log(`Test ${index + 1}: ${test.name}`);
  console.log(`  Institution 1: "${test.institution1}"`);
  console.log(`  Keywords 1: [${Array.from(keywords1).join(', ')}]`);
  console.log(`  Institution 2: "${test.institution2}"`);
  console.log(`  Keywords 2: [${Array.from(keywords2).join(', ')}]`);
  console.log(`  Match: ${match ? 'YES' : 'NO'} (expected: ${test.expectedMatch ? 'YES' : 'NO'})`);
  console.log(`  Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log();
});

console.log("\n=====================================");
console.log("Summary");
console.log("=====================================");
const passCount = testCases.filter(t => institutionsMatch(t.institution1, t.institution2) === t.expectedMatch).length;
console.log(`Passed: ${passCount}/${testCases.length}`);
