// Generate a token for client-side direct uploads to Vercel Blob
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // For security, you could add authentication here
    // For now, we'll generate a token that allows uploads
    
    // Return the blob token from environment variables
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    
    if (!token) {
      return res.status(500).json({ error: 'Blob token not configured' });
    }

    res.json({
      token: token,
      url: 'https://blob.vercel-storage.com'
    });

  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate token: ' + error.message });
  }
}