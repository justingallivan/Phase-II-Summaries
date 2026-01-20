# Create Phase II Writeup Draft

A Next.js application that automatically generates standardized writeup drafts from PDF research proposals using Claude AI.
- Institution-based filename generation
- Structured data extraction
- Markdown and JSON export

## Setup Instructions

1. Create a new repository on GitHub
2. Upload all these files to the repository
3. Connect the repository to Vercel
4. Add your Claude API key as an environment variable
5. Deploy!


Add this to your Vercel environment variables:
- `CLAUDE_API_KEY` (optional - users can also enter it in the UI)

## Usage

1. Upload PDF research proposals
2. Enter your Claude API key when prompted
3. Click "Process Proposals"
4. Download formatted writeup drafts and structured data

## Deployment

To enable single sign-on with Microsoft Entra ID (Azure AD) the app uses NextAuth.js with the Azure AD provider.

1. Register an app in the Azure Portal and obtain `clientId`, `clientSecret`, and `tenantId`.
2. Copy `.env.local.example` to `.env.local` and fill in the values.
3. Set `NEXTAUTH_URL` and `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`).
4. Start the app with `npm run dev` and visit the site — sign-in will appear where required.

Files and endpoints:
- `pages/api/auth/[...nextauth].js` — NextAuth route configured for Azure AD
- `shared/components/RequireAuth.js` — Client-side auth guard
- `pages/api/auth/link-profile.js` — Link Azure account to an existing profile

If you deploy to Vercel, add the environment variables in the project settings.
This app is designed for deployment on Vercel with zero configuration needed.
