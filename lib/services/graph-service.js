/**
 * Microsoft Graph Service
 *
 * Handles authentication and operations against the Microsoft Graph API,
 * primarily for SharePoint document access.
 *
 * Auth: Client credentials flow using the same Azure AD app registration
 * as Dynamics (DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET)
 * but with a different scope (https://graph.microsoft.com/.default).
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const API_TIMEOUT = 30_000;
const DOWNLOAD_TIMEOUT = 60_000;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Default SharePoint site URL (confirmed via testing)
const DEFAULT_SITE_URL = 'https://appriver3651007194.sharepoint.com/sites/akoyaGO';

// Separate token cache from Dynamics (different scope)
let tokenCache = { token: null, expiresAt: 0 };
const siteCache = { siteId: null, fetchedAt: 0 };
const driveCache = new Map(); // libraryName → { driveId, fetchedAt }

export class GraphService {
  // ───────── Auth ─────────

  static async getAccessToken() {
    const now = Date.now();
    if (tokenCache.token && tokenCache.expiresAt > now + 60_000) {
      return tokenCache.token;
    }

    const { DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET } = process.env;
    if (!DYNAMICS_TENANT_ID || !DYNAMICS_CLIENT_ID || !DYNAMICS_CLIENT_SECRET) {
      throw new Error('Missing Azure AD credentials for Graph API (DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET)');
    }

    const tokenUrl = `https://login.microsoftonline.com/${DYNAMICS_TENANT_ID}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: DYNAMICS_CLIENT_ID,
      client_secret: DYNAMICS_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    });

    const resp = await fetchWithTimeout(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }, API_TIMEOUT);

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Graph token request failed (${resp.status}): ${text}`);
    }

    const data = await resp.json();
    tokenCache = {
      token: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };
    return data.access_token;
  }

  static buildHeaders(token) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
  }

  // ───────── Site Resolution ─────────

  /**
   * Resolve the SharePoint site to its Graph API site ID.
   * Uses SHAREPOINT_SITE_URL env var or the known default.
   */
  static async getSiteId() {
    const now = Date.now();
    if (siteCache.siteId && now - siteCache.fetchedAt < CACHE_TTL) {
      return siteCache.siteId;
    }

    const siteUrl = process.env.SHAREPOINT_SITE_URL || DEFAULT_SITE_URL;
    const url = new URL(siteUrl);
    const graphUrl = `${GRAPH_BASE}/sites/${url.host}:${url.pathname}`;

    const token = await this.getAccessToken();
    const resp = await fetchWithTimeout(graphUrl, {
      headers: this.buildHeaders(token),
    }, API_TIMEOUT);

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to resolve SharePoint site (${resp.status}): ${text}`);
    }

    const data = await resp.json();
    siteCache.siteId = data.id;
    siteCache.fetchedAt = now;
    return data.id;
  }

  // ───────── Drive Resolution ─────────

  /**
   * Get the drive ID for a document library by name.
   * Each SharePoint document library is a separate "drive" in Graph API.
   */
  static async getDriveId(libraryName) {
    const now = Date.now();
    const cached = driveCache.get(libraryName);
    if (cached && now - cached.fetchedAt < CACHE_TTL) {
      return cached.driveId;
    }

    const siteId = await this.getSiteId();
    const token = await this.getAccessToken();
    const resp = await fetchWithTimeout(
      `${GRAPH_BASE}/sites/${siteId}/drives`,
      { headers: this.buildHeaders(token) },
      API_TIMEOUT,
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to list SharePoint drives (${resp.status}): ${text}`);
    }

    const data = await resp.json();
    const drives = data.value || [];

    // Match by name (case-insensitive)
    const drive = drives.find(d =>
      d.name.toLowerCase() === libraryName.toLowerCase()
    );

    if (!drive) {
      const available = drives.map(d => d.name).join(', ');
      throw new Error(`Document library "${libraryName}" not found. Available: ${available}`);
    }

    driveCache.set(libraryName, { driveId: drive.id, fetchedAt: now });
    return drive.id;
  }

  // ───────── File Operations ─────────

  /**
   * List files in a folder within a document library.
   * @param {string} libraryName - Document library name (e.g. "akoya_request")
   * @param {string} folderPath - Folder path within the library
   * @returns {Array<{name, size, lastModified, mimeType, webUrl, id}>}
   */
  static async listFiles(libraryName, folderPath) {
    const driveId = await this.getDriveId(libraryName);
    const token = await this.getAccessToken();

    const encodedPath = folderPath.split('/').map(encodeURIComponent).join('/');
    const url = `${GRAPH_BASE}/drives/${driveId}/root:/${encodedPath}:/children?$select=name,size,lastModifiedDateTime,file,webUrl,id`;

    const resp = await fetchWithTimeout(url, {
      headers: this.buildHeaders(token),
    }, API_TIMEOUT);

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to list files in ${libraryName}/${folderPath} (${resp.status}): ${text}`);
    }

    const data = await resp.json();
    return (data.value || []).map(item => ({
      name: item.name,
      size: item.size,
      lastModified: item.lastModifiedDateTime,
      mimeType: item.file?.mimeType || null,
      webUrl: item.webUrl,
      id: item.id,
    }));
  }

  /**
   * Download file content by drive ID and item ID.
   * @returns {{ buffer: Buffer, mimeType: string, filename: string, size: number }}
   */
  static async downloadFile(driveId, itemId) {
    const token = await this.getAccessToken();

    // Get metadata for filename and mime type
    const metaResp = await fetchWithTimeout(
      `${GRAPH_BASE}/drives/${driveId}/items/${itemId}?$select=name,file,size`,
      { headers: this.buildHeaders(token) },
      API_TIMEOUT,
    );

    if (!metaResp.ok) {
      const text = await metaResp.text();
      throw new Error(`Failed to get file metadata (${metaResp.status}): ${text}`);
    }

    const meta = await metaResp.json();

    // Download content (Graph returns a 302 redirect to the actual content)
    const contentResp = await fetchWithTimeout(
      `${GRAPH_BASE}/drives/${driveId}/items/${itemId}/content`,
      { headers: this.buildHeaders(token), redirect: 'follow' },
      DOWNLOAD_TIMEOUT,
    );

    if (!contentResp.ok) {
      throw new Error(`Failed to download file (${contentResp.status})`);
    }

    const buffer = Buffer.from(await contentResp.arrayBuffer());
    return {
      buffer,
      mimeType: meta.file?.mimeType || 'application/octet-stream',
      filename: meta.name,
      size: meta.size,
    };
  }

  /**
   * Download a file by library name, folder path, and filename.
   * Resolves the path to a drive item and downloads it.
   */
  static async downloadFileByPath(libraryName, folderPath, filename) {
    const driveId = await this.getDriveId(libraryName);
    const token = await this.getAccessToken();

    const encodedPath = [...folderPath.split('/'), filename].map(encodeURIComponent).join('/');
    const url = `${GRAPH_BASE}/drives/${driveId}/root:/${encodedPath}`;

    // Get item metadata (includes ID)
    const resp = await fetchWithTimeout(url + '?$select=id,name,file,size', {
      headers: this.buildHeaders(token),
    }, API_TIMEOUT);

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`File not found: ${filename} (${resp.status}): ${text}`);
    }

    const item = await resp.json();
    return this.downloadFile(driveId, item.id);
  }

  // ───────── Cache Management ─────────

  static clearCaches() {
    tokenCache = { token: null, expiresAt: 0 };
    siteCache.siteId = null;
    siteCache.fetchedAt = 0;
    driveCache.clear();
  }
}

// ───────── Private Helpers ─────────

async function fetchWithTimeout(url, options, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Graph API request timed out after ${timeout / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
