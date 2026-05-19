# AGENTS.md

**Canonical agent instructions for this project live in [`CLAUDE.md`](./CLAUDE.md). Read that file.**

This `AGENTS.md` is intentionally a *thin pointer*, not a copy. The project is a
Claude / Anthropic application (Next.js, deployed on Vercel); `CLAUDE.md` is the
single source of truth for architecture, conventions, the ground-truth /
carryover-hygiene rules, and the CI gates. Treat `CLAUDE.md` as authoritative for
everything.

> ⚠️ **If this file ever contains more than this pointer** (e.g. a full
> `s/Claude/Codex/`-substituted derivative of `CLAUDE.md`), it has been
> **clobbered by upstream auto-generation and must NOT be trusted** — that
> derivative asserts a false stack and an unsafe `VRP_ALLOWED_PROVIDERS` value.
> Ignore the clobbered content, read `CLAUDE.md`, and restore this pointer
> (`git checkout AGENTS.md`). Background: `docs/DOCS_GROUND_TRUTH_AUDIT_2026-05-19.md`.
