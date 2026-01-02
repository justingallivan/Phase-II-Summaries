/**
 * API Route: /api/reviewer-finder/save-candidates
 *
 * Saves selected candidates to the database for a proposal.
 * Creates researcher records if they don't exist, then links them
 * to the proposal via the reviewer_suggestions table.
 */

import { sql } from '@vercel/postgres';
import { DatabaseService } from '../../../lib/services/database-service';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { proposalId, proposalTitle, proposalAbstract, proposalAuthors, proposalInstitution, candidates } = req.body;

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

        // Extract email and website from candidate or contactEnrichment
        const candidateEmail = candidate.email || candidate.contactEnrichment?.email || null;
        const candidateWebsite = candidate.website || candidate.contactEnrichment?.website || null;

        // Check if researcher exists
        let researcherResult = await sql`
          SELECT id FROM researchers
          WHERE normalized_name = ${normalizedName}
          LIMIT 1
        `;

        let researcherId;

        if (researcherResult.rows.length > 0) {
          researcherId = researcherResult.rows[0].id;

          // Update email/website if we have new info
          if (candidateEmail || candidateWebsite) {
            await sql`
              UPDATE researchers
              SET
                email = COALESCE(${candidateEmail}, email),
                website = COALESCE(${candidateWebsite}, website),
                last_updated = CURRENT_TIMESTAMP
              WHERE id = ${researcherId}
            `;
          }
        } else {
          // Create new researcher with email/website
          const insertResult = await sql`
            INSERT INTO researchers (
              name,
              normalized_name,
              primary_affiliation,
              email,
              website,
              h_index,
              total_citations
            )
            VALUES (
              ${candidate.name},
              ${normalizedName},
              ${candidate.affiliation || null},
              ${candidateEmail},
              ${candidateWebsite},
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
        await sql`
          INSERT INTO reviewer_suggestions (
            proposal_id,
            proposal_title,
            proposal_abstract,
            proposal_authors,
            proposal_institution,
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
