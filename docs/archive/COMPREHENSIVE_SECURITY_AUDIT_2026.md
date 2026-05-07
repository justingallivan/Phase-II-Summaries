# Comprehensive Security & Privacy Audit Report (March 2026)

**Auditor:** Gemini CLI (Security Consultant Role)
**Scope:** Authentication, Session Management, Data Privacy, and AI Data Flow.

---

## Executive Summary
The suite of applications demonstrates a mature, security-conscious architecture, particularly in its transition to a "Fail-Closed" model for CRM data access. However, the audit has identified six (6) specific findings that create potential friction with IT compliance standards—primarily related to session revocation latency, CSRF fail-open patterns, and the external transmission of raw proposal text (PII/IP).

---

## 1. Authentication & Identity Boundary

### [SEC-AUTH-001] - Session Revocation Latency (Severity: Medium)
- **Verified Location:** `lib/utils/auth.js` (Lines 226–227, 276–300)
- **Finding:** User access status (`is_active`) and app-level grants are cached for **2 minutes**. If an account is disabled in the database, the user maintains full system access until the cache expires.
- **IT Rationale:** "The application currently has a 2-minute window of vulnerability during account offboarding. Standard security posture for Entra ID integrations requires near-instantaneous revocation."

### [SEC-AUTH-002] - CSRF Fail-Open on Missing Headers (Severity: Low)
- **Verified Location:** `lib/utils/auth.js` (Lines 64–67)
- **Finding:** The CSRF validator allows state-changing requests (POST/PUT/DELETE) to proceed if both `Origin` and `Referer` headers are missing.
- **IT Rationale:** "The implementation assumes missing headers imply a trusted non-browser client (e.g., a cron job). However, this creates a potential bypass vector. Standard posture requires an explicit 'Allowlist' for non-browser clients or a secondary anti-CSRF token."

### [SEC-AUTH-003] - Profile Hijacking via Email Reuse (Severity: Medium)
- **Verified Location:** `pages/api/auth/[...nextauth].js` (Lines 83–94)
- **Finding:** The system automatically links Entra ID users to existing profiles based solely on a matching `azure_email`.
- **IT Rationale:** "The system uses **Email-as-Identity** for linking. If an email is re-assigned in Entra ID, a new user could automatically inherit the profile history of a previous employee. A multi-factor linking step (e.g., an invitation token) is recommended."

### [SEC-AUTH-004] - Fail-Open on Identity Database Error (Severity: Medium)
- **Verified Location:** `pages/api/auth/[...nextauth].js` (Lines 144–150)
- **Finding:** If the database lookup fails during the sign-in callback, the user is still allowed to sign in without a linked profile.
- **IT Rationale:** "The authentication flow employs a 'Fail-Open' strategy for database errors. High-security environments require blocking sign-in if local authorization checks cannot be verified."

---

## 2. Data Privacy & AI Data Flow

### [SEC-DATA-001] - Exposure of Raw Proposal Text to External AI (Severity: High)
- **Verified Location:** `shared/config/prompts/reviewer-finder.js` (Lines 16–20)
- **Finding:** The system transmits up to 100,000 characters of raw research proposals to Anthropic's Claude API without automated PII or IP scrubbing.
- **IT Rationale:** "Non-public research and investigator PII are transmitted to an external provider. This creates a data sovereignty risk. Implementing a local 'Scrubbing' layer or a 'Data Minimization' step (e.g., summary-only analysis) would mitigate this risk."

### [SEC-DATA-002] - Verbose Data Transmission in Agentic Loops (Severity: Medium)
- **Verified Location:** `pages/api/dynamics-explorer/chat.js` (Lines 132–170)
- **Finding:** The Dynamics Explorer chat loop maintains a high-fidelity history of CRM records in the Claude session, transmitting verbose JSON payloads of retrieved records.
- **IT Rationale:** "To minimize the data footprint shared with external AI, the application should implement more aggressive 'Field Masking'—sending only the fields Claude explicitly needs for the current reasoning step rather than the full record."

---

## 3. Strategic Recommendations for IT Approval

To secure the necessary Azure permissions and restore full access, the project team should present the following "Hardening Roadmap":

1. **Reduce Authorization Latency:** Lower the `APP_ACCESS_TTL_MS` to 30 seconds or implement a cache-invalidation hook.
2. **Harden CSRF Perimeter:** Require a valid `Origin` header for all browser-initiated POST requests.
3. **Identity Verification:** Move away from automatic email-based linking. Implement an "Admin Confirmation" or "Invite Token" step for first-time profile connections.
4. **Data Minimization Service:** Implement a client-side (or server-side proxy) scrubbing layer that replaces specific PII patterns with placeholders before sending data to Claude.
5. **Least Privilege Service Principal:** (As previously proposed) Scope the Azure App Registration to specific SharePoint sites (`Sites.Selected`) and specific Dynamics tables.

---
*Report generated via direct codebase inspection by Gemini CLI.*
