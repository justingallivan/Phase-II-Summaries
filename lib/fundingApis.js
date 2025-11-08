/**
 * Federal Funding API Utilities
 *
 * Provides functions to query federal funding databases:
 * - NSF Awards API (real-time data)
 * - NIH, DOE, DOD (Claude knowledge-based analysis)
 */

/**
 * Query NSF API for a specific PI's awards
 * @param {string} piName - PI's full name or last name
 * @param {string} stateCode - Two-letter state code (e.g., CA, NY, MA) for filtering
 * @param {boolean} activeOnly - Only return active awards (default: true)
 * @param {boolean} includeCoPIs - Include awards where person is Co-PI (default: false)
 * @returns {Promise<{awards: Array, totalCount: number, totalFunding: number}>}
 */
export async function queryNSFforPI(piName, stateCode, activeOnly = true, includeCoPIs = false) {
  try {
    const baseUrl = 'https://api.nsf.gov/services/v1/awards.json';

    // Query for PI awards
    const piParams = new URLSearchParams({
      pdPIName: piName,
      printFields: 'id,title,piFirstName,piLastName,fundProgramName,startDate,expDate,fundsObligatedAmt,agency,awardeeName,awardeeStateCode'
    });

    if (activeOnly) {
      piParams.append('activeAwards', 'true');
    }

    if (stateCode) {
      piParams.append('awardeeStateCode', stateCode.toUpperCase());
    }

    piParams.append('rpp', '25');

    const piResponse = await fetch(`${baseUrl}?${piParams}`, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!piResponse.ok) {
      throw new Error(`NSF API error: ${piResponse.status} ${piResponse.statusText}`);
    }

    const piData = await piResponse.json();
    let awards = piData.response?.award || [];
    let totalCount = piData.response?.metadata?.totalCount || 0;

    // If includeCoPIs is true, also query for Co-PI awards
    if (includeCoPIs) {
      await delay(200); // Rate limiting

      const coPIParams = new URLSearchParams({
        coPDPIName: piName,
        printFields: 'id,title,piFirstName,piLastName,fundProgramName,startDate,expDate,fundsObligatedAmt,agency,awardeeName,awardeeStateCode'
      });

      if (activeOnly) {
        coPIParams.append('activeAwards', 'true');
      }

      if (stateCode) {
        coPIParams.append('awardeeStateCode', stateCode.toUpperCase());
      }

      coPIParams.append('rpp', '25');

      const coPIResponse = await fetch(`${baseUrl}?${coPIParams}`, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (coPIResponse.ok) {
        const coPIData = await coPIResponse.json();
        const coPIAwards = coPIData.response?.award || [];

        // Deduplicate awards by ID
        const existingIds = new Set(awards.map(a => a.id));
        const newAwards = coPIAwards.filter(a => !existingIds.has(a.id));

        awards = [...awards, ...newAwards];
        totalCount = totalCount + (coPIData.response?.metadata?.totalCount || 0);
      }
    }

    return {
      awards: awards,
      totalCount: totalCount,
      totalFunding: calculateTotalFunding(awards)
    };
  } catch (error) {
    console.error('Error querying NSF for PI:', error);
    return {
      awards: [],
      totalCount: 0,
      totalFunding: 0,
      error: error.message
    };
  }
}

/**
 * Query NSF API for awards by research keywords
 * @param {string[]} keywords - Array of research keywords/terms
 * @param {number} yearsBack - Number of years to search back (default: 5)
 * @returns {Promise<Object>} Object with keyword results
 */
export async function queryNSFforKeywords(keywords, yearsBack = 5) {
  const results = {};
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - yearsBack);

  for (const keyword of keywords) {
    try {
      // Add small delay to respect rate limits
      await delay(200);

      const baseUrl = 'https://api.nsf.gov/services/v1/awards.json';
      const params = new URLSearchParams({
        keyword: keyword,
        dateStart: formatNSFDate(startDate),
        dateEnd: formatNSFDate(new Date()),
        printFields: 'id,title,fundProgramName,startDate,expDate,fundsObligatedAmt,agency',
        rpp: '25'
      });

      const response = await fetch(`${baseUrl}?${params}`, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`NSF API error: ${response.status}`);
      }

      const data = await response.json();
      const awards = data.response?.award || [];

      results[keyword] = {
        awards: awards,
        totalCount: data.response?.metadata?.totalCount || 0,
        totalFunding: calculateTotalFunding(awards),
        averageAward: awards.length > 0 ? calculateTotalFunding(awards) / awards.length : 0
      };
    } catch (error) {
      console.error(`Error querying NSF for keyword "${keyword}":`, error);
      results[keyword] = {
        awards: [],
        totalCount: 0,
        totalFunding: 0,
        averageAward: 0,
        error: error.message
      };
    }
  }

  return results;
}

/**
 * Calculate total funding from NSF awards array
 * @param {Array} awards - Array of NSF award objects
 * @returns {number} Total funding amount
 */
function calculateTotalFunding(awards) {
  return awards.reduce((sum, award) => {
    const amount = parseFloat(award.fundsObligatedAmt) || 0;
    return sum + amount;
  }, 0);
}

/**
 * Format date for NSF API (MM/DD/YYYY format)
 * @param {Date} date - Date object to format
 * @returns {string} Formatted date string
 */
function formatNSFDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Format currency for display
 * @param {number} amount - Dollar amount
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount) {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(2)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  } else {
    return `$${amount.toFixed(0)}`;
  }
}

/**
 * Format NSF date string to readable format
 * @param {string} dateStr - NSF date string (MM/DD/YYYY)
 * @returns {string} Formatted date (YYYY-MM-DD)
 */
export function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const [month, day, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
}

/**
 * Add delay for rate limiting
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get fiscal years array for queries
 * @param {number} yearsBack - Number of years back
 * @returns {number[]} Array of fiscal years
 */
export function getFiscalYears(yearsBack) {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: yearsBack }, (_, i) => currentYear - i);
}

/**
 * Parse PI name into first and last name
 * @param {string} fullName - Full name string
 * @returns {{firstName: string, lastName: string}}
 */
export function parsePIName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: '', lastName: parts[0] };
  }
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  return { firstName, lastName };
}

/**
 * Normalize institution name for fuzzy matching
 * @param {string} institutionName - Institution name to normalize
 * @returns {Set<string>} Set of normalized keywords
 */
function normalizeInstitutionName(institutionName) {
  if (!institutionName) return new Set();

  // Convert to lowercase and remove common prefixes/suffixes
  let normalized = institutionName.toLowerCase();

  // Remove common administrative terms
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

  // Extract significant words (length > 2 to avoid "of", "at", etc.)
  const words = normalized
    .split(/[\s,.-]+/)
    .filter(word => word.length > 2)
    .filter(word => !['and', 'for', 'the'].includes(word));

  return new Set(words);
}

/**
 * Check if two institutions are likely the same based on keyword overlap
 * @param {string} institution1 - First institution name
 * @param {string} institution2 - Second institution name
 * @returns {boolean} True if institutions likely match
 */
function institutionsMatch(institution1, institution2) {
  if (!institution1 || !institution2) return false;

  const keywords1 = normalizeInstitutionName(institution1);
  const keywords2 = normalizeInstitutionName(institution2);

  if (keywords1.size === 0 || keywords2.size === 0) return false;

  // Calculate intersection
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
    // This prevents "UC Berkeley" from matching "UC San Diego"
    const campusIntersection = campus1.filter(k => campus2.includes(k));
    if (campusIntersection.length === 0) {
      return false; // Different campuses
    }
  }

  // Case 2: Only one has campus-specific keywords (e.g., "UC Berkeley" vs "Regents of UC")
  // This is OK - we assume "Regents of UC" could be any campus, so we allow the match
  // based on the shared state/system name

  // Require at least one non-generic keyword match
  const genericTerms = ['university', 'college', 'school', 'academy'];
  const significantMatches = Array.from(intersection).filter(k => !genericTerms.includes(k));

  return significantMatches.length > 0;
}

/**
 * Calculate keyword relevance score between proposal keywords and award/project text
 * @param {string[]} proposalKeywords - Keywords from the proposal
 * @param {string} projectText - Project title and/or abstract
 * @returns {number} Score from 0-1 indicating relevance
 */
function calculateKeywordRelevance(proposalKeywords, projectText) {
  if (!proposalKeywords || proposalKeywords.length === 0 || !projectText) {
    return 0;
  }

  const textLower = projectText.toLowerCase();
  let matches = 0;

  for (const keyword of proposalKeywords) {
    const keywordLower = keyword.toLowerCase();
    // Check for exact keyword match or word-level match
    if (textLower.includes(keywordLower)) {
      matches++;
    } else {
      // Check for partial matches (e.g., "quantum" matches "quantum mechanics")
      const keywordWords = keywordLower.split(/\s+/);
      if (keywordWords.some(word => word.length > 3 && textLower.includes(word))) {
        matches += 0.5; // Partial credit
      }
    }
  }

  return matches / proposalKeywords.length;
}

/**
 * Query NIH RePORTER API for a specific PI's projects
 * @param {string} piName - PI's full name
 * @param {number} yearsBack - Number of years to search back (default: 5)
 * @param {string} institution - Institution name for filtering (optional but recommended)
 * @param {string[]} proposalKeywords - Keywords from proposal for relevance filtering (optional)
 * @returns {Promise<{projects: Array, totalCount: number, totalFunding: number, warnings: Array, strategy: string}>}
 */
export async function queryNIHforPI(piName, yearsBack = 5, institution = null, proposalKeywords = null) {
  try {
    const baseUrl = 'https://api.reporter.nih.gov/v2/projects/search';
    const fiscalYears = getFiscalYears(yearsBack);

    // Helper function to query NIH with specific name format
    const queryNIH = async (firstName, lastName) => {
      const requestBody = {
        criteria: {
          pi_names: [
            {
              last_name: lastName,
              ...(firstName && { first_name: firstName })
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

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`NIH API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    };

    // Parse the PI name
    const { firstName, lastName } = parsePIName(piName);
    const warnings = [];

    // Strategy 1: Try with full first name (including middle initial if present)
    let data = await queryNIH(firstName, lastName);
    let projects = data.results || [];
    let strategy = 'full name';

    // Strategy 2: If no results and firstName has middle initial, try without it
    if (projects.length === 0 && firstName && firstName.includes(' ')) {
      // Remove middle initial/name (e.g., "Michiko E." -> "Michiko")
      const firstNameOnly = firstName.split(/\s+/)[0];
      console.log(`NIH: Trying without middle initial: "${firstNameOnly}" "${lastName}"`);
      await delay(650); // Rate limiting
      data = await queryNIH(firstNameOnly, lastName);
      projects = data.results || [];
      strategy = 'first name without middle initial';
    }

    // Strategy 3: If still no results, try last name only WITH INSTITUTION FILTERING
    if (projects.length === 0) {
      console.log(`NIH: Trying last name only: "${lastName}"`);
      await delay(650); // Rate limiting
      data = await queryNIH(null, lastName);
      let allProjects = data.results || [];
      strategy = 'last name only';

      // CRITICAL: Filter by institution if provided
      if (institution && allProjects.length > 0) {
        const filteredByInstitution = allProjects.filter(project => {
          const orgName = project.organization?.org_name;
          return orgName && institutionsMatch(institution, orgName);
        });

        if (filteredByInstitution.length > 0) {
          projects = filteredByInstitution;
          strategy = 'last name only (institution-filtered)';
          console.log(`NIH: Filtered ${allProjects.length} → ${filteredByInstitution.length} by institution match`);
        } else {
          // No institution match - likely all false positives
          console.log(`NIH: No institution match found. ${allProjects.length} results likely false positives.`);
          warnings.push(`Last name search returned ${allProjects.length} results, but none matched institution "${institution}". Results may be unreliable.`);
          projects = allProjects; // Keep unfiltered for now, but flag it
          strategy = 'last name only (no institution match - WARNING)';
        }
      } else {
        // No institution provided - use name filtering as before
        projects = allProjects;
        if (projects.length > 0 && firstName) {
          const firstNameLower = firstName.split(/\s+/)[0].toLowerCase();
          const filtered = projects.filter(project => {
            const pis = project.principal_investigators || [];
            return pis.some(pi =>
              pi.first_name?.toLowerCase() === firstNameLower &&
              pi.last_name?.toLowerCase() === lastName.toLowerCase()
            );
          });
          if (filtered.length > 0) {
            projects = filtered;
            strategy = 'last name only (name-filtered)';
          }
        }
      }

      // KEYWORD RELEVANCE FILTERING: Filter by research area alignment
      if (proposalKeywords && proposalKeywords.length > 0 && projects.length > 0) {
        const projectsWithScores = projects.map(project => {
          const projectText = project.project_title || '';
          const relevanceScore = calculateKeywordRelevance(proposalKeywords, projectText);
          return { project, relevanceScore };
        });

        // Filter out projects with very low relevance (< 0.1 = less than 10% keyword match)
        const relevantProjects = projectsWithScores.filter(p => p.relevanceScore >= 0.1);

        if (relevantProjects.length > 0 && relevantProjects.length < projects.length) {
          const beforeCount = projects.length;
          projects = relevantProjects.map(p => p.project);
          console.log(`NIH: Filtered ${beforeCount} → ${projects.length} by keyword relevance (removed unrelated research areas)`);
          strategy = strategy + ' + keyword-filtered';

          const removedCount = beforeCount - projects.length;
          warnings.push(`${removedCount} project(s) filtered out due to low keyword relevance (likely different research area).`);
        } else if (relevantProjects.length === 0 && projects.length > 0) {
          // All projects have low relevance - major mismatch
          console.log(`NIH WARNING: All ${projects.length} projects have low keyword relevance. Likely wrong person or different research area.`);
          warnings.push(`All ${projects.length} NIH projects show low keyword alignment with proposal research area. Results may be for a different researcher.`);
          strategy = strategy + ' (LOW RELEVANCE WARNING)';
        }
      }
    }

    // Result count threshold check (likely false positive if >50 results)
    const totalCount = data.meta?.total || projects.length;
    if (totalCount > 50 && strategy.includes('last name only')) {
      warnings.push(`Found ${totalCount} NIH projects using last name only. This may include awards to different people with the same last name.`);
      console.log(`NIH WARNING: High result count (${totalCount}) suggests possible false positives`);
    }

    if (projects.length > 0) {
      console.log(`NIH: Found ${projects.length} projects using strategy: ${strategy}`);
      if (warnings.length > 0) {
        console.log(`NIH WARNINGS: ${warnings.join('; ')}`);
      }
    }

    // Calculate total funding
    const totalFunding = projects.reduce((sum, project) => {
      const amount = parseFloat(project.award_amount) || 0;
      return sum + amount;
    }, 0);

    return {
      projects: projects,
      totalCount: totalCount,
      totalFunding: totalFunding,
      warnings: warnings,
      strategy: strategy
    };
  } catch (error) {
    console.error('Error querying NIH for PI:', error);
    return {
      projects: [],
      totalCount: 0,
      totalFunding: 0,
      warnings: [],
      strategy: 'error',
      error: error.message
    };
  }
}

/**
 * Query NIH RePORTER API for projects by research keywords
 * @param {string[]} keywords - Array of research keywords/terms
 * @param {number} yearsBack - Number of years to search back (default: 5)
 * @returns {Promise<Object>} Object with keyword results
 */
export async function queryNIHforKeywords(keywords, yearsBack = 5) {
  const results = {};
  const fiscalYears = getFiscalYears(yearsBack);
  const baseUrl = 'https://api.reporter.nih.gov/v2/projects/search';

  for (const keyword of keywords) {
    try {
      // Add small delay to respect rate limits (NIH: 100 requests/minute)
      await delay(650);

      const requestBody = {
        criteria: {
          advanced_text_search: {
            operator: "and",
            search_field: "terms",
            search_text: keyword
          },
          fiscal_years: fiscalYears
        },
        include_fields: [
          'ProjectTitle',
          'Organization',
          'AwardAmount',
          'FiscalYear',
          'AgencyCode'
        ],
        limit: 100,
        offset: 0
      };

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`NIH API error: ${response.status}`);
      }

      const data = await response.json();
      const projects = data.results || [];

      const totalFunding = projects.reduce((sum, project) => {
        const amount = parseFloat(project.award_amount) || 0;
        return sum + amount;
      }, 0);

      results[keyword] = {
        projects: projects,
        totalCount: data.meta?.total || projects.length,
        totalFunding: totalFunding,
        averageAward: projects.length > 0 ? totalFunding / projects.length : 0
      };
    } catch (error) {
      console.error(`Error querying NIH for keyword "${keyword}":`, error);
      results[keyword] = {
        projects: [],
        totalCount: 0,
        totalFunding: 0,
        averageAward: 0,
        error: error.message
      };
    }
  }

  return results;
}

/**
 * Query USAspending.gov API for an institution's federal awards
 * @param {string} institution - Institution name
 * @param {number} yearsBack - Number of years to search back (default: 5)
 * @returns {Promise<{awards: Array, totalCount: number, totalFunding: number, byAgency: Object}>}
 */
export async function queryUSASpending(institution, yearsBack = 5) {
  try {
    const baseUrl = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - yearsBack);

    const requestBody = {
      filters: {
        recipient_search_text: [institution],
        award_type_codes: ["02", "03", "04", "05"], // Grants and cooperative agreements
        time_period: [{
          start_date: formatUSASpendingDate(startDate),
          end_date: formatUSASpendingDate(new Date())
        }]
      },
      fields: [
        "Award ID",
        "Award Amount",
        "Description",
        "Start Date",
        "End Date",
        "Awarding Agency",
        "Awarding Sub Agency"
      ],
      limit: 100,
      page: 1,
      sort: "Award Amount",
      order: "desc"
    };

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`USAspending API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const awards = data.results || [];

    // Calculate total funding and group by agency
    let totalFunding = 0;
    const byAgency = {};

    awards.forEach(award => {
      const amount = parseFloat(award.Award_Amount) || 0;
      totalFunding += amount;

      const agency = award.Awarding_Agency || 'Unknown';
      if (!byAgency[agency]) {
        byAgency[agency] = {
          count: 0,
          totalFunding: 0,
          awards: []
        };
      }
      byAgency[agency].count++;
      byAgency[agency].totalFunding += amount;
      byAgency[agency].awards.push(award);
    });

    return {
      awards: awards,
      totalCount: data.page_metadata?.total || awards.length,
      totalFunding: totalFunding,
      byAgency: byAgency
    };
  } catch (error) {
    console.error('Error querying USAspending:', error);
    return {
      awards: [],
      totalCount: 0,
      totalFunding: 0,
      byAgency: {},
      error: error.message
    };
  }
}

/**
 * Format date for USAspending API (YYYY-MM-DD format)
 * @param {Date} date - Date object to format
 * @returns {string} Formatted date string
 */
function formatUSASpendingDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
