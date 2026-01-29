/**
 * Expert Reviewers Pro API - Multi-source reviewer search
 *
 * This endpoint orchestrates searches across:
 * - PubMed (NCBI)
 * - ArXiv
 * - BioRxiv
 * - Google Scholar (via SerpAPI)
 *
 * It reuses the existing metadata extraction from find-reviewers,
 * then searches academic databases for real researchers.
 */

import { createClaudeClient } from '../../shared/api/handlers/claudeClient';
import { createFileProcessor } from '../../shared/api/handlers/fileProcessor';
import { getApiKeyManager } from '../../shared/utils/apiKeyManager';
import { nextRateLimiter } from '../../shared/api/middleware/rateLimiter';
import { createSearchQueryPrompt, parseSearchQueryResponse } from '../../shared/config/prompts/find-reviewers';
import { requireAuth } from '../../lib/utils/auth';

// Import services (these use CommonJS exports)
const { DatabaseService } = require('../../lib/services/database-service');
const { PubMedService } = require('../../lib/services/pubmed-service');
const { ArXivService } = require('../../lib/services/arxiv-service');
const { BioRxivService } = require('../../lib/services/biorxiv-service');
const { ScholarService } = require('../../lib/services/scholar-service');
const { DeduplicationService } = require('../../lib/services/deduplication-service');

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

// Rate limiter: 3 requests per minute (more intensive API usage)
const rateLimiter = nextRateLimiter({
  windowMs: 60 * 1000,
  max: 3,
});

export default async function handler(req, res) {
  console.log('Search Reviewers Pro API called:', new Date().toISOString());

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  // Apply rate limiting
  const rateLimitResult = await rateLimiter(req, res);
  if (!rateLimitResult) {
    return;
  }

  // Set up SSE for streaming progress updates
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sendProgress = (progress, message, data = null) => {
    const payload = { progress, message };
    if (data) payload.data = data;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const {
      file,
      apiKey,
      additionalNotes = '',
      excludedReviewers = '',
      maxCandidates = 20,
      searchSources = ['pubmed', 'arxiv', 'biorxiv', 'scholar'],
      skipCache = false
    } = req.body;

    // Clear cache if requested
    if (skipCache) {
      console.log('Clearing search cache...');
      await DatabaseService.clearAllCache();
    }

    if (!file) {
      sendProgress(0, 'Error: No file provided', { error: 'No file provided' });
      res.end();
      return;
    }

    // Validate API key
    const apiKeyManager = getApiKeyManager();
    let validatedKey;
    try {
      validatedKey = apiKeyManager.selectApiKey(apiKey);
    } catch (error) {
      sendProgress(0, 'Error: Invalid API key', { error: 'Invalid or missing API key' });
      res.end();
      return;
    }

    // ============================================
    // STEP 1: Process PDF and extract metadata
    // ============================================
    sendProgress(5, 'Processing PDF file...');

    const fileProcessor = createFileProcessor();
    const fileResponse = await fetch(file.url);
    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch file from blob storage: ${fileResponse.statusText}`);
    }

    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
    const { text: proposalText } = await fileProcessor.processFile(
      fileBuffer,
      file.filename || 'proposal.pdf'
    );

    if (!proposalText || proposalText.length < 100) {
      sendProgress(0, 'Error: Could not extract text', { error: 'Could not extract sufficient text from PDF' });
      res.end();
      return;
    }

    sendProgress(10, 'Generating optimized search queries with Claude...');

    // ============================================
    // STEP 2: Generate search queries using Claude
    // ============================================
    const claudeClient = createClaudeClient(validatedKey);
    const searchQueryPrompt = createSearchQueryPrompt(proposalText, additionalNotes);

    let queryResponse;
    try {
      queryResponse = await claudeClient.sendMessage(searchQueryPrompt, {
        maxTokens: 2000,
        temperature: 0.3
      });
    } catch (claudeError) {
      sendProgress(0, 'Error: Claude API error', { error: claudeError.message });
      res.end();
      return;
    }

    const searchData = parseSearchQueryResponse(queryResponse);
    console.log('\n========== CLAUDE ANALYSIS ==========');
    console.log('Title:', searchData.title);
    console.log('Author Institution:', searchData.authorInstitution);
    console.log('PubMed Queries:', searchData.queries.pubmed);
    console.log('ArXiv Queries:', searchData.queries.arxiv);
    console.log('BioRxiv Queries:', searchData.queries.biorxiv);
    console.log('Potential Reviewers from References:', searchData.potentialReviewers?.map(r => r.name) || []);
    console.log('======================================\n');

    // Create extractedInfo object for compatibility with rest of code
    const extractedInfo = {
      title: searchData.title,
      authorInstitution: searchData.authorInstitution,
      queries: searchData.queries,
      potentialReviewers: searchData.potentialReviewers || []
    };

    sendProgress(20, 'Search queries generated, starting academic database searches...');

    // ============================================
    // STEP 3: Search all academic sources
    // ============================================
    const candidates = [];
    const searchStats = {
      pubmed: 0,
      arxiv: 0,
      biorxiv: 0,
      scholar: 0,
      claude: 0
    };

    // PubMed search - use Claude-generated queries
    if (searchSources.includes('pubmed')) {
      sendProgress(25, 'Searching PubMed...');
      console.log('\n========== PUBMED SEARCH ==========');
      const pubmedQueries = extractedInfo.queries?.pubmed || [];
      console.log('Queries from Claude:', pubmedQueries);

      for (const query of pubmedQueries) {
        try {
          console.log('Searching:', query);
          const pubmedArticles = await PubMedService.search(query, 30);
          searchStats.pubmed += pubmedArticles.length;
          console.log(`  Found ${pubmedArticles.length} articles`);

          for (const article of pubmedArticles) {
            for (const author of article.authors) {
              if (author.name) {
                candidates.push({
                  name: author.name,
                  affiliation: author.affiliation,
                  source: 'pubmed',
                  publications: [{
                    title: article.title,
                    authors: article.authors.map(a => a.name),
                    publicationDate: article.publicationDate,
                    year: article.year,
                    journal: article.journal,
                    doi: article.doi,
                    pmid: article.pmid,
                    url: article.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}` :
                         article.doi ? `https://doi.org/${article.doi}` : null,
                  }],
                });
              }
            }
          }
        } catch (error) {
          console.error('PubMed query error:', query, error.message);
        }
      }
      console.log('Total PubMed candidates:', searchStats.pubmed);
      console.log('====================================\n');
    }

    // ArXiv search - use Claude-generated queries
    if (searchSources.includes('arxiv')) {
      sendProgress(40, 'Searching ArXiv...');
      console.log('\n========== ARXIV SEARCH ==========');
      const arxivQueries = extractedInfo.queries?.arxiv || [];
      console.log('Queries from Claude:', arxivQueries);

      for (const query of arxivQueries) {
        try {
          console.log('Searching:', query);
          const arxivArticles = await ArXivService.search(query, 30);
          searchStats.arxiv += arxivArticles.length;
          console.log(`  Found ${arxivArticles.length} articles`);

          for (const article of arxivArticles) {
            for (const author of article.authors) {
              if (author) {
                candidates.push({
                  name: author,
                  source: 'arxiv',
                  publications: [{
                    title: article.title,
                    authors: article.authors,
                    publicationDate: article.publicationDate,
                    year: article.year,
                    arxivId: article.arxivId,
                    doi: article.doi,
                    url: article.arxivId ? `https://arxiv.org/abs/${article.arxivId}` :
                         article.doi ? `https://doi.org/${article.doi}` : null,
                  }],
                  keywords: article.categories,
                });
              }
            }
          }
        } catch (error) {
          console.error('ArXiv query error:', query, error.message);
        }
      }
      console.log('Total ArXiv candidates:', searchStats.arxiv);
      console.log('===================================\n');
    }

    // BioRxiv search - use Claude-generated queries
    if (searchSources.includes('biorxiv')) {
      sendProgress(55, 'Searching BioRxiv...');
      console.log('\n========== BIORXIV SEARCH ==========');
      const biorxivQueries = extractedInfo.queries?.biorxiv || [];
      console.log('Queries from Claude:', biorxivQueries);

      for (const query of biorxivQueries) {
        try {
          console.log('Searching:', query);
          const biorxivArticles = await BioRxivService.search(query, 30);
          searchStats.biorxiv += biorxivArticles.length;
          console.log(`  Found ${biorxivArticles.length} articles`);

          for (const article of biorxivArticles) {
            for (const author of article.authors) {
              if (author) {
                candidates.push({
                  name: author,
                  affiliation: article.institution,
                  source: 'biorxiv',
                  publications: [{
                    title: article.title,
                    authors: article.authors,
                    publicationDate: article.publicationDate,
                    year: article.year,
                    doi: article.doi,
                    url: article.doi ? `https://doi.org/${article.doi}` : null,
                  }],
                });
              }
            }
          }
        } catch (error) {
          console.error('BioRxiv query error:', query, error.message);
        }
      }
      console.log('Total BioRxiv candidates:', searchStats.biorxiv);
      console.log('=====================================\n');
    }

    // Google Scholar search - search for specific names from Claude's suggestions
    console.log('\n========== GOOGLE SCHOLAR SEARCH ==========');
    console.log('Is Configured:', ScholarService.isConfigured());
    console.log('Selected in Sources:', searchSources.includes('scholar'));
    const potentialReviewers = extractedInfo.potentialReviewers || [];
    console.log('Potential Reviewers to look up:', potentialReviewers.map(r => r.name));

    if (searchSources.includes('scholar') && ScholarService.isConfigured() && potentialReviewers.length > 0) {
      sendProgress(70, 'Looking up reviewer profiles on Google Scholar...');

      for (const reviewer of potentialReviewers) {
        try {
          console.log('Searching for:', reviewer.name);
          // Search by name to find the specific person
          const scholarProfiles = await ScholarService.searchAuthors(reviewer.name, 3);
          searchStats.scholar += scholarProfiles.length;
          console.log(`  Found ${scholarProfiles.length} profiles`);

          for (const profile of scholarProfiles) {
            if (profile.name) {
              candidates.push({
                name: profile.name,
                affiliation: profile.affiliation,
                email: profile.email,
                website: profile.website,
                hIndex: profile.hIndex,
                citations: profile.totalCitations,
                source: 'scholar',
                keywords: profile.interests,
                publications: profile.recentPublications,
                claudeReason: reviewer.reason, // Keep Claude's reason for suggesting them
              });
            }
          }
        } catch (error) {
          console.error('Scholar lookup error:', reviewer.name, error.message);
        }
      }
      console.log('Total Scholar candidates:', searchStats.scholar);
    } else if (searchSources.includes('scholar') && potentialReviewers.length > 0) {
      sendProgress(70, 'Skipping Google Scholar (no API key)...');
      console.log('Skipped - no API key configured');
    }

    // Always add Claude's suggestions as candidates (even without Scholar verification)
    // This ensures we have good suggestions even if Scholar is disabled
    if (potentialReviewers.length > 0) {
      console.log('\nAdding Claude-suggested reviewers as candidates...');
      for (const reviewer of potentialReviewers) {
        candidates.push({
          name: reviewer.name,
          source: 'claude',
          claudeReason: reviewer.reason,
          // These will be enriched if Scholar found them, otherwise they're Claude-only
        });
        searchStats.claude++;
      }
      console.log(`Added ${potentialReviewers.length} Claude-suggested reviewers`);
    }
    console.log('============================================\n');

    console.log(`Found ${candidates.length} total candidates across all sources`);
    sendProgress(75, `Found ${candidates.length} candidates, deduplicating...`);

    // Log sample candidates before deduplication
    console.log('\n========== SAMPLE CANDIDATES BEFORE DEDUP ==========');
    candidates.slice(0, 5).forEach((c, i) => {
      console.log(`${i + 1}. ${c.name} | Source: ${c.source} | Affiliation: ${c.affiliation || 'N/A'} | h-index: ${c.hIndex || 'N/A'}`);
    });
    console.log('=====================================================\n');

    // ============================================
    // STEP 4: Deduplicate and merge
    // ============================================
    sendProgress(80, 'Deduplicating researchers...');
    const deduplicated = await DeduplicationService.deduplicateAndStore(candidates);
    console.log(`\n========== DEDUPLICATION RESULTS ==========`);
    console.log(`Before: ${candidates.length} candidates`);
    console.log(`After: ${deduplicated.length} unique researchers`);
    console.log('Sample deduplicated:');
    deduplicated.slice(0, 5).forEach((r, i) => {
      console.log(`${i + 1}. ${r.name} | Affiliation: ${r.primaryAffiliation || 'N/A'} | Sources: ${r.sources?.join(', ') || 'unknown'} | h-index: ${r.hIndex || 'N/A'}`);
    });
    console.log('============================================\n');

    // ============================================
    // STEP 5: Filter conflicts of interest
    // ============================================
    sendProgress(85, 'Filtering conflicts of interest...');
    const excludeNames = excludedReviewers
      .split('\n')
      .map(n => n.trim())
      .filter(Boolean);

    console.log('\n========== COI FILTERING ==========');
    console.log('Author Institution:', extractedInfo.authorInstitution);
    console.log('Excluded Names:', excludeNames.length ? excludeNames : 'none');

    const filtered = DeduplicationService.filterConflicts(
      deduplicated,
      extractedInfo.authorInstitution,
      excludeNames
    );
    console.log(`Before: ${deduplicated.length} researchers`);
    console.log(`After: ${filtered.length} researchers (${deduplicated.length - filtered.length} removed)`);
    console.log('====================================\n');

    // ============================================
    // STEP 6: Rank by relevance
    // ============================================
    sendProgress(90, 'Ranking by relevance...');
    // Extract keywords from the Claude-generated queries
    const allQueries = [
      ...(extractedInfo.queries?.pubmed || []),
      ...(extractedInfo.queries?.arxiv || []),
      ...(extractedInfo.queries?.biorxiv || []),
      ...(extractedInfo.queries?.scholar || []),
    ];
    // Split queries into individual keywords
    const proposalKeywords = [...new Set(
      allQueries.flatMap(q => q.split(/\s+/))
        .filter(k => k && k.length > 2)
        .map(k => k.toLowerCase())
    )];

    console.log('\n========== RANKING ==========');
    console.log('Proposal Keywords:', proposalKeywords.slice(0, 15).join(', '));

    const ranked = DeduplicationService.rankByRelevance(filtered, proposalKeywords);
    console.log('Top 10 after ranking:');
    ranked.slice(0, 10).forEach((r, i) => {
      console.log(`${i + 1}. ${r.name} | Score: ${r.relevanceScore?.toFixed(1)} | h-index: ${r.hIndex || 'N/A'} | Pubs: ${r.publications?.length || 0} | Affiliation: ${r.primaryAffiliation || 'N/A'}`);
    });
    console.log('==============================\n');

    // ============================================
    // STEP 7: Return top candidates
    // ============================================
    const topCandidates = ranked.slice(0, maxCandidates);

    // Record suggestions in database (optional)
    const proposalId = `proposal_${Date.now()}`;
    for (let i = 0; i < topCandidates.length; i++) {
      const candidate = topCandidates[i];
      if (candidate.id) {
        try {
          await DatabaseService.recordSuggestion(
            proposalId,
            extractedInfo.title || 'Untitled',
            candidate.id,
            candidate.relevanceScore || (1.0 - (i / topCandidates.length)),
            `Matched via academic database search`,
            candidate.sources || [candidate.source || 'unknown']
          );
        } catch (error) {
          // Non-fatal error - continue without recording
        }
      }
    }

    // Get recent publications for top candidates
    // Process sequentially to avoid PubMed rate limits
    sendProgress(95, 'Fetching recent publications...');
    const enriched = [];

    for (let idx = 0; idx < topCandidates.length; idx++) {
      const researcher = topCandidates[idx];
      let publications = [];
      let foundAffiliation = null;

      console.log(`\nEnriching (${idx + 1}/${topCandidates.length}): ${researcher.name} (sources: ${researcher.sources?.join(',') || researcher.source})`);

      // First try: Get from database
      if (researcher.id) {
        try {
          const dbPubs = await DatabaseService.getRecentPublications(researcher.id, 5);
          // Add URLs to database publications
          publications = dbPubs.map(pub => ({
            ...pub,
            url: pub.url || (pub.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}` :
                 pub.arxivId ? `https://arxiv.org/abs/${pub.arxivId}` :
                 pub.doi ? `https://doi.org/${pub.doi}` : null),
          }));
          console.log(`  Database: ${publications.length} publications`);
        } catch (error) {
          console.log(`  Database error: ${error.message}`);
        }
      }

      // Second try: Use existing publications from candidate data
      if (publications.length === 0 && researcher.publications?.length > 0) {
        // Ensure URLs are present
        publications = researcher.publications.slice(0, 5).map(pub => ({
          ...pub,
          url: pub.url || (pub.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}` :
               pub.arxivId ? `https://arxiv.org/abs/${pub.arxivId}` :
               pub.doi ? `https://doi.org/${pub.doi}` : null),
        }));
        console.log(`  Candidate data: ${publications.length} publications`);
      }

      // Third try: Search PubMed by author name if we still don't have publications
      // Only do PubMed lookup if we have no publications (skip affiliation-only lookups to reduce API calls)
      const needsPubMedLookup = publications.length === 0;
      if (needsPubMedLookup && researcher.name) {
        try {
          console.log(`  PubMed lookup for: ${researcher.name}`);
          // Search PubMed for papers by this author
          const authorQuery = `${researcher.name}[Author]`;
          const pubmedArticles = await PubMedService.search(authorQuery, 5);
          console.log(`  PubMed returned: ${pubmedArticles.length} articles`);

          if (pubmedArticles.length > 0) {
            publications = pubmedArticles.map(article => ({
              title: article.title,
              authors: article.authors?.map(a => a.name) || [],
              year: article.year,
              journal: article.journal,
              doi: article.doi,
              pmid: article.pmid,
              url: article.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}` :
                   article.doi ? `https://doi.org/${article.doi}` : null,
            }));
            console.log(`  Assigned ${publications.length} publications from PubMed`);

            // Try to extract affiliation from the articles
            const searchName = researcher.name.toLowerCase();
            for (const article of pubmedArticles) {
              if (foundAffiliation) break;
              for (const author of (article.authors || [])) {
                if (author.affiliation && author.name?.toLowerCase().includes(searchName.split(' ').pop())) {
                  foundAffiliation = author.affiliation;
                  console.log(`  Found affiliation: ${foundAffiliation.substring(0, 50)}...`);
                  break;
                }
              }
            }
          }

          // Add delay between PubMed requests (400ms for rate limiting)
          await new Promise(resolve => setTimeout(resolve, 400));
        } catch (error) {
          console.error(`Error fetching publications for ${researcher.name}:`, error.message);
        }
      }

      // Filter publications to last 10 years
      const tenYearsAgo = new Date().getFullYear() - 10;
      const recentPubs = publications.filter(pub => {
        const year = pub.year || (pub.publicationDate ? new Date(pub.publicationDate).getFullYear() : 0);
        return year >= tenYearsAgo;
      });

      enriched.push({
        ...researcher,
        recentPublications: recentPubs.slice(0, 5), // Limit to 5 most recent
        // Add affiliation if we found one and researcher doesn't have one
        primaryAffiliation: researcher.primaryAffiliation || foundAffiliation || null,
      });
    }

    // Filter out candidates without BOTH publications AND affiliation - they're not useful
    const usefulCandidates = enriched.filter(candidate => {
      const hasPublications = candidate.recentPublications && candidate.recentPublications.length > 0;
      const hasAffiliation = candidate.primaryAffiliation && candidate.primaryAffiliation.trim().length > 0;
      return hasPublications && hasAffiliation;
    });

    console.log(`\n========== QUALITY FILTER ==========`);
    console.log(`Before: ${enriched.length} candidates`);
    console.log(`After: ${usefulCandidates.length} useful candidates (removed ${enriched.length - usefulCandidates.length} missing publications AND/OR affiliation)`);
    console.log(`=====================================\n`);

    sendProgress(100, 'Search complete!', {
      success: true,
      proposalId,
      extractedInfo,
      candidates: usefulCandidates,
      stats: {
        totalFound: candidates.length,
        afterDeduplication: deduplicated.length,
        afterFiltering: filtered.length,
        afterQualityFilter: usefulCandidates.length,
        returned: usefulCandidates.length,
        sourceBreakdown: searchStats,
      },
    });

    res.end();

  } catch (error) {
    console.error('Error in search-reviewers-pro:', error);
    sendProgress(0, `Error: ${error.message}`, { error: error.message });
    res.end();
  }
}
