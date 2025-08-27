import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const filename = searchParams.get('filename');

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    // Upload to Vercel Blob
    const blob = await put(filename, req, {
      access: 'public',
      // Add timestamp to make filename unique
      addRandomSuffix: true,
    });

    res.json({
      url: blob.url,
      downloadUrl: blob.downloadUrl,
      pathname: blob.pathname,
      size: blob.size
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '500mb', // Vercel Blob supports up to 500MB
    },
  },
};