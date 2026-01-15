/**
 * API Route: /api/reviewer-finder/my-candidates
 *
 * GET: Fetch all saved candidates grouped by proposal
 * PATCH: Update candidate status (invited, accepted, notes)
 * DELETE: Remove a saved candidate
 */

import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'PATCH') {
    return handlePatch(req, res);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req, res) {
  try {
    // Get all saved candidates with researcher details, grouped by proposal
    const result = await sql`
      SELECT
        rs.id as suggestion_id,
        rs.proposal_id,
        rs.proposal_title,
        rs.proposal_abstract,
        rs.proposal_authors,
        rs.proposal_institution,
        rs.summary_blob_url,
        rs.relevance_score,
        rs.match_reason,
        rs.sources,
        rs.selected,
        rs.invited,
        rs.accepted,
        rs.notes,
        rs.suggested_at,
        r.id as researcher_id,
        r.name,
        r.primary_affiliation as affiliation,
        r.email,
        r.website,
        r.h_index,
        r.total_citations
      FROM reviewer_suggestions rs
      JOIN researchers r ON rs.researcher_id = r.id
      WHERE rs.selected = true
      ORDER BY rs.suggested_at DESC
    `;

    // Group by proposal
    const proposals = {};
    for (const row of result.rows) {
      if (!proposals[row.proposal_id]) {
        proposals[row.proposal_id] = {
          proposalId: row.proposal_id,
          proposalTitle: row.proposal_title,
          proposalAbstract: row.proposal_abstract,
          proposalAuthors: row.proposal_authors,
          proposalInstitution: row.proposal_institution,
          summaryBlobUrl: row.summary_blob_url,
          candidates: []
        };
      }
      proposals[row.proposal_id].candidates.push({
        suggestionId: row.suggestion_id,
        researcherId: row.researcher_id,
        name: row.name,
        affiliation: row.affiliation,
        email: row.email,
        website: row.website,
        hIndex: row.h_index,
        totalCitations: row.total_citations,
        relevanceScore: row.relevance_score,
        reasoning: row.match_reason,
        sources: row.sources,
        invited: row.invited,
        accepted: row.accepted,
        notes: row.notes,
        savedAt: row.suggested_at
      });
    }

    return res.status(200).json({
      success: true,
      proposals: Object.values(proposals),
      totalCandidates: result.rows.length
    });
  } catch (error) {
    console.error('Get my candidates error:', error);
    return res.status(500).json({
      error: 'Failed to fetch candidates',
      message: error.message
    });
  }
}

async function handlePatch(req, res) {
  try {
    const {
      suggestionId,
      // Suggestion fields (existing)
      invited,
      accepted,
      notes,
      // Researcher fields (new)
      name,
      affiliation,
      email,
      website,
      hIndex
    } = req.body;

    if (!suggestionId) {
      return res.status(400).json({ error: 'suggestionId is required' });
    }

    // Check if we have any researcher fields to update
    const hasResearcherFields = name !== undefined || affiliation !== undefined ||
      email !== undefined || website !== undefined || hIndex !== undefined;

    // Check if we have any suggestion fields to update
    const hasSuggestionFields = invited !== undefined || accepted !== undefined || notes !== undefined;

    if (!hasResearcherFields && !hasSuggestionFields) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    let researcherId = null;

    // If updating researcher fields, get the researcherId first
    if (hasResearcherFields) {
      const suggestionResult = await sql`
        SELECT researcher_id FROM reviewer_suggestions WHERE id = ${suggestionId}
      `;

      if (suggestionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Suggestion not found' });
      }

      researcherId = suggestionResult.rows[0].researcher_id;

      // Update researcher fields
      if (name !== undefined) {
        await sql`
          UPDATE researchers
          SET name = ${name}, normalized_name = ${name.toLowerCase()}
          WHERE id = ${researcherId}
        `;
      }
      if (affiliation !== undefined) {
        await sql`
          UPDATE researchers
          SET primary_affiliation = ${affiliation}
          WHERE id = ${researcherId}
        `;
      }
      if (email !== undefined) {
        // When email is manually edited, track the source as 'manual'
        await sql`
          UPDATE researchers
          SET email = ${email || null},
              email_source = 'manual',
              contact_enriched_at = NOW()
          WHERE id = ${researcherId}
        `;
      }
      if (website !== undefined) {
        await sql`
          UPDATE researchers
          SET website = ${website || null}
          WHERE id = ${researcherId}
        `;
      }
      if (hIndex !== undefined) {
        await sql`
          UPDATE researchers
          SET h_index = ${hIndex}
          WHERE id = ${researcherId}
        `;
      }
    }

    // Update suggestion fields (existing logic)
    if (invited !== undefined) {
      await sql`
        UPDATE reviewer_suggestions
        SET invited = ${invited}
        WHERE id = ${suggestionId}
      `;
    }
    if (accepted !== undefined) {
      await sql`
        UPDATE reviewer_suggestions
        SET accepted = ${accepted}
        WHERE id = ${suggestionId}
      `;
    }
    if (notes !== undefined) {
      await sql`
        UPDATE reviewer_suggestions
        SET notes = ${notes}
        WHERE id = ${suggestionId}
      `;
    }

    return res.status(200).json({
      success: true,
      message: 'Candidate updated',
      updated: {
        suggestionId,
        researcherId,
        fields: {
          ...(name !== undefined && { name }),
          ...(affiliation !== undefined && { affiliation }),
          ...(email !== undefined && { email }),
          ...(website !== undefined && { website }),
          ...(hIndex !== undefined && { hIndex }),
          ...(invited !== undefined && { invited }),
          ...(accepted !== undefined && { accepted }),
          ...(notes !== undefined && { notes })
        }
      }
    });
  } catch (error) {
    console.error('Update candidate error:', error);
    return res.status(500).json({
      error: 'Failed to update candidate',
      message: error.message
    });
  }
}

async function handleDelete(req, res) {
  try {
    const { suggestionId } = req.body;

    if (!suggestionId) {
      return res.status(400).json({ error: 'suggestionId is required' });
    }

    // Mark as not selected (soft delete) rather than hard delete
    await sql`
      UPDATE reviewer_suggestions
      SET selected = false
      WHERE id = ${suggestionId}
    `;

    return res.status(200).json({
      success: true,
      message: 'Candidate removed'
    });
  } catch (error) {
    console.error('Delete candidate error:', error);
    return res.status(500).json({
      error: 'Failed to remove candidate',
      message: error.message
    });
  }
}
