/**
 * ContactEnrichmentService - Tiered contact information lookup
 *
 * Implements a 3-tier system for finding researcher contact information:
 *
 * Tier 1: PubMed (FREE)
 *   - Extract email from affiliation strings in recent publications
 *   - Trust emails from papers < 2 years old
 *
 * Tier 2: ORCID (FREE)
 *   - Query ORCID API for email, website, ORCID ID
 *   - Requires user to provide ORCID API credentials
 *
 * Tier 3: Claude Web Search (PAID)
 *   - Use Claude's web search tool to find faculty pages, emails
 *   - ~$0.01 per search + token costs
 *   - User must opt-in and provide Claude API key
 */

const { ContactParser } = require('../utils/contact-parser');
const { ORCIDService } = require('./orcid-service');
const { DatabaseService } = require('./database-service');

// Cost estimates for UI display
const COSTS = {
  PUBMED: 0,
  ORCID: 0,
  CLAUDE_WEB_SEARCH: 0.02, // ~$0.01 search + ~$0.01 tokens
};

class ContactEnrichmentService {
  /**
   * Enrich a single candidate with contact information
   *
   * @param {Object} candidate - Candidate object with name, affiliation, publications
   * @param {Object} options - Enrichment options
   * @param {Object} options.credentials - API credentials { orcidClientId, orcidClientSecret, claudeApiKey }
   * @param {boolean} options.usePubmed - Use Tier 1 (default: true)
   * @param {boolean} options.useOrcid - Use Tier 2 (default: true if credentials provided)
   * @param {boolean} options.useClaudeSearch - Use Tier 3 (default: false, requires opt-in)
   * @param {Function} options.onProgress - Progress callback
   * @returns {Promise<Object>} Enriched candidate with contact info
   */
  static async enrichCandidate(candidate, options = {}) {
    const {
      credentials = {},
      usePubmed = true,
      useOrcid = true,
      useClaudeSearch = false,
      onProgress = () => {},
    } = options;

    const result = {
      ...candidate,
      contactEnrichment: {
        email: null,
        emailSource: null,
        emailYear: null,
        emailIsRecent: false,
        website: null,
        websiteSource: null,
        orcidId: null,
        orcidUrl: null,
        facultyPageUrl: null,
        googleScholarUrl: this.buildGoogleScholarUrl(candidate.name, candidate.affiliation),
        enrichedAt: new Date().toISOString(),
        tiersUsed: [],
        tierResults: {},
      },
    };

    // Check database first - maybe we already have this info
    const existingContact = await this.checkDatabase(candidate);
    if (existingContact && existingContact.email) {
      onProgress({ tier: 'database', status: 'found', message: 'Found in database' });
      result.contactEnrichment = {
        ...result.contactEnrichment,
        ...existingContact,
        emailSource: existingContact.email_source || 'database',
      };
      return result;
    }

    // ============================================
    // TIER 1: PubMed (FREE)
    // ============================================
    if (usePubmed && candidate.publications && candidate.publications.length > 0) {
      onProgress({ tier: 1, status: 'searching', message: 'Checking PubMed publications...' });
      result.contactEnrichment.tiersUsed.push('pubmed');

      const pubmedResult = ContactParser.extractContactFromPublications(
        candidate.publications,
        candidate.name,
        { maxEmailAge: 2 }
      );

      result.contactEnrichment.tierResults.pubmed = pubmedResult;

      if (pubmedResult.email) {
        result.contactEnrichment.email = pubmedResult.email;
        result.contactEnrichment.emailSource = 'pubmed';
        result.contactEnrichment.emailYear = pubmedResult.emailYear;
        result.contactEnrichment.emailIsRecent = pubmedResult.isRecent;

        onProgress({
          tier: 1,
          status: 'found',
          message: `Found email in PubMed (${pubmedResult.emailYear})`,
        });

        // If email is recent, we can trust it - save and return
        if (pubmedResult.isRecent) {
          await this.saveToDatabase(candidate, result.contactEnrichment);
          return result;
        }
        // Otherwise, continue to verify/supplement with other sources
      } else {
        onProgress({ tier: 1, status: 'not_found', message: 'No email in PubMed' });
      }
    }

    // ============================================
    // TIER 2: ORCID (FREE)
    // ============================================
    const hasOrcidCredentials = credentials.orcidClientId && credentials.orcidClientSecret;

    if (useOrcid && hasOrcidCredentials) {
      onProgress({ tier: 2, status: 'searching', message: 'Searching ORCID...' });
      result.contactEnrichment.tiersUsed.push('orcid');

      try {
        const orcidResult = await ORCIDService.findContact({
          name: candidate.name,
          affiliation: candidate.affiliation,
          clientId: credentials.orcidClientId,
          clientSecret: credentials.orcidClientSecret,
        });

        result.contactEnrichment.tierResults.orcid = orcidResult;

        if (orcidResult) {
          // Always capture ORCID ID if found
          if (orcidResult.orcidId) {
            result.contactEnrichment.orcidId = orcidResult.orcidId;
            result.contactEnrichment.orcidUrl = orcidResult.orcidUrl;
          }

          // Capture website if found
          if (orcidResult.website) {
            result.contactEnrichment.website = orcidResult.website;
            result.contactEnrichment.websiteSource = 'orcid';
          }

          // Use ORCID email if we don't have one, or if ORCID is more authoritative
          if (orcidResult.email && !result.contactEnrichment.email) {
            result.contactEnrichment.email = orcidResult.email;
            result.contactEnrichment.emailSource = 'orcid';
            result.contactEnrichment.emailIsRecent = true; // ORCID emails are maintained by researchers
          }

          onProgress({
            tier: 2,
            status: 'found',
            message: `Found ORCID: ${orcidResult.orcidId}${orcidResult.email ? ' (with email)' : ''}`,
          });
        } else {
          onProgress({ tier: 2, status: 'not_found', message: 'Not found in ORCID' });
        }
      } catch (error) {
        console.error('ORCID lookup error:', error.message);
        onProgress({ tier: 2, status: 'error', message: `ORCID error: ${error.message}` });
        result.contactEnrichment.tierResults.orcid = { error: error.message };
      }
    } else if (useOrcid && !hasOrcidCredentials) {
      onProgress({ tier: 2, status: 'skipped', message: 'ORCID skipped (no credentials)' });
    }

    // If we have an email at this point, save and potentially skip Tier 3
    if (result.contactEnrichment.email && result.contactEnrichment.emailIsRecent) {
      await this.saveToDatabase(candidate, result.contactEnrichment);
      return result;
    }

    // ============================================
    // TIER 3: Claude Web Search (PAID)
    // ============================================
    if (useClaudeSearch && credentials.claudeApiKey) {
      onProgress({
        tier: 3,
        status: 'searching',
        message: 'Searching web with Claude (paid)...',
      });
      result.contactEnrichment.tiersUsed.push('claude_search');

      try {
        const claudeResult = await this.claudeWebSearch(candidate, credentials.claudeApiKey);
        result.contactEnrichment.tierResults.claude_search = claudeResult;

        if (claudeResult) {
          // Use Claude results if we still don't have email
          if (claudeResult.email && !result.contactEnrichment.email) {
            result.contactEnrichment.email = claudeResult.email;
            result.contactEnrichment.emailSource = 'claude_search';
            result.contactEnrichment.emailIsRecent = true;
          }

          // Capture faculty page URL
          if (claudeResult.facultyPageUrl) {
            result.contactEnrichment.facultyPageUrl = claudeResult.facultyPageUrl;
          }

          // Capture website if we don't have one
          if (claudeResult.website && !result.contactEnrichment.website) {
            result.contactEnrichment.website = claudeResult.website;
            result.contactEnrichment.websiteSource = 'claude_search';
          }

          onProgress({
            tier: 3,
            status: 'found',
            message: claudeResult.email ? 'Found contact via web search' : 'Found profile page',
          });
        } else {
          onProgress({ tier: 3, status: 'not_found', message: 'No results from web search' });
        }
      } catch (error) {
        console.error('Claude web search error:', error.message);
        onProgress({ tier: 3, status: 'error', message: `Search error: ${error.message}` });
        result.contactEnrichment.tierResults.claude_search = { error: error.message };
      }
    } else if (useClaudeSearch && !credentials.claudeApiKey) {
      onProgress({ tier: 3, status: 'skipped', message: 'Web search skipped (no API key)' });
    }

    // Save whatever we found to database
    await this.saveToDatabase(candidate, result.contactEnrichment);

    return result;
  }

  /**
   * Enrich multiple candidates
   *
   * @param {Array} candidates - Array of candidates
   * @param {Object} options - Same as enrichCandidate
   * @returns {Promise<Object>} Results with enriched candidates and stats
   */
  static async enrichCandidates(candidates, options = {}) {
    const { onProgress = () => {} } = options;

    const results = {
      enriched: [],
      stats: {
        total: candidates.length,
        withEmail: 0,
        withWebsite: 0,
        withOrcid: 0,
        bySource: {
          database: 0,
          pubmed: 0,
          orcid: 0,
          claude_search: 0,
        },
        estimatedCost: 0,
        actualCost: 0,
      },
    };

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];

      onProgress({
        overall: {
          current: i + 1,
          total: candidates.length,
          candidate: candidate.name,
        },
      });

      const enriched = await this.enrichCandidate(candidate, {
        ...options,
        onProgress: (tierProgress) => {
          onProgress({
            overall: { current: i + 1, total: candidates.length, candidate: candidate.name },
            tier: tierProgress,
          });
        },
      });

      results.enriched.push(enriched);

      // Update stats
      const ce = enriched.contactEnrichment;
      if (ce.email) {
        results.stats.withEmail++;
        if (ce.emailSource) {
          results.stats.bySource[ce.emailSource] = (results.stats.bySource[ce.emailSource] || 0) + 1;
        }
      }
      if (ce.website) results.stats.withWebsite++;
      if (ce.orcidId) results.stats.withOrcid++;
      if (ce.tiersUsed.includes('claude_search')) {
        results.stats.actualCost += COSTS.CLAUDE_WEB_SEARCH;
      }
    }

    return results;
  }

  /**
   * Estimate the cost of enriching candidates
   *
   * @param {Array} candidates - Candidates to estimate
   * @param {Object} options - Which tiers will be used
   * @returns {Object} Cost estimate
   */
  static estimateCost(candidates, options = {}) {
    const { useClaudeSearch = false } = options;

    const estimate = {
      total: candidates.length,
      freeOperations: candidates.length, // PubMed + ORCID are free
      paidOperations: 0,
      estimatedCost: 0,
      breakdown: {
        pubmed: { count: candidates.length, cost: 0 },
        orcid: { count: candidates.length, cost: 0 },
        claude_search: { count: 0, cost: 0 },
      },
    };

    if (useClaudeSearch) {
      // Estimate that ~50% of candidates might need Claude search
      // (those where PubMed and ORCID don't find contact info)
      const estimatedClaudeSearches = Math.ceil(candidates.length * 0.5);
      estimate.breakdown.claude_search = {
        count: estimatedClaudeSearches,
        cost: estimatedClaudeSearches * COSTS.CLAUDE_WEB_SEARCH,
      };
      estimate.paidOperations = estimatedClaudeSearches;
      estimate.estimatedCost = estimate.breakdown.claude_search.cost;
    }

    return estimate;
  }

  /**
   * Check database for existing contact info
   */
  static async checkDatabase(candidate) {
    try {
      const researcher = await DatabaseService.findResearcher(candidate.name);
      if (researcher && researcher.email) {
        return {
          email: researcher.email,
          email_source: researcher.email_source,
          website: researcher.website,
          orcidId: researcher.orcid,
          orcidUrl: researcher.orcid_url,
        };
      }
    } catch (error) {
      console.error('Database check error:', error.message);
    }
    return null;
  }

  /**
   * Save enrichment results to database
   */
  static async saveToDatabase(candidate, enrichment) {
    try {
      await DatabaseService.upsertResearcher({
        name: candidate.name,
        primary_affiliation: candidate.affiliation,
        email: enrichment.email,
        email_source: enrichment.emailSource,
        website: enrichment.website,
        orcid: enrichment.orcidId,
        orcid_url: enrichment.orcidUrl,
        google_scholar_url: enrichment.googleScholarUrl,
        faculty_page_url: enrichment.facultyPageUrl,
        contact_enriched_at: new Date(),
        contact_enrichment_source: enrichment.emailSource,
      });
    } catch (error) {
      console.error('Database save error:', error.message);
    }
  }

  /**
   * Claude Web Search implementation (Tier 3)
   * Uses Claude's web_search tool to find contact information
   */
  static async claudeWebSearch(candidate, apiKey) {
    // Build search query
    const searchQuery = `${candidate.name} ${candidate.affiliation || ''} email faculty page contact`.trim();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 3,
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Find the contact information for researcher "${candidate.name}"${candidate.affiliation ? ` at ${candidate.affiliation}` : ''}.

I need:
1. Their professional email address (institutional email preferred)
2. Their faculty page or lab website URL
3. Any other professional website

Search for their faculty profile, lab page, or institutional directory listing.

Return the information in this exact JSON format:
{
  "email": "the email address or null if not found",
  "facultyPageUrl": "URL to their faculty/profile page or null",
  "website": "URL to personal/lab website or null",
  "confidence": "high/medium/low based on how certain you are this is the right person"
}

Only return verified information you found through search. Do not guess or make up information.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${error}`);
    }

    const data = await response.json();

    // Extract the text response
    const textContent = data.content?.find(c => c.type === 'text');
    if (!textContent) {
      return null;
    }

    // Parse JSON from response
    try {
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse Claude response:', e.message);
    }

    return null;
  }

  /**
   * Build Google Scholar search URL for a researcher
   */
  static buildGoogleScholarUrl(name, affiliation) {
    if (!name) return null;

    // Clean up name
    const cleanName = name.replace(/^(Dr\.?|Prof\.?|Professor)\s+/i, '').trim();

    // Extract institution name from affiliation
    let institution = '';
    if (affiliation) {
      const parts = affiliation.split(',').map(p => p.trim());
      const instPart = parts.find(p =>
        /university|institute|college/i.test(p) &&
        !/^(department|dept|division|school)/i.test(p)
      );
      institution = instPart || parts[0] || '';
    }

    const query = institution ? `${cleanName} ${institution}` : cleanName;
    return `https://scholar.google.com/citations?view_op=search_authors&mauthors=${encodeURIComponent(query)}`;
  }
}

// Export costs for UI
ContactEnrichmentService.COSTS = COSTS;

module.exports = { ContactEnrichmentService };
