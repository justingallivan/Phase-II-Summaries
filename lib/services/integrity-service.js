/**
 * IntegrityService - Applicant Integrity Screening
 *
 * Orchestrates multi-source integrity checks:
 * 1. Retraction Watch database (local)
 * 2. PubPeer search via SERP API
 * 3. News search via SERP API
 *
 * Uses Haiku for AI summarization of unstructured search results.
 */

const { sql } = require('@vercel/postgres');
const { IntegrityMatchingService } = require('./integrity-matching-service');
const { integrityPrompts } = require('../../shared/config/prompts/integrity-screener');

class IntegrityService {
  static serpApiKey = process.env.SERP_API_KEY;
  static serpBaseUrl = 'https://serpapi.com/search.json';

  // ============================================
  // MAIN SCREENING FUNCTION
  // ============================================

  /**
   * Screen multiple applicants for integrity concerns
   * Yields progress updates for streaming
   *
   * @param {Array} applicants - [{name, role, institution}]
   * @param {string} claudeApiKey - Claude API key
   * @param {string} serpApiKey - SERP API key (optional)
   * @param {number} userProfileId - User profile ID for storing results
   * @yields {Object} Progress updates and final results
   */
  static async *screenApplicants(applicants, claudeApiKey, serpApiKey = null, userProfileId = null) {
    const results = [];
    const effectiveSerpKey = serpApiKey || this.serpApiKey;

    for (let i = 0; i < applicants.length; i++) {
      const applicant = applicants[i];
      yield {
        type: 'progress',
        message: `Screening ${applicant.name} (${i + 1}/${applicants.length})...`,
        applicantIndex: i,
      };

      const applicantResult = {
        name: applicant.name,
        role: applicant.role || 'Applicant',
        institution: applicant.institution || '',
        isCommonName: IntegrityMatchingService.isCommonName(applicant.name),
        sources: {},
        matchCount: 0,
        hasConcerns: false,
      };

      // Source 1: Retraction Watch database
      yield {
        type: 'progress',
        message: `  Checking Retraction Watch database...`,
        applicantIndex: i,
        source: 'retraction_watch',
      };

      try {
        const retractionMatches = await this.searchRetractionWatch(
          applicant.name,
          applicant.institution
        );

        applicantResult.sources.retraction_watch = {
          searched: true,
          matches: retractionMatches,
          error: null,
        };

        if (retractionMatches.length > 0) {
          applicantResult.matchCount += retractionMatches.length;
          applicantResult.hasConcerns = true;
        }
      } catch (error) {
        applicantResult.sources.retraction_watch = {
          searched: true,
          matches: [],
          error: error.message,
        };
      }

      // Source 2: PubPeer via SERP API
      if (effectiveSerpKey) {
        yield {
          type: 'progress',
          message: `  Searching PubPeer...`,
          applicantIndex: i,
          source: 'pubpeer',
        };

        try {
          const pubpeerResults = await this.searchPubPeer(
            applicant.name,
            applicant.institution,
            effectiveSerpKey,
            claudeApiKey
          );

          applicantResult.sources.pubpeer = {
            searched: true,
            ...pubpeerResults,
            error: null,
          };

          if (pubpeerResults.hasConcerns) {
            applicantResult.matchCount++;
            applicantResult.hasConcerns = true;
          }
        } catch (error) {
          applicantResult.sources.pubpeer = {
            searched: true,
            summary: null,
            hasConcerns: false,
            error: error.message,
          };
        }
      } else {
        applicantResult.sources.pubpeer = {
          searched: false,
          summary: null,
          error: 'SERP API key not configured',
        };
      }

      // Source 3: News search via SERP API
      if (effectiveSerpKey) {
        yield {
          type: 'progress',
          message: `  Searching news sources...`,
          applicantIndex: i,
          source: 'news',
        };

        try {
          const newsResults = await this.searchNews(
            applicant.name,
            applicant.institution,
            effectiveSerpKey,
            claudeApiKey
          );

          applicantResult.sources.news = {
            searched: true,
            ...newsResults,
            error: null,
          };

          if (newsResults.hasConcerns) {
            applicantResult.matchCount++;
            applicantResult.hasConcerns = true;
          }
        } catch (error) {
          applicantResult.sources.news = {
            searched: true,
            summary: null,
            hasConcerns: false,
            error: error.message,
          };
        }
      } else {
        applicantResult.sources.news = {
          searched: false,
          summary: null,
          error: 'SERP API key not configured',
        };
      }

      results.push(applicantResult);

      yield {
        type: 'applicant_complete',
        applicantIndex: i,
        result: applicantResult,
      };
    }

    // Save screening to database
    let screeningId = null;
    if (userProfileId) {
      try {
        screeningId = await this.saveScreening(
          userProfileId,
          'manual',
          applicants,
          results
        );
      } catch (error) {
        console.error('Failed to save screening:', error);
      }
    }

    yield {
      type: 'complete',
      results,
      screeningId,
      totalMatches: results.reduce((sum, r) => sum + r.matchCount, 0),
      applicantsWithConcerns: results.filter(r => r.hasConcerns).length,
    };
  }

  // ============================================
  // RETRACTION WATCH DATABASE SEARCH
  // ============================================

  /**
   * Search local Retraction Watch database for matches
   */
  static async searchRetractionWatch(name, institution) {
    const searchTerms = IntegrityMatchingService.buildDatabaseSearchTerms(name);
    const matches = [];
    const seenRecordIds = new Set();

    // Helper to process and add matches
    const processRows = (rows) => {
      for (const row of rows) {
        if (seenRecordIds.has(row.record_id)) continue;

        // Verify match and calculate confidence
        const authorsArray = row.authors ? row.authors.split(/[;,]/).map(a => a.trim()) : [];
        const matchResults = IntegrityMatchingService.findMatchesInAuthors(
          name,
          institution,
          authorsArray,
          50 // Minimum confidence
        );

        if (matchResults.length > 0) {
          const bestMatch = matchResults.reduce((best, m) =>
            m.confidence > best.confidence ? m : best
          );

          // Adjust confidence for institution match
          let adjustedConfidence = bestMatch.confidence;
          if (institution && row.institution) {
            adjustedConfidence = IntegrityMatchingService.adjustConfidenceForInstitution(
              bestMatch.confidence,
              institution,
              row.institution
            );
          }

          seenRecordIds.add(row.record_id);
          matches.push({
            recordId: row.record_id,
            title: row.title,
            authors: row.authors,
            matchedAuthor: bestMatch.matchedName,
            journal: row.journal,
            publisher: row.publisher,
            subject: row.subject,
            institution: row.institution,
            country: row.country,
            retractionDate: row.retraction_date,
            doi: row.original_paper_doi,
            retractionNature: row.retraction_nature,
            reasons: row.retraction_reasons || [],
            urls: row.urls,
            confidence: adjustedConfidence,
            confidenceLevel: IntegrityMatchingService.getConfidenceLevel(adjustedConfidence),
            matchType: bestMatch.matchType,
          });
        }
      }
    };

    // Search 1: Exact array containment using GIN index (fast)
    for (const term of searchTerms) {
      try {
        const result = await sql`
          SELECT
            id, record_id, title, authors, journal, publisher,
            subject, institution, country, retraction_date,
            original_paper_doi, retraction_nature, retraction_reasons, urls
          FROM retractions
          WHERE authors_normalized @> ARRAY[${term}]::text[]
          LIMIT 50
        `;
        processRows(result.rows);
      } catch (error) {
        console.error(`Retraction Watch search error for term "${term}":`, error);
      }
    }

    // Search 2: Text search on authors field to catch middle initials
    // This handles cases like "Justin Gallivan" matching "Justin P Gallivan"
    const nameParts = IntegrityMatchingService.extractNameParts(name);
    if (nameParts.first && nameParts.last) {
      try {
        // Search for first name and last name appearing anywhere in the authors field
        // Use patterns that can match "FirstName MiddleInitial LastName" format
        const firstNamePattern = '%' + nameParts.first + '%';
        const lastNamePattern = '%' + nameParts.last + '%';

        const result = await sql`
          SELECT
            id, record_id, title, authors, journal, publisher,
            subject, institution, country, retraction_date,
            original_paper_doi, retraction_nature, retraction_reasons, urls
          FROM retractions
          WHERE LOWER(authors) LIKE ${lastNamePattern}
            AND LOWER(authors) LIKE ${firstNamePattern}
          LIMIT 50
        `;
        processRows(result.rows);
      } catch (error) {
        console.error(`Retraction Watch text search error:`, error);
      }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);

    return matches;
  }

  // ============================================
  // PUBPEER SEARCH (VIA SERP API)
  // ============================================

  /**
   * Search PubPeer via SERP API and analyze with Haiku
   */
  static async searchPubPeer(name, institution, serpApiKey, claudeApiKey) {
    // Build search query - no honorifics, site-restricted
    const cleanName = name.replace(/\b(dr|prof|professor)\b\.?\s*/gi, '').trim();
    const query = institution
      ? `site:pubpeer.com "${cleanName}" "${institution}"`
      : `site:pubpeer.com "${cleanName}"`;

    const searchResults = await this.serpSearch(query, serpApiKey, 10);

    if (!searchResults || searchResults.length === 0) {
      return {
        hasConcerns: false,
        summary: 'No PubPeer discussions found.',
        searchUrl: `https://pubpeer.com/search?q=${encodeURIComponent(cleanName)}`,
        resultCount: 0,
      };
    }

    // Use Haiku to analyze results
    const summary = await this.analyzeWithHaiku(
      searchResults,
      integrityPrompts.pubpeerAnalysis(name, institution),
      claudeApiKey
    );

    const hasConcerns = !summary.toLowerCase().includes('no concerns found');

    return {
      hasConcerns,
      summary,
      searchUrl: `https://pubpeer.com/search?q=${encodeURIComponent(cleanName)}`,
      resultCount: searchResults.length,
      rawResults: searchResults.slice(0, 5), // Include top 5 for reference
    };
  }

  // ============================================
  // NEWS SEARCH (VIA SERP API)
  // ============================================

  /**
   * Search news via SERP API and analyze with Haiku
   */
  static async searchNews(name, institution, serpApiKey, claudeApiKey) {
    // Build search query
    const cleanName = name.replace(/\b(dr|prof|professor)\b\.?\s*/gi, '').trim();
    const query = institution
      ? `"${cleanName}" "${institution}"`
      : `"${cleanName}"`;

    // Use Google News engine
    const searchResults = await this.serpSearch(query, serpApiKey, 15, 'google_news');

    if (!searchResults || searchResults.length === 0) {
      return {
        hasConcerns: false,
        summary: 'No relevant news found.',
        resultCount: 0,
      };
    }

    // Use Haiku to analyze results
    const summary = await this.analyzeWithHaiku(
      searchResults,
      integrityPrompts.newsAnalysis(name, institution),
      claudeApiKey
    );

    const hasConcerns = !summary.toLowerCase().includes('no concerns found');

    return {
      hasConcerns,
      summary,
      resultCount: searchResults.length,
      rawResults: searchResults.slice(0, 5),
    };
  }

  // ============================================
  // SERP API HELPER
  // ============================================

  /**
   * Perform search via SERP API
   */
  static async serpSearch(query, apiKey, num = 10, engine = 'google') {
    const params = new URLSearchParams({
      engine,
      q: query,
      num: String(num),
      api_key: apiKey,
    });

    const url = `${this.serpBaseUrl}?${params}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        console.error('SERP API error:', response.status, response.statusText);
        return [];
      }

      const data = await response.json();

      // Handle both regular Google and Google News results
      const results = data.organic_results || data.news_results || [];

      return results.map(item => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet || item.description || '',
        source: item.source || item.displayed_link || '',
        date: item.date || null,
      }));
    } catch (error) {
      console.error('SERP search error:', error);
      return [];
    }
  }

  // ============================================
  // HAIKU ANALYSIS
  // ============================================

  /**
   * Analyze search results with Haiku
   */
  static async analyzeWithHaiku(searchResults, systemPrompt, claudeApiKey) {
    // Format search results for analysis
    const resultsText = searchResults.map((r, i) =>
      `[${i + 1}] ${r.title}\n    URL: ${r.link}\n    ${r.snippet}`
    ).join('\n\n');

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: `Please analyze these search results:\n\n${resultsText}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message ||
          `Claude API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      if (!data.content || !data.content[0]?.text) {
        throw new Error('Invalid response from Claude API');
      }

      return data.content[0].text;
    } catch (error) {
      console.error('Haiku analysis error:', error);
      return `Unable to analyze search results: ${error.message}`;
    }
  }

  // ============================================
  // DATABASE OPERATIONS
  // ============================================

  /**
   * Save screening results to database
   */
  static async saveScreening(userProfileId, screeningType, screenedNames, results) {
    const matchCount = results.reduce((sum, r) => sum + r.matchCount, 0);

    const result = await sql`
      INSERT INTO integrity_screenings (
        user_profile_id, screening_type, screened_names, results, match_count, status
      ) VALUES (
        ${userProfileId},
        ${screeningType},
        ${JSON.stringify(screenedNames)},
        ${JSON.stringify(results)},
        ${matchCount},
        'pending'
      )
      RETURNING id
    `;

    return result.rows[0].id;
  }

  /**
   * Get screening history for a user
   */
  static async getScreeningHistory(userProfileId, limit = 50, offset = 0) {
    const result = await sql`
      SELECT
        id, screening_type, screened_names, match_count, status,
        reviewed_at, notes, created_at
      FROM integrity_screenings
      WHERE user_profile_id = ${userProfileId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return result.rows;
  }

  /**
   * Get single screening with full details
   */
  static async getScreening(screeningId, userProfileId = null) {
    const result = userProfileId
      ? await sql`
          SELECT * FROM integrity_screenings
          WHERE id = ${screeningId} AND user_profile_id = ${userProfileId}
        `
      : await sql`
          SELECT * FROM integrity_screenings
          WHERE id = ${screeningId}
        `;

    if (result.rows.length === 0) {
      return null;
    }

    const screening = result.rows[0];

    // Get dismissals for this screening
    const dismissals = await sql`
      SELECT * FROM screening_dismissals
      WHERE screening_id = ${screeningId}
    `;

    return {
      ...screening,
      dismissals: dismissals.rows,
    };
  }

  /**
   * Update screening status
   */
  static async updateScreeningStatus(screeningId, status, notes = null) {
    await sql`
      UPDATE integrity_screenings
      SET
        status = ${status},
        reviewed_at = CURRENT_TIMESTAMP,
        notes = COALESCE(${notes}, notes)
      WHERE id = ${screeningId}
    `;
  }

  /**
   * Dismiss a match as false positive
   */
  static async dismissMatch(screeningId, source, sourceIdentifier, screenedName, reason, notes = null) {
    await sql`
      INSERT INTO screening_dismissals (
        screening_id, source, source_identifier, screened_name, dismissal_reason, notes
      ) VALUES (
        ${screeningId},
        ${source},
        ${sourceIdentifier},
        ${screenedName},
        ${reason},
        ${notes}
      )
    `;
  }

  /**
   * Get dismissed matches for a screening
   */
  static async getDismissals(screeningId) {
    const result = await sql`
      SELECT * FROM screening_dismissals
      WHERE screening_id = ${screeningId}
    `;

    return result.rows;
  }

  /**
   * Get retraction database stats
   */
  static async getRetractionStats() {
    const result = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT journal) as journals,
        MIN(retraction_date) as earliest,
        MAX(retraction_date) as latest
      FROM retractions
    `;

    return result.rows[0];
  }
}

module.exports = { IntegrityService };
