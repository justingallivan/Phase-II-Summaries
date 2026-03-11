# Code Review Findings

Date: March 10, 2026

## Finding 1

**[P2] user-profiles still exposes the full profile directory to any authenticated user**

File: [pages/api/user-profiles.js](/Users/gallivan/Programming/Phase-II-Summaries/pages/api/user-profiles.js):15

`GET /api/user-profiles` only requires basic authentication, then returns every active profile. The underlying mapper includes `azureId`, `azureEmail`, and `needsLinking`, so any signed-in user can enumerate other users’ profile metadata and linkage state, or fetch a specific profile by ID. The profile-linking UI is still depending on client-side filtering, so this broader exposure remains reachable in-product. This endpoint should either be scoped to the caller/admins or return a much narrower projection for linking.
