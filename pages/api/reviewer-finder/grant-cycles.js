/**
 * API Route: /api/reviewer-finder/grant-cycles
 *
 * GET: Fetch all grant cycles (with proposal/candidate counts)
 * POST: Create a new grant cycle
 * PATCH: Update a grant cycle
 * DELETE: Archive (soft delete) a grant cycle
 */

import { sql } from '@vercel/postgres';
import { requireAuth } from '../../../lib/utils/auth';

export default async function handler(req, res) {
  // Require authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    return handlePost(req, res);
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
    const { includeArchived } = req.query;

    // Get all grant cycles with counts
    let result;
    if (includeArchived === 'true') {
      result = await sql`
        SELECT
          gc.id,
          gc.name,
          gc.short_code,
          gc.program_name,
          gc.review_deadline,
          gc.summary_pages,
          gc.review_template_blob_url,
          gc.review_template_filename,
          gc.additional_attachments,
          gc.custom_fields,
          gc.is_active,
          gc.created_at,
          gc.updated_at,
          COUNT(DISTINCT ps.id) as proposal_count,
          COUNT(DISTINCT rs.id) as candidate_count
        FROM grant_cycles gc
        LEFT JOIN proposal_searches ps ON ps.grant_cycle_id = gc.id
        LEFT JOIN reviewer_suggestions rs ON rs.grant_cycle_id = gc.id AND rs.selected = true
        GROUP BY gc.id
        ORDER BY gc.created_at DESC
      `;
    } else {
      result = await sql`
        SELECT
          gc.id,
          gc.name,
          gc.short_code,
          gc.program_name,
          gc.review_deadline,
          gc.summary_pages,
          gc.review_template_blob_url,
          gc.review_template_filename,
          gc.additional_attachments,
          gc.custom_fields,
          gc.is_active,
          gc.created_at,
          gc.updated_at,
          COUNT(DISTINCT ps.id) as proposal_count,
          COUNT(DISTINCT rs.id) as candidate_count
        FROM grant_cycles gc
        LEFT JOIN proposal_searches ps ON ps.grant_cycle_id = gc.id
        LEFT JOIN reviewer_suggestions rs ON rs.grant_cycle_id = gc.id AND rs.selected = true
        WHERE gc.is_active = true
        GROUP BY gc.id
        ORDER BY gc.created_at DESC
      `;
    }

    // Also get count of unassigned proposals/candidates
    const unassignedResult = await sql`
      SELECT
        COUNT(DISTINCT rs.proposal_id) as proposal_count,
        COUNT(DISTINCT rs.id) as candidate_count
      FROM reviewer_suggestions rs
      WHERE rs.selected = true AND rs.grant_cycle_id IS NULL
    `;

    const cycles = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      shortCode: row.short_code,
      programName: row.program_name,
      reviewDeadline: row.review_deadline,
      summaryPages: row.summary_pages,
      reviewTemplateBlobUrl: row.review_template_blob_url,
      reviewTemplateFilename: row.review_template_filename,
      additionalAttachments: row.additional_attachments,
      customFields: row.custom_fields,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      proposalCount: parseInt(row.proposal_count, 10),
      candidateCount: parseInt(row.candidate_count, 10)
    }));

    return res.status(200).json({
      success: true,
      cycles,
      unassigned: {
        proposalCount: parseInt(unassignedResult.rows[0].proposal_count, 10),
        candidateCount: parseInt(unassignedResult.rows[0].candidate_count, 10)
      }
    });
  } catch (error) {
    console.error('Get grant cycles error:', error);
    return res.status(500).json({
      error: 'Failed to fetch grant cycles',
      message: error.message
    });
  }
}

async function handlePost(req, res) {
  try {
    const {
      name,
      shortCode,
      programName,
      reviewDeadline,
      summaryPages,
      reviewTemplateBlobUrl,
      reviewTemplateFilename,
      additionalAttachments,
      customFields
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    // Check for existing cycle with same shortCode to prevent duplicates
    if (shortCode) {
      const existingCheck = await sql`
        SELECT id, name FROM grant_cycles WHERE short_code = ${shortCode} AND is_active = true
      `;
      if (existingCheck.rows.length > 0) {
        // Return the existing cycle instead of creating a duplicate
        const existing = existingCheck.rows[0];
        return res.status(200).json({
          success: true,
          cycle: { id: existing.id, name: existing.name, shortCode },
          message: 'Cycle with this shortCode already exists'
        });
      }
    }

    const result = await sql`
      INSERT INTO grant_cycles (
        name,
        short_code,
        program_name,
        review_deadline,
        summary_pages,
        review_template_blob_url,
        review_template_filename,
        additional_attachments,
        custom_fields
      ) VALUES (
        ${name},
        ${shortCode || null},
        ${programName || null},
        ${reviewDeadline || null},
        ${summaryPages || '2'},
        ${reviewTemplateBlobUrl || null},
        ${reviewTemplateFilename || null},
        ${additionalAttachments ? JSON.stringify(additionalAttachments) : null},
        ${customFields ? JSON.stringify(customFields) : null}
      )
      RETURNING *
    `;

    const row = result.rows[0];

    return res.status(201).json({
      success: true,
      cycle: {
        id: row.id,
        name: row.name,
        shortCode: row.short_code,
        programName: row.program_name,
        reviewDeadline: row.review_deadline,
        summaryPages: row.summary_pages,
        reviewTemplateBlobUrl: row.review_template_blob_url,
        reviewTemplateFilename: row.review_template_filename,
        additionalAttachments: row.additional_attachments,
        customFields: row.custom_fields,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        proposalCount: 0,
        candidateCount: 0
      }
    });
  } catch (error) {
    console.error('Create grant cycle error:', error);
    return res.status(500).json({
      error: 'Failed to create grant cycle',
      message: error.message
    });
  }
}

async function handlePatch(req, res) {
  try {
    const {
      id,
      name,
      shortCode,
      programName,
      reviewDeadline,
      summaryPages,
      reviewTemplateBlobUrl,
      reviewTemplateFilename,
      additionalAttachments,
      customFields,
      isActive
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    // Build dynamic update
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name');
      values.push(name);
    }
    if (shortCode !== undefined) {
      updates.push('short_code');
      values.push(shortCode);
    }
    if (programName !== undefined) {
      updates.push('program_name');
      values.push(programName);
    }
    if (reviewDeadline !== undefined) {
      updates.push('review_deadline');
      values.push(reviewDeadline || null);
    }
    if (summaryPages !== undefined) {
      updates.push('summary_pages');
      values.push(summaryPages);
    }
    if (reviewTemplateBlobUrl !== undefined) {
      updates.push('review_template_blob_url');
      values.push(reviewTemplateBlobUrl || null);
    }
    if (reviewTemplateFilename !== undefined) {
      updates.push('review_template_filename');
      values.push(reviewTemplateFilename || null);
    }
    if (additionalAttachments !== undefined) {
      updates.push('additional_attachments');
      values.push(additionalAttachments ? JSON.stringify(additionalAttachments) : null);
    }
    if (customFields !== undefined) {
      updates.push('custom_fields');
      values.push(customFields ? JSON.stringify(customFields) : null);
    }
    if (isActive !== undefined) {
      updates.push('is_active');
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Update each field individually (Vercel Postgres doesn't support dynamic column names easily)
    for (let i = 0; i < updates.length; i++) {
      const column = updates[i];
      const value = values[i];

      // Using raw query for dynamic column updates
      await sql.query(
        `UPDATE grant_cycles SET ${column} = $1, updated_at = NOW() WHERE id = $2`,
        [value, id]
      );
    }

    // Fetch updated record
    const result = await sql`
      SELECT * FROM grant_cycles WHERE id = ${id}
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Grant cycle not found' });
    }

    const row = result.rows[0];

    return res.status(200).json({
      success: true,
      cycle: {
        id: row.id,
        name: row.name,
        shortCode: row.short_code,
        programName: row.program_name,
        reviewDeadline: row.review_deadline,
        summaryPages: row.summary_pages,
        reviewTemplateBlobUrl: row.review_template_blob_url,
        reviewTemplateFilename: row.review_template_filename,
        additionalAttachments: row.additional_attachments,
        customFields: row.custom_fields,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (error) {
    console.error('Update grant cycle error:', error);
    return res.status(500).json({
      error: 'Failed to update grant cycle',
      message: error.message
    });
  }
}

async function handleDelete(req, res) {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    // Soft delete: set is_active = false
    await sql`
      UPDATE grant_cycles
      SET is_active = false, updated_at = NOW()
      WHERE id = ${id}
    `;

    return res.status(200).json({
      success: true,
      message: 'Grant cycle archived'
    });
  } catch (error) {
    console.error('Archive grant cycle error:', error);
    return res.status(500).json({
      error: 'Failed to archive grant cycle',
      message: error.message
    });
  }
}
