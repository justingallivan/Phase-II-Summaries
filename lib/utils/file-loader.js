/**
 * Shared document loader for FileRef objects used across multiple Dynamics-
 * integrated apps (Grant Reporting, Phase I Summary with writeback, etc.).
 *
 * FileRef shapes:
 *   { source: "upload",     fileUrl, filename }
 *   { source: "sharepoint", library, folder, filename }
 *
 * Throws HTTP-tagged errors (err.status) on validation / parse failure so
 * API handlers can surface them cleanly.
 */

import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { safeFetch } from './safe-fetch.js';
import { GraphService } from '../services/graph-service.js';
import { BASE_CONFIG } from '../../shared/config/baseConfig.js';

const MAX_TEXT_LENGTH = BASE_CONFIG?.FILE_PROCESSING?.MAX_TEXT_LENGTH || 1_000_000;

export async function loadFile(ref) {
  if (!ref || typeof ref !== 'object') {
    throw httpError(400, 'Invalid file reference');
  }

  let buffer;
  let filename;
  let mimeType = null;

  if (ref.source === 'upload') {
    if (!ref.fileUrl || !ref.filename) {
      throw httpError(400, 'Upload file reference requires fileUrl and filename');
    }
    const resp = await safeFetch(ref.fileUrl);
    if (!resp.ok) {
      throw httpError(400, `Failed to fetch uploaded file: ${resp.status}`);
    }
    buffer = Buffer.from(await resp.arrayBuffer());
    filename = ref.filename;
  } else if (ref.source === 'sharepoint') {
    if (!ref.library || !ref.folder || !ref.filename) {
      throw httpError(400, 'SharePoint file reference requires library, folder, and filename');
    }
    const downloaded = await GraphService.downloadFileByPath(ref.library, ref.folder, ref.filename);
    buffer = downloaded.buffer;
    filename = downloaded.filename || ref.filename;
    mimeType = downloaded.mimeType;
  } else {
    throw httpError(400, `Unknown file source: ${ref.source}`);
  }

  const text = await extractTextFromBuffer(buffer, filename, mimeType);

  if (!text || text.trim().length < 100) {
    throw httpError(400, `${filename}: file appears to be empty or contains insufficient text`);
  }

  if (text.length > MAX_TEXT_LENGTH) {
    throw httpError(
      413,
      `${filename}: extracted text exceeds maximum size (${text.length} > ${MAX_TEXT_LENGTH} chars)`,
    );
  }

  return { text: text.trim(), filename };
}

export async function extractTextFromBuffer(buffer, filename, mimeType) {
  const lower = (filename || '').toLowerCase();
  const isPdf = lower.endsWith('.pdf') || mimeType === 'application/pdf';
  const isDocx =
    lower.endsWith('.docx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isDoc = lower.endsWith('.doc') || mimeType === 'application/msword';

  if (isPdf) {
    const data = await pdf(buffer);
    return data.text || '';
  }
  if (isDocx || isDoc) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }
  throw httpError(400, `Unsupported file type for "${filename}". Use PDF, DOCX, or DOC.`);
}

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
