# Security Hardening Proposal (March 2026)

This report identifies four high-impact security improvements based on a direct audit of the codebase. Implementing these changes will move the suite toward a "Zero Trust" architecture and provide the specific technical assurances typically required by IT Security teams.

---

## 1. Decommission Legacy Upload Endpoint (Highest Priority)

**File:** `pages/api/upload-file.js` (Entire file)  
**File:** `shared/components/SettingsModal.js` (Lines 373, 419)

### The Issue
The application currently maintains two upload paths. While `upload-handler.js` is secure, the legacy `upload-file.js` endpoint is still active and used by the `SettingsModal`. This legacy endpoint has **no file size limits**, **no mime-type restrictions**, and uploads files with **`access: 'public'`**.

### The Fix
1. Migrate `SettingsModal.js` to use the token-based `upload-handler.js` flow.
2. **Delete `pages/api/upload-file.js`** to eliminate the "weakest link" in your file ingest pipeline.

---

## 2. Tighten Content Security Policy (CSP)

**File:** `middleware.js` (Line 60)

### The Issue
Current production `connect-src` includes:
```javascript
// Line 60
: `'self' https://*.public.blob.vercel-storage.com https://vercel.com https://*.vercel-insights.com`;
```

### The Fix
Since you have successfully implemented the authenticated `/api/blob-proxy`, the browser no longer needs to connect directly to Vercel's public blob domain. 
**Change:** Remove `https://*.public.blob.vercel-storage.com` from the production `connect-src`. This ensures that even if a malicious script were injected, it could not exfiltrate data directly to public blob storage.

---

## 3. Standardize Egress via `safeFetch`

**Files:** `lib/services/*.js`, `pages/api/**/*.js` (66 occurrences of global `fetch`)

### The Issue
There is a fragmented SSRF strategy. While some routes use `safeFetch`, many core services (including `DynamicsService`, `GraphService`, and `health-checker.js`) still use the global `fetch`.

### The Fix
Migrate all server-side `fetch` calls to the centralized `safeFetch` utility.
**Example (lib/services/health-checker.js):**
- **Current (L40):** `await fetch('https://api.anthropic.com/v1/messages', ...)`
- **Proposed:** `await safeFetch('https://api.anthropic.com/v1/messages', ...)`
This proves to IT that you have a "Single Point of Truth" for all outbound traffic and consistent host-allowlist enforcement.

---

## 4. Implement Upload Attribution (Audit Trail)

**File:** `pages/api/upload-handler.js` (Line 37)

### The Issue
The current secure upload handler hardcodes the uploader's identity:
```javascript
// Line 37
userId: 'anonymous' // Could be expanded for user authentication
```

### The Fix
Replace `'anonymous'` with `session.user.email` or `session.profileId` (derived from the authenticated session at Line 13). 
**Benefit:** This provides the "Who, When, and What" audit trail that IT departments require for data sovereignty and incident response.

---

## Summary for IT
By implementing these changes, we can demonstrate to IT that:
1. We have eliminated all "unconstrained" upload paths.
2. Our browser-level security (CSP) is "Locked Down" to only our own authenticated proxy.
3. Every single byte of data leaving our server is validated against a central security allowlist (`safeFetch`).
4. Every file uploaded is cryptographically tied to a specific, authenticated user identity.
