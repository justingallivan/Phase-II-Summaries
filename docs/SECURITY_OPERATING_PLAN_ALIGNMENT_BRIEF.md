# Security Operating Plan — Initial Alignment Brief

Drafted 2026-05-05 (Session 132) to anchor the first planning conversation called for in `docs/SECURITY_OPERATING_PLAN.md § Initial Alignment Agenda`. Six decisions to make. Recommendations below; each is overrideable.

The conversation is mostly with yourself — you're the sole developer. Decisions 2 and 3 brush against Connor (monthly cadence + the open `wmkf_ai_run` permission question). Decision 6 is the broader "what's next" pivot question that's worth one beat of explicit thought.

---

## 1. Confirm the hardening tranche is complete

**State.** Plan § Current Posture lists 10 controls. Cross-checking against memory + recent commits: API route matrix (CI-gated S130), AI data-flow matrix, payload boundaries, Executor `dataClass + maxChars` caps, override-redaction, raw-output retention modes, `phase-i.summary` activated with `hash`, VRP allowlist + fail-closed, Reviewer Finder LLMClient migration, Dynamics Explorer serializer — all shipped and live in production. Nothing open from the May tranche.

**Recommendation.** Confirm complete. The plan's "remaining items" are correctly characterized as watch items, not unfinished work.

**Decision.** ✓ confirm, or list any item you don't think is actually done.

---

## 2. Confirm Justin owns weekly/monthly/quarterly + monthly rides Connor syncs

**State.** As drafted: weekly = solo, 30-45 min, anchored to session start. Monthly = 60-90 min on a Connor sync. Quarterly = half day, IT looped in.

**Recommendation.** Accept as drafted. Folding monthly into Connor syncs avoids creating a new meeting; the topics genuinely overlap (`wmkf_ai_run` retention is a Connor question, not a Justin-alone question). The "if no Connor sync, do Dataverse-side checks solo and queue the rest" fallback is reasonable.

**One thing to flag.** Weekly cadence at 30-45 min anchored to the *start* of a coding session is realistic for week 1, but cadence drift is the most likely failure mode for a sole-dev operating plan. Consider committing to a recurring calendar reminder ("Mondays AM: security skim") instead of "first session of the week" — the latter is the kind of thing that quietly slips after 6 weeks. Cheap insurance.

**Decision.** ✓ accept, or rework.

---

## 3. `wmkf_ai_run` permission/retention review — IT ticket now or watch item?

**State.** Plan flags this as a watch item with two escalation thresholds: table grows past 10,000 rows, OR a non-staff role gains read access. Today the table is small (<<10K) and audience is narrow (staff only).

**Recommendation.** Watch item. **But:** while Connor is already going to be asked for the Delegate role (today's email), it's almost free to add one question to that conversation: *"Who has read access to `wmkf_ai_run` today, and is that intentional?"* That single answer either confirms the watch item is appropriate or surfaces a finding worth ticketing. No need to pre-write an IT ticket; the conversation IS the cheap version.

**Decision.** ✓ keep as watch item + ask Connor the read-access question opportunistically; or open IT ticket now (overkill); or do nothing extra (acceptable but slightly worse — leaves the question dangling).

---

## 4. PR-time matrix-update check — soft prompt vs. CI-blocking

**State.** API route matrix is already CI-blocking (`npm run check:api-routes`, gated S130 — PRs touching `pages/api/**` fail without a matrix update). AI data-flow matrix is checklist-only — no automated check.

**Recommendation.** Keep AI matrix as soft prompt for now. Two reasons:
1. The AI matrix is narrative, not row-structured-and-parseable in the way the API matrix is. Building a CI check would require either restructuring the matrix into a parseable format or training a heuristic — neither cheap.
2. As sole dev, the failure mode (you forget to update it) is self-correcting on the next monthly cadence pass. The cost of a CI gate is high; the cost of a missed update is low and bounded.

Reconsider if (a) you ever onboard another contributor, or (b) two consecutive monthly reviews surface drift.

**Decision.** ✓ soft prompt; or invest in CI-blocking; or restructure the AI matrix into parseable form first.

---

## 5. Track watch items: matrix rows only, or matrix rows + GitHub issues?

**State.** The plan has three watch items (`wmkf_ai_run` retention, Dynamics Explorer serializer, Search Document Fan-Out), each with a defined escalation threshold. Memory entries already cover longer-form rationale.

**Recommendation.** Matrix rows only. GitHub issues for items still in *watch* state would duplicate the matrix without adding signal — the threshold is the trigger, not "is there an open issue." Promote a watch item to a GitHub issue *only when its threshold trips*. That way the issue tracker reflects active work, not a permanent backlog of "things to keep an eye on."

**Decision.** ✓ matrix only with threshold-triggered promotion to issues; or open shadow issues for visibility (acceptable if you find threshold-only tracking too easy to forget).

---

## 6. Next non-security priority

**State.** The hardening tranche is done. Today already cleared one quick-win (Dynamics Explorer statecode filter, AI fields documentation) and started the impersonation rollout (now blocked on Connor). The S131 prompt's three open threads are: intake portal, impersonation rollout (gated), this brief itself.

**Three viable next-rock options, descending in size:**

- **Intake portal — institution/membership flow** (~1 day per slice). Highest strategic priority per memory (skinny pilot, mid-June 2026 Phase II Research target). Bite-sized first slice: the search/match endpoint OR the membership-write flow. Builds on the just-shipped External ID foundation. Right thing to spend most of the next session(s) on.
- **Connor backend-automation planning** (~half day, gated on Connor availability). Memory flags this as the longer-term direction; would benefit from a real conversation rather than another doc cycle. Lower urgency than intake portal in the next 4 weeks.
- **Dynamics Explorer schema curation** (1-2 hours, deferred earlier today). Concrete and well-scoped. Would unblock model coverage of newly-added Dataverse fields. Worth slotting in as a between-bigger-rocks task, not as a primary focus.

**Recommendation.** Make intake portal the primary thread for sessions 133-135, slotting in (a) impersonation re-smoke as soon as Connor grants Delegate, and (b) Dynamics Explorer schema curation if you want a 1-2 hour palate cleanser.

**Decision.** ✓ intake portal as primary; or different priority; or defer the choice to next session start (acceptable).

---

## What this conversation produces

- A `## Decisions, 2026-05-XX` block appended to `docs/SECURITY_OPERATING_PLAN.md`, recording each ✓ or override.
- The Initial Alignment Agenda section gets removed per the plan's own instruction ("Once decisions are made, fold them back into the relevant sections above and remove this section.").
- This brief gets archived to `docs/archive/`.

If you want, run the conversation in your head right now (it's mostly self-alignment), record the decisions, and we delete this brief and the agenda section in a single tidy commit.
