# Entra ID (Azure AD) Integration — Summary

Purpose: concise record of what was implemented so another LLM or developer can pick up the integration and test or continue work.

Summary of work
- Added NextAuth-based Entra ID (Azure AD) authentication integration. No external libraries were newly installed — `next-auth` is already a dependency.
- Added an environment example file: `.env.local.example` (filled with required variables).
- Updated `README.md` with a short Entra ID setup section.

Key files added / modified
- `pages/api/auth/[...nextauth].js` — Main NextAuth configuration using `next-auth/providers/azure-ad`. Implements `signIn`, `jwt`, and `session` callbacks and writes/reads `user_profiles` via `@vercel/postgres` `sql` calls.
- `pages/api/auth/link-profile.js` — POST endpoint to link an Azure account to an existing profile or create a new profile. Uses `getServerSession` to verify the current session.
- `pages/api/auth/status.js` — Simple endpoint returning whether AZURE_AD_* env vars are set (used by client to decide if auth is enabled).
- `shared/components/RequireAuth.js` — Client-side auth guard: shows sign-in UI when not authenticated, shows `ProfileLinkingDialog` when first-time login needs linking.
- `shared/components/ProfileLinkingDialog.js` — UI for first-login profile linking or creation. Calls `/api/user-profiles` and `/api/auth/link-profile`.
- `lib/utils/auth.js` — Server-side helpers: `getSession`, `requireAuth`, `requireAuthWithProfile`, `optionalAuth` (wrappers around `getServerSession` and the NextAuth `authOptions`).
- `.env.local.example` — Example env variables added at project root.
- `README.md` — brief instructions added to enable Entra ID.

Environment variables required
- `NEXTAUTH_URL` (e.g. `http://localhost:3000`)
- `NEXTAUTH_SECRET` (generate: `openssl rand -base64 32`)
- `AZURE_AD_CLIENT_ID`
- `AZURE_AD_CLIENT_SECRET`
- `AZURE_AD_TENANT_ID`
- `DATABASE_URL` (if using production/postgres; the code uses `@vercel/postgres` `sql` helper)

How the auth flow works (high level)
1. Client: `RequireAuth` checks `/api/auth/status` to see if Azure AD is enabled. If enabled and user unauthenticated it shows a Sign-in card that calls `signIn('azure-ad')` from `next-auth/react`.
2. NextAuth handles the OAuth exchange with Azure AD. In `signIn` callback the server:
   - Extracts `azureId`, `azureEmail`, and `displayName`.
   - Tries to find an existing `user_profiles` row with that `azure_id`.
   - If none, tries to match by `azure_email` and link, or creates a temporary profile with `needs_linking=true` when unlinked profiles exist.
3. `jwt` callback augments token with `azureId`, `azureEmail` and looks up `user_profiles` to set `profileId`, `profileName`, `avatarColor`, and `needsLinking`.
4. `session` callback exposes those fields to the client (`session.user.profileId`, `session.user.needsLinking`, etc.).
5. If `needsLinking` is true, the client shows `ProfileLinkingDialog` which calls `/api/user-profiles?includeUnlinked=true` and `/api/auth/link-profile` to either link an existing profile or create a new one. After linking the client reloads to update the session.

Endpoints to test
- `GET /api/auth/status` — returns { enabled: true|false }
- `POST /api/auth/link-profile` — body: `{ profileId?, createNew?, azureId, azureEmail, displayName? }`
- NextAuth built-in endpoints (via `next-auth`):
  - `/api/auth/signin`
  - `/api/auth/callback/azure-ad` (handled by next-auth)
  - `/api/auth/session`

Manual local testing steps
1. Copy `.env.local.example` to `.env.local` and fill variables.
2. Ensure Azure app registration has the callback/redirect allowed origin set to `${NEXTAUTH_URL}/api/auth/callback/azure-ad` (or use provider defaults documented by `next-auth` for azure-ad).
3. Run:
   ```bash
   npm install
   npm run dev
   ```
4. Visit the app in the browser. Try accessing a page wrapped by `RequireAuth` (the home page is). Click "Sign in with Microsoft" and complete Azure login.
5. If `ProfileLinkingDialog` appears, either link an existing profile or create a new one. Confirm the session shows `session.user.profileId` and `session.user.azureEmail`.

Caveats and notes for future work
- Azure app registration: ensure the redirect URI and API permissions are set (OpenID, profile, email; `User.Read` is included in `authorization.params.scope`).
- Database access: code uses `@vercel/postgres` `sql` tagged template. Ensure `DATABASE_URL` or Vercel Postgres is configured in your environment.
- Error handling: signIn callback swallows DB errors and allows sign-in to continue — profile linking can be retried later.
- Session strategy is JWT (`session.strategy = 'jwt'`) — if you change to a DB session, update callbacks accordingly.
- If you want automated tests, add an integration test that mocks NextAuth and `@vercel/postgres` responses for sign-in and link-profile.

Where I put the files
- Added `.env.local.example` at project root.
- Added `docs/ENTRA_ID_INTEGRATION_SUMMARY.md` (this file).

Next recommended steps
- Set `.env.local` with Azure credentials and test locally (I can run `npm run dev` and exercise the flow if you provide credentials or allow me to run with your local env).
- Add unit/integration tests for `pages/api/auth/link-profile.js` and the `signIn` callback behavior.

If you want, I can also paste this exact content into a short prompt-friendly JSON or plain text format for Claude ingestion — tell me which format you prefer.
