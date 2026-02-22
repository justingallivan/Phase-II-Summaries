import { handleUpload } from '@vercel/blob/client';
import { requireAuth } from '../../lib/utils/auth';
import { BASE_CONFIG } from '../../shared/config/baseConfig';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Validate file types and size
        return {
          allowedContentTypes: [
            'application/pdf',
            'text/plain',
            'text/markdown',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/png',
            'image/jpg',
            'image/jpeg'
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 50 * 1024 * 1024, // 50MB limit
          tokenPayload: JSON.stringify({
            uploadedAt: new Date().toISOString(),
            userId: 'anonymous' // Could be expanded for user authentication
          })
        };
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('Blob upload handler error:', error);
    return res.status(400).json({
      error: BASE_CONFIG.ERROR_MESSAGES.UPLOAD_FAILED,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb', // Only for the upload token request, not the actual file
    },
  },
};