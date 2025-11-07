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
