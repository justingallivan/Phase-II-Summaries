---
name: project-irs-exempt-verification
description: "Planned IRS tax-exempt status verification — Postgres-resident reference data, queried by PowerAutomate via Vercel endpoint, verified result written back to Dynamics account row"
metadata: 
  node_type: memory
  type: project
  originSessionId: e2f71cb4-b29c-4510-b8fe-1da4a49ec6ee
---

Need to verify tax-exempt status of applicant institutions. IRS publishes ~3 CSVs (~100 MB each — likely Pub 78, EO BMF, Auto-Revocation List), refreshed a few times per year. No IRS API.

**Decision: store the bulk data in Postgres, NOT Dataverse.**

**Why:** Dataverse storage is sold in stingy per-environment tiers (~10 GB DB baseline + ~250 MB per licensed user; with ~16 staff that's ~14 GB row capacity). 300 MB of CSV becomes 1–3 GB as Dataverse rows with overhead/indexes — meaningful chunk of capacity for pure reference data with no relational value to other entities. Bulk upserting ~1.8M rows via Web API is also slow and throttled. Postgres handles 2M EIN-indexed rows trivially; refresh = `COPY` from CSV in a quarterly script.

**Architecture:**
- Postgres table `irs_exempt_orgs` keyed on EIN, refreshed quarterly via a script.
- PA flow calls a Vercel endpoint (e.g. `/api/irs/verify-ein?ein=...`) with a shared-secret header — same shape as the Executor contract, no LLM, just indexed lookup.
- Endpoint returns structured answer (exempt status + ruling year + last-refreshed date), PA writes the *verified result* back to the `account` row in Dynamics.
- Only the answer lives in CRM (boolean + verification date per account); the bulk IRS dataset stays in Postgres.

**Why a Vercel endpoint vs PA's native PostgreSQL connector:** one auth surface, single place for EIN normalization/validation, logging, caching, rate-limiting. Extra hop is worth it.

**How to apply:** When this gets built, follow the call-and-respond shape used by other PA-triggered endpoints. Likely needs a `IRS_VERIFY_SECRET` env var (separate from `CRON_SECRET` since PA isn't a Vercel cron). The 3 IRS files may not all be needed — BMF alone covers "currently exempt?"; Pub 78 is a subset, Auto-Revocation is the negative list. Confirm scope before loading all three.

**Mental model shift this surfaces:** Postgres's durable role is "app's reference-data layer" (researchers, publications, retractions, IRS), not "Dynamics on-ramp". The staging-style use is what Wave 1 is draining; the reference-data use is what stays. Related: [[project_wave1_pending]], [[project_reviewer_postgres_to_dataverse_migration]].
