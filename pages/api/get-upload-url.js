// This endpoint generates a presigned URL for direct upload to Vercel Blob
import { getUploadUrl } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filename } = req.body;

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    // Generate upload URL for client-side upload
    const { url, fields } = await getUploadUrl(filename, {
      access: 'public',
      addRandomSuffix: true,
    });

    res.json({
      uploadUrl: url,
      fields: fields,
      filename: filename
    });

  } catch (error) {
    console.error('Get upload URL error:', error);
    res.status(500).json({ error: 'Failed to get upload URL: ' + error.message });
  }
}