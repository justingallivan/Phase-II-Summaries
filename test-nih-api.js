/**
 * Test script for NIH RePORTER API debugging
 * Run with: node test-nih-api.js
 */

const testPI = "Michiko E. Taga";
const yearsBack = 5;

// Test 1: Full name query
async function testFullName() {
  console.log("\n=== TEST 1: Full Name Query ===");
  console.log(`PI: ${testPI}`);

  const parts = testPI.trim().split(/\s+/);
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');

  console.log(`First Name: "${firstName}"`);
  console.log(`Last Name: "${lastName}"`);

  const currentYear = new Date().getFullYear();
  const fiscalYears = Array.from({ length: yearsBack }, (_, i) => currentYear - i);
  console.log(`Fiscal Years: ${fiscalYears.join(', ')}`);

  const requestBody = {
    criteria: {
      pi_names: [
        {
          last_name: lastName,
          first_name: firstName
        }
      ],
      fiscal_years: fiscalYears,
      include_active_projects: true
    },
    include_fields: [
      'ProjectTitle',
      'PrincipalInvestigators',
      'Organization',
      'AwardAmount',
      'FiscalYear',
      'ProjectStartDate',
      'ProjectEndDate',
      'AgencyCode',
      'FundingMechanism'
    ],
    limit: 500,
    offset: 0
  };

  console.log("\nRequest Body:");
  console.log(JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch('https://api.reporter.nih.gov/v2/projects/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`\nResponse Status: ${response.status} ${response.statusText}`);

    const data = await response.json();
    console.log(`\nResults Count: ${data.meta?.total || 0}`);
    console.log(`Projects Returned: ${data.results?.length || 0}`);

    if (data.results && data.results.length > 0) {
      console.log("\nFirst Project:");
      console.log(JSON.stringify(data.results[0], null, 2));
    }

    return data.meta?.total || 0;
  } catch (error) {
    console.error("Error:", error);
    return 0;
  }
}

// Test 2: Last name only
async function testLastNameOnly() {
  console.log("\n\n=== TEST 2: Last Name Only ===");

  const parts = testPI.trim().split(/\s+/);
  const lastName = parts[parts.length - 1];

  console.log(`Last Name: "${lastName}"`);

  const currentYear = new Date().getFullYear();
  const fiscalYears = Array.from({ length: yearsBack }, (_, i) => currentYear - i);

  const requestBody = {
    criteria: {
      pi_names: [
        {
          last_name: lastName
        }
      ],
      fiscal_years: fiscalYears,
      include_active_projects: true
    },
    include_fields: [
      'ProjectTitle',
      'PrincipalInvestigators',
      'Organization',
      'AwardAmount',
      'FiscalYear'
    ],
    limit: 50,
    offset: 0
  };

  console.log("\nRequest Body:");
  console.log(JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch('https://api.reporter.nih.gov/v2/projects/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`\nResponse Status: ${response.status} ${response.statusText}`);

    const data = await response.json();
    console.log(`\nResults Count: ${data.meta?.total || 0}`);
    console.log(`Projects Returned: ${data.results?.length || 0}`);

    if (data.results && data.results.length > 0) {
      console.log("\nAll PIs found with last name 'Taga':");
      data.results.forEach((project, i) => {
        const pis = project.principal_investigators || [];
        console.log(`${i + 1}. ${pis.map(pi => `${pi.first_name} ${pi.last_name}`).join(', ')} (${project.fiscal_year})`);
      });
    }

    return data.meta?.total || 0;
  } catch (error) {
    console.error("Error:", error);
    return 0;
  }
}

// Test 3: All years (no fiscal year filter)
async function testAllYears() {
  console.log("\n\n=== TEST 3: All Years (No Fiscal Year Filter) ===");

  const parts = testPI.trim().split(/\s+/);
  const lastName = parts[parts.length - 1];

  console.log(`Last Name: "${lastName}"`);

  const requestBody = {
    criteria: {
      pi_names: [
        {
          last_name: lastName
        }
      ]
      // No fiscal_years filter - search all years
    },
    include_fields: [
      'ProjectTitle',
      'PrincipalInvestigators',
      'Organization',
      'AwardAmount',
      'FiscalYear'
    ],
    limit: 50,
    offset: 0
  };

  console.log("\nRequest Body:");
  console.log(JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch('https://api.reporter.nih.gov/v2/projects/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`\nResponse Status: ${response.status} ${response.statusText}`);

    const data = await response.json();
    console.log(`\nResults Count: ${data.meta?.total || 0}`);
    console.log(`Projects Returned: ${data.results?.length || 0}`);

    if (data.results && data.results.length > 0) {
      console.log("\nProjects by year:");
      data.results.forEach((project, i) => {
        const pis = project.principal_investigators || [];
        console.log(`${i + 1}. FY${project.fiscal_year}: ${pis.map(pi => `${pi.first_name} ${pi.last_name}`).join(', ')}`);
        console.log(`   ${project.project_title?.substring(0, 80)}...`);
      });
    }

    return data.meta?.total || 0;
  } catch (error) {
    console.error("Error:", error);
    return 0;
  }
}

// Run all tests
async function runAllTests() {
  console.log("=====================================");
  console.log("NIH RePORTER API Debug Tests");
  console.log("=====================================");

  const count1 = await testFullName();
  const count2 = await testLastNameOnly();
  const count3 = await testAllYears();

  console.log("\n\n=== SUMMARY ===");
  console.log(`Full Name (with fiscal years): ${count1} results`);
  console.log(`Last Name Only (with fiscal years): ${count2} results`);
  console.log(`Last Name Only (all years): ${count3} results`);

  if (count1 === 0 && count2 === 0 && count3 === 0) {
    console.log("\n⚠️  No results found in any test. Possible issues:");
    console.log("1. PI might not have NIH funding");
    console.log("2. Name format might need adjustment");
    console.log("3. API connectivity issue");
  } else if (count3 > count2) {
    console.log("\n💡 Suggestion: Remove fiscal_years filter - PI has projects outside the date range");
  } else if (count2 > count1) {
    console.log("\n💡 Suggestion: Use last name only without first name - first name format issue");
  } else {
    console.log("\n✅ Full name search is working correctly");
  }
}

runAllTests().catch(console.error);
