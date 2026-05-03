---
name: Office Mac memory reconciliation procedure
description: One-time procedure to reconcile the office Mac's pre-symlink memory dir with the home Mac's memory now in the repo. Preferred path: do all three phases in one office session. Fallback: defer Phase 2.
type: project
---
**Context:** Memory was per-machine until 2026-05-03 (this Mac, home). The office Mac still has its own local memory dir at `~/.claude/projects/-Users-<whoami>-Programming-Phase-II-Summaries/memory/` with potentially unique entries that have silently diverged for weeks. Goal: capture them, merge with this Mac's set, deploy the merged result on both Macs.

**Why this matters:** Symlinking the office memory dir straight to the repo would destroy office-only entries. Snapshot to iCloud first, then symlink, then reconcile.

## Preferred path — single office session (~45 min)

Do all three phases back-to-back at the office, **before any other work**. This keeps the merge inputs to two known sets (iCloud snapshot + current `.claude-memory/`); deferring Phase 2 means later memory writes get mixed in.

### Phase 1 — snapshot (~30 sec)

```bash
mkdir -p ~/Library/Mobile\ Documents/com~apple~CloudDocs/claude-memory-reconcile
cp -R ~/.claude/projects/-Users-$(whoami)-Programming-Phase-II-Summaries/memory \
      ~/Library/Mobile\ Documents/com~apple~CloudDocs/claude-memory-reconcile/office-snapshot
# Wait until Finder shows the folder fully uploaded (no cloud-arrow icon)
# before doing anything else.
```

**Critical:** do NOT open Claude Code before this finishes. Even a read-only session can trigger memory writes that deepen the divergence.

### Phase 3 — symlink memory + patch the start skill (~3 min)

```bash
# Symlink memory
cd ~/Programming/Phase-II-Summaries && git pull
PROJECT_SLUG="-Users-$(whoami)-Programming-Phase-II-Summaries"
TARGET=~/.claude/projects/$PROJECT_SLUG
mv "$TARGET/memory" "$TARGET/memory.pre-reconcile-backup"
ln -s "$(pwd)/.claude-memory" "$TARGET/memory"
```

The office Mac now reads/writes memory through `.claude-memory/`. Office-only memories from the snapshot are NOT yet in `.claude-memory/` — they're waiting in iCloud for Phase 2.

**Then patch the `/start` skill.** The skill lives at `~/.claude/skills/start/skill.md` (per-user global Claude config, NOT in the repo) and was edited 2026-05-03 to flag destructive carryover items as unverified-until-checked. The office Mac's copy is out of date. Open the file and check whether it has a **Step 4** beginning "Treat destructive carryover items as unverified". If missing, append this verbatim after Step 3:

```markdown
## Step 4: Treat destructive carryover items as unverified

When summarizing "next steps" or "pivot to" sections from SESSION_PROMPT.md, flag any item that says **drop**, **remove**, **retire**, **archive**, **delete**, or **deprecate** infrastructure as **unverified-until-checked**, NOT as a green-lit task. These items have inherited from prior sessions and may have gone stale.

If the user asks to act on one, do a pre-flight verification first:
1. Grep for live callers of the thing being removed.
2. Read the most likely callers to confirm they're not load-bearing.
3. If anything looks live, stop and report back before touching anything.

This rule exists because on 2026-05-03 a "drop dormant Postgres reviewer tables" carryover item was about to be acted on; the tables were actually load-bearing for the live Reviewer Finder app. The rule does NOT apply to additive work.
```

### Phase 2 — reconcile (~30-45 min)

Open Claude Code (now reading from `.claude-memory/`) and ask it to delegate the merge to a subagent. Steps:

1. Three-bucket diff: unique-to-office, unique-to-home, same-name-different-content.
2. For overlapping files, propose a merged version per file (each side may have unique facts).
3. Re-run a live-state audit on the merged set (same shape as 2026-05-03 audit) — both sides have been drifting, so merging two stale sources doesn't give a fresh source.
4. Commit the reconciled `.claude-memory/` to `main`. Push.

After this lands, delete `~/.claude/projects/.../memory.pre-reconcile-backup` and the iCloud snapshot folder.

## Fallback path — defer Phase 2

If you don't have ~30 min at the office, or Phase 2 surfaces a decision you can't make on the spot:

- Do Phases 1 and 3 at the office, then work normally.
- Run Phase 2 from any Mac later. The iCloud snapshot is the input; the current `.claude-memory/` (which may contain new entries from the office work session) is the other input.
- The merge is slightly messier because the office work session added entries that need to be considered, but it's still doable.
- Run Phase 2 sooner rather than later — every additional work session adds more entries the merge has to reason about.

## How to apply

- This is a one-shot procedure, not recurring. Once both Macs are symlinked to `.claude-memory/`, divergence stops.
- If a NEW Mac is ever added, follow `docs/MULTI_MAC_SETUP.md` Step 4 — no snapshot needed because there's no pre-existing memory to preserve.
- Delete this file once the procedure is complete and verified.
