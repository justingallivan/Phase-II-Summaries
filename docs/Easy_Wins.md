**Easy Wins**

- Add authorization regression tests for every profile-scoped and app-scoped API route.
- Shorten session lifetime and add idle timeout for sensitive areas.
- Add gitleaks to CI for secret scanning.
- Add trivy or osv-scanner to CI for dependency CVEs.
- Add npm audit only as secondary signal, not the main gate.
- Standardize outbound fetch through a small wrapper with allowlisted hosts.
- Add tests that verify CSP/auth middleware behavior on key routes.
- Add a lightweight security checklist to PRs for new API routes:
  - auth required
  - cross-user access blocked
  - SSRF considered
  - output redaction considered
  - logging reviewed

**Medium Effort**

- Add integration tests that simulate user A attempting to read/write user B’s records.
- Add CodeQL analysis in GitHub Actions.
- Add ZAP scanning against preview deployments or staging.
- Centralize sensitive response shaping so tokens/secrets/headers cannot be accidentally serialized.
- Add structured audit logging for sensitive admin actions and data exports.
- Review all SSE and file download endpoints for data egress controls.
- Add per-route rate-limit review, especially for expensive or data-rich endpoints.
- Generate an SBOM with syft and scan it with grype or trivy.

**IT-Dependent / Architectural**

- Split SSO and service-principal app registrations.
- Move SharePoint access to Sites.Selected if not already complete.
- Re-review Dynamics service principal roles for least privilege.
- Consider certificate-based auth or workload identity instead of long-lived client secrets.
- Review Vercel/project logging, telemetry, preview envs, and any reverse proxies for header/body capture.
- Apply Conditional Access / workload identity restrictions where possible.
- Review whether especially sensitive data paths should be protected below the app layer too, not only by app logic.

**What To Use**

- semgrep for custom app-specific rules.
- gitleaks for secrets.
- trivy or osv-scanner for dependency and SBOM vuln scanning.
- CodeQL for deeper dataflow/static analysis.
- ZAP for dynamic scanning.
- syft + grype if you want explicit SBOM workflows.

**Suggested Order**

1. Authorization integration tests.

2. gitleaks + trivy/osv-scanner in CI.

3. CodeQL.

4. Fetch allowlist wrapper + SSRF review.

5. Session hardening.

6. Split registrations and least-privilege review with IT.

7. ZAP against deploy previews/staging.

   