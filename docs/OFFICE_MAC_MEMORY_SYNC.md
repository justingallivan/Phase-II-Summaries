# Office Mac Memory Reconciliation — One-Shot Procedure

**What this is:** A one-time procedure to reconcile the office Mac's pre-symlink Claude memory with the home Mac's memory now in this repo. Memory was per-machine until 2026-05-03; the office Mac has potentially unique entries that have silently diverged.

**Delete this file once the procedure is complete on both Macs and verified.**

---

## Preferred path — single office session (~45 min)

Do all three phases back-to-back at the office, **before any other work**. This keeps the merge inputs to two known sets (iCloud snapshot + current `.claude-memory/`); deferring Phase 2 means later memory writes get mixed in.

### Phase 1 — Snapshot (~30 sec)

Run this **first**, before opening Claude Code at the office.

```bash
mkdir -p ~/Library/Mobile\ Documents/com~apple~CloudDocs/claude-memory-reconcile
cp -R ~/.claude/projects/-Users-$(whoami)-Programming-Phase-II-Summaries/memory \
      ~/Library/Mobile\ Documents/com~apple~CloudDocs/claude-memory-reconcile/office-snapshot
```

Wait until Finder shows the folder fully uploaded (no cloud-arrow icon) before proceeding.

> ⚠️ Do not open Claude Code until this finishes. Even a read-only session can trigger memory writes that deepen the divergence.

### Phase 3 — Symlink memory + patch the start skill (~3 min)

```bash
cd ~/Programming/Phase-II-Summaries && git pull
PROJECT_SLUG="-Users-$(whoami)-Programming-Phase-II-Summaries"
TARGET=~/.claude/projects/$PROJECT_SLUG
mv "$TARGET/memory" "$TARGET/memory.pre-reconcile-backup"
ln -s "$(pwd)/.claude-memory" "$TARGET/memory"
```

Then open `~/.claude/skills/start/skill.md` and check whether it has a **Step 4** beginning "Treat destructive carryover items as unverified". If missing, append this verbatim after Step 3:

```markdown
## Step 4: Treat destructive carryover items as unverified

When summarizing "next steps" or "pivot to" sections from SESSION_PROMPT.md, flag any item that says **drop**, **remove**, **retire**, **archive**, **delete**, or **deprecate** infrastructure as **unverified-until-checked**, NOT as a green-lit task. These items have inherited from prior sessions and may have gone stale.

If the user asks to act on one, do a pre-flight verification first:
1. Grep for live callers of the thing being removed.
2. Read the most likely callers to confirm they're not load-bearing.
3. If anything looks live, stop and report back before touching anything.

This rule exists because on 2026-05-03 a "drop dormant Postgres reviewer tables" carryover item was about to be acted on; the tables were actually load-bearing for the live Reviewer Finder app. The rule does NOT apply to additive work.
```

### Phase 2 — Reconcile (~30-45 min)

Open Claude Code (now reading from `.claude-memory/`) and ask it to run the reconcile. It should:

1. Three-bucket diff between iCloud snapshot at `~/Library/Mobile Documents/com~apple~CloudDocs/claude-memory-reconcile/office-snapshot/` and the current `.claude-memory/`: unique-to-office, unique-to-home, same-name-different-content.
2. For overlapping files, propose a merged version per file (each side may have unique facts).
3. Re-run a live-state audit on the merged set — both sides have been drifting, so merging two stale sources doesn't give a fresh source.
4. Commit reconciled `.claude-memory/` and push to `main`.

Cleanup once verified:

```bash
rm -rf ~/.claude/projects/-Users-$(whoami)-Programming-Phase-II-Summaries/memory.pre-reconcile-backup
rm -rf ~/Library/Mobile\ Documents/com~apple~CloudDocs/claude-memory-reconcile
```

---

## Fallback path — defer Phase 2

If you don't have ~30 min at the office, or Phase 2 surfaces a decision you can't make on the spot:

- Do Phases 1 and 3 at the office, then work normally.
- Run Phase 2 from any Mac later. The iCloud snapshot is the input; the current `.claude-memory/` (which may contain new entries from the office work session) is the other input.
- The merge is slightly messier because the office work session added entries that need to be considered, but it's still doable.
- Run Phase 2 sooner rather than later — every additional work session adds more entries the merge has to reason about.

---

## Notes

- This procedure is one-shot, not recurring. Once both Macs are symlinked to `.claude-memory/`, divergence stops.
- If a NEW Mac is ever added in the future, follow `docs/MULTI_MAC_SETUP.md` Step 4 — no snapshot needed because there's no pre-existing memory to preserve.
- The `/start` skill lives in per-user global Claude config, not the repo, so future skill edits will need the same kind of manual sync. If this becomes a pattern, consider symlinking `~/.claude/skills/` into the repo too.
