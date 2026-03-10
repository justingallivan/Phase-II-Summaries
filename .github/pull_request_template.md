## Changes

<!-- Brief description of changes -->

## Security Checklist (for API route changes)

If this PR adds or modifies API routes, confirm:

- [ ] Auth required (`requireAppAccess` or `requireAuthWithProfile`)
- [ ] Cross-user access blocked (queries scoped by `profileId` from session)
- [ ] SSRF considered (outbound fetch uses `safeFetch` or validates URLs)
- [ ] Output redaction considered (no tokens/secrets in responses or logs)
- [ ] Logging reviewed (no sensitive data in console output)

<!-- Delete this section if no API changes -->
