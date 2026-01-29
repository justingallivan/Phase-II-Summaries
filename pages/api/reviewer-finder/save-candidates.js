/**
 * API Route: /api/reviewer-finder/save-candidates
 *
 * Saves selected candidates to the database for a proposal.
 * Creates researcher records if they don't exist, then links them
 * to the proposal via the reviewer_suggestions table.
 */

import { sql } from '@vercel/postgres';
import { DatabaseService } from '../../../lib/services/database-service';
import { requireAuth } from '../../../lib/utils/auth';

/**
 * Find existing researcher using multi-field matching.
 * Check order (first match wins):
 * 1. ORCID match (most reliable unique identifier)
 * 2. Email match (after enrichment provides it)
 * 3. Google Scholar ID match
 * 4. Normalized name match (fallback)
 *
 * Returns { id, matchedBy } or null if no match found.
 */
async function findExistingResearcher(candidate, normalizedName) {
  // Extract identifiers from candidate or contactEnrichment
  const orcid = candidate.orcid || candidate.contactEnrichment?.orcid || null;
  const email = candidate.email || candidate.contactEnrichment?.email || null;
  const googleScholarId = candidate.googleScholarId || candidate.contactEnrichment?.googleScholarId || null;

  // 1. Try ORCID match (most reliable)
  if (orcid) {
    const result = await sql`
      SELECT id FROM researchers WHERE orcid = ${orcid} LIMIT 1
    `;
    if (result.rows.length > 0) {
      return { id: result.rows[0].id, matchedBy: 'orcid' };
    }
  }

  // 2. Try email match
  if (email) {
    const result = await sql`
      SELECT id FROM researchers WHERE email = ${email} LIMIT 1
    `;
    if (result.rows.length > 0) {
      return { id: result.rows[0].id, matchedBy: 'email' };
    }
  }

  // 3. Try Google Scholar ID match
  if (googleScholarId) {
    const result = await sql`
      SELECT id FROM researchers WHERE google_scholar_id = ${googleScholarId} LIMIT 1
    `;
    if (result.rows.length > 0) {
      return { id: result.rows[0].id, matchedBy: 'google_scholar_id' };
    }
  }

  // 4. Fall back to normalized name match
  const result = await sql`
    SELECT id FROM researchers WHERE normalized_name = ${normalizedName} LIMIT 1
  `;
  if (result.rows.length > 0) {
    return { id: result.rows[0].id, matchedBy: 'normalized_name' };
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    const { proposalId, proposalTitle, proposalAbstract, proposalAuthors, proposalInstitution, programArea, summaryBlobUrl, grantCycleId, userProfileId, candidates } = req.body;

    if (!proposalId) {
      return res.status(400).json({ error: 'proposalId is required' });
    }

    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: 'candidates array is required' });
    }

    let savedCount = 0;
    const errors = [];

    for (const candidate of candidates) {
      try {
        // Step 1: Find or create researcher
        const normalizedName = candidate.name
          .toLowerCase()
          .replace(/^(dr\.?|prof\.?|professor)\s+/i, '')
          .replace(/[^a-z\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Extract all identifiers from candidate or contactEnrichment
        const candidateEmail = candidate.email || candidate.contactEnrichment?.email || null;
        const candidateWebsite = candidate.website || candidate.contactEnrichment?.website || null;
        const candidateOrcid = candidate.orcid || candidate.contactEnrichment?.orcid || null;
        const candidateGoogleScholarId = candidate.googleScholarId || candidate.contactEnrichment?.googleScholarId || null;

        // Check if researcher exists using multi-field matching
        const existingResearcher = await findExistingResearcher(candidate, normalizedName);

        let researcherId;

        if (existingResearcher) {
          researcherId = existingResearcher.id;

          // Merge new data into existing record (only update null fields)
          await sql`
            UPDATE researchers
            SET
              email = COALESCE(${candidateEmail}, email),
              website = COALESCE(${candidateWebsite}, website),
              orcid = COALESCE(${candidateOrcid}, orcid),
              google_scholar_id = COALESCE(${candidateGoogleScholarId}, google_scholar_id),
              h_index = COALESCE(${candidate.hIndex || null}, h_index),
              total_citations = COALESCE(${candidate.totalCitations || null}, total_citations),
              last_updated = CURRENT_TIMESTAMP
            WHERE id = ${researcherId}
          `;
        } else {
          // Create new researcher with all available data
          const insertResult = await sql`
            INSERT INTO researchers (
              name,
              normalized_name,
              primary_affiliation,
              email,
              website,
              orcid,
              google_scholar_id,
              h_index,
              total_citations
            )
            VALUES (
              ${candidate.name},
              ${normalizedName},
              ${candidate.affiliation || null},
              ${candidateEmail},
              ${candidateWebsite},
              ${candidateOrcid},
              ${candidateGoogleScholarId},
              ${candidate.hIndex || null},
              ${candidate.totalCitations || null}
            )
            RETURNING id
          `;
          researcherId = insertResult.rows[0].id;
        }

        // Step 2: Determine source array
        const sources = [];
        if (candidate.isClaudeSuggestion || candidate.source === 'claude_suggestion') {
          sources.push('claude');
        }
        if (candidate.verificationSource === 'pubmed' || candidate.source === 'pubmed') {
          sources.push('pubmed');
        }
        if (candidate.source === 'arxiv') {
          sources.push('arxiv');
        }
        if (candidate.source === 'biorxiv') {
          sources.push('biorxiv');
        }
        if (sources.length === 0) {
          sources.push(candidate.source || 'unknown');
        }

        // Step 3: Calculate relevance score
        const relevanceScore = candidate.verificationConfidence || candidate.relevanceScore || 0.5;

        // Step 4: Build match reason
        let matchReason = candidate.reasoning || candidate.generatedReasoning || '';
        if (candidate.hasInstitutionCOI) {
          matchReason += ' [Institution COI: Same institution as proposal PI]';
        }
        if (candidate.hasCoauthorCOI) {
          matchReason += ' [Coauthor COI: Has co-authored with proposal authors]';
        }

        // Step 5: Insert/update reviewer suggestion
        // Parse grantCycleId and userProfileId (may be string from request body)
        const cycleIdValue = grantCycleId ? parseInt(grantCycleId, 10) : null;
        const profileIdValue = userProfileId ? parseInt(userProfileId, 10) : null;

        await sql`
          INSERT INTO reviewer_suggestions (
            proposal_id,
            proposal_title,
            proposal_abstract,
            proposal_authors,
            proposal_institution,
            program_area,
            summary_blob_url,
            grant_cycle_id,
            user_profile_id,
            researcher_id,
            relevance_score,
            match_reason,
            sources,
            selected
          )
          VALUES (
            ${proposalId},
            ${proposalTitle || 'Untitled Proposal'},
            ${proposalAbstract || null},
            ${proposalAuthors || null},
            ${proposalInstitution || null},
            ${programArea || null},
            ${summaryBlobUrl || null},
            ${cycleIdValue},
            ${profileIdValue},
            ${researcherId},
            ${relevanceScore},
            ${matchReason},
            ${sources},
            true
          )
          ON CONFLICT (proposal_id, researcher_id)
          DO UPDATE SET
            selected = true,
            proposal_abstract = COALESCE(${proposalAbstract}, reviewer_suggestions.proposal_abstract),
            proposal_authors = COALESCE(${proposalAuthors}, reviewer_suggestions.proposal_authors),
            proposal_institution = COALESCE(${proposalInstitution}, reviewer_suggestions.proposal_institution),
            program_area = COALESCE(${programArea}, reviewer_suggestions.program_area),
            summary_blob_url = COALESCE(${summaryBlobUrl}, reviewer_suggestions.summary_blob_url),
            grant_cycle_id = COALESCE(${cycleIdValue}, reviewer_suggestions.grant_cycle_id),
            user_profile_id = COALESCE(${profileIdValue}, reviewer_suggestions.user_profile_id),
            relevance_score = ${relevanceScore},
            match_reason = ${matchReason},
            sources = ${sources},
            suggested_at = CURRENT_TIMESTAMP
        `;

        // Step 6: Save keywords/tags for the researcher
        // Add expertise areas from Claude analysis
        if (candidate.expertiseAreas && Array.isArray(candidate.expertiseAreas)) {
          for (const area of candidate.expertiseAreas) {
            if (area && area.trim()) {
              await DatabaseService.addKeywordWithRelevance(
                researcherId,
                area.trim(),
                0.9,  // High relevance - Claude identified these
                'claude'
              );
            }
          }
        }

        // Add discovery source as a tag
        const discoverySource = candidate.source || candidate.verificationSource;
        if (discoverySource && discoverySource !== 'unknown' && discoverySource !== 'claude_suggestion') {
          await DatabaseService.addKeywordWithRelevance(
            researcherId,
            `source:${discoverySource}`,
            1.0,
            discoverySource
          );
        }

        savedCount++;
      } catch (candidateError) {
        console.error(`Error saving candidate ${candidate.name}:`, candidateError.message);
        errors.push({ name: candidate.name, error: candidateError.message });
      }
    }

    return res.status(200).json({
      success: true,
      savedCount,
      totalRequested: candidates.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Save candidates error:', error);
    return res.status(500).json({
      error: 'Failed to save candidates',
      message: error.message
    });
  }
}
