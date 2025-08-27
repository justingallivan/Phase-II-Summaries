import { put } from '@vercel/blob';
import multer from 'multer';
import { promisify } from 'util';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for Vercel Blob
  },
});

const uploadMiddleware = promisify(upload.single('file'));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Handle file upload with multer
    await uploadMiddleware(req, res);
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filename = req.file.originalname;
    
    // Upload to Vercel Blob
    const blob = await put(filename, req.file.buffer, {
      access: 'public',
      addRandomSuffix: true,
    });

    res.json({
      url: blob.url,
      downloadUrl: blob.downloadUrl,
      pathname: blob.pathname,
      size: blob.size,
      originalName: filename
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 500MB.' });
    }
    
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
}

export const config = {
  api: {
    bodyParser: false, // Disable Next.js body parser for multer
  },
};