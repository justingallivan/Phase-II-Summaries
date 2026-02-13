/**
 * Wrap a Vercel Blob URL with the authenticated proxy endpoint.
 * Non-blob URLs and falsy values pass through unchanged.
 */
export function proxifyBlobUrl(url) {
  if (!url || !url.includes('blob.vercel-storage.com')) return url;
  return `/api/blob-proxy?url=${encodeURIComponent(url)}`;
}
