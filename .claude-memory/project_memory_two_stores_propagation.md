# Two memory stores — propagation root cause (S165, 2026-05-19; corrects an S165 mid-session error)

**There are TWO separate memory corpora. Confusing them caused both the "memories don't propagate" problem and the multi-session "phantom memory" belief.**

1. **`.claude-memory/` — git-tracked, propagating, AUTHORITATIVE.** Repo dir, snake_case (`feedback_*`, `project_*`, `user_*`), index `.claude-memory/MEMORY.md` ("# Project Memory", sectioned). ~73 files. Committed by `/stop` Step 4 (`git add .claude-memory/`). **Propagates across Macs via normal git push/pull — and always has.** This is the project's real memory of record.
2. **`~/.claude/projects/<slug>/memory/` — harness auto-memory, per-machine, does NOT propagate.** Kebab-case (`slice0-deactivate-not-delete-recalc`, etc.), index `MEMORY.md` ("# Memory Index"). The current Claude Code build instructs the agent to write *here*. `~/.claude` is plain local disk — never in the repo, never synced.

**Root cause of "memories stopped propagating":** the active write target silently shifted from store 1 (git-tracked) to store 2 (harness) around S161–164. Nothing was lost and propagation was never fundamentally broken — durable knowledge just started landing in a per-machine store instead of the committed one. Prior `/stop` notes even recorded "harness store … won't sync via git" but kept writing there and never reconverged; the user then escalated to moving the repo into iCloud — which **cannot** help (the harness store is under `~/.claude`, not in the repo) and adds git-on-iCloud corruption risk. Cost without benefit.

**"Phantom memory" pattern was a store-divergence artifact, not missing memories.** `project_w6_table_drop_pending.md` and `project_reviewer_postgres_to_dataverse_migration.md` were called "phantom / never written" for several sessions — both **exist in `.claude-memory/`** (git-tracked). Sessions reading only the kebab harness store could not see the snake_case git ones. Before declaring any cited memory "phantom," check BOTH stores.

**Why:** a single local CLI tool defaulting to per-machine state is a reasonable design (privacy, not polluting every repo), but this project is multi-Mac and shares durable knowledge via git — so the git-tracked `.claude-memory/` store is the correct home for anything that must survive a machine switch. The harness store is fine as fast scratch; it just isn't the bridge.

**How to apply (resolution is an OPEN decision; surface & propose, do not reconfigure the environment unilaterally):**
- **Take the repo OUT of iCloud.** It propagates via git push/pull; iCloud only adds `.git` corruption / conflict-copy / symlink-dereference risk for zero gain. Never put `.git`/working tree in an iCloud shared folder.
- **Reconverge on `.claude-memory/` as the memory of record** (recommended): durable memory written here (snake_case) is committed by `/stop` and propagates. Treat the kebab harness store as per-machine scratch; its canonical copy lives in `.claude-memory/` and/or `SESSION_PROMPT.md`.
- Alternative if the harness mechanism itself must roam: mirror harness→`.claude-memory/` at `/stop`, or sync only the harness `memory/` dir — never the repo/`.git`.
- Until reconverged, **dual-write**: anything that must reach the other Mac goes in a git-tracked file (`.claude-memory/`, `SESSION_PROMPT.md`, `docs/`), not only the harness store. This file is the corrected, propagating record; the harness `memory-propagation-icloud-misfix.md` is the same finding kept locally accurate.

## Update (S168, 2026-05-20): harness store is symlinked on THIS Mac

Discovered while writing a new memory entry: on the current Mac, the harness directory

`~/.claude/projects/-Users-gallivan-Library-Mobile-Documents-com-apple-CloudDocs-Documents-Programming-Claude-Projects-WMKF-Apps/memory/`

is a **symlink** pointing to `.claude-memory/` in the repo. `readlink` confirms; `stat` shows the same inode for files accessed via either path. So on this machine, **the two stores are one physical store** — writes to either path land in the git-tracked `.claude-memory/` and propagate via push/pull. This is effectively the "Reconverge on `.claude-memory/`" alternative from the *How to apply* list, implemented via symlink.

**Verification needed on the OTHER Mac.** The symlink is filesystem-local — it exists on this machine but is not a repo artifact. The other Mac's harness directory is almost certainly still a regular directory (the harness creates one by default on first run). Until verified, treat the propagation hazard as resolved on THIS Mac only:

```bash
# Run on the other Mac to check:
readlink "$HOME/.claude/projects/-Users-gallivan-Library-Mobile-Documents-com-apple-CloudDocs-Documents-Programming-Claude-Projects-WMKF-Apps/memory"
# If it returns the repo's .claude-memory/ path → already consolidated.
# If it returns nothing (regular dir) → recreate as symlink:
#   mv .../memory .../memory.bak
#   ln -s "<repo path>/.claude-memory" .../memory
#   (then merge any unique kebab entries from .bak before deleting)
```

Until the other Mac is verified/fixed, dual-write of durable knowledge still applies there.

Status: **root cause IDENTIFIED & corrected; consolidation OPEN on the other Mac (verify + apply symlink); iCloud-removal decision still open.** Not green-lit infra work.
