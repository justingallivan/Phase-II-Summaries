# Home Mac Memory Sync Fix

**Written from the work Mac (2026-05-14).** The work Mac has Claude Code memory correctly wired into git via a symlink. The home Mac likely does not — memories written there have been local-only and out of sync.

---

## What's Happening

Claude Code stores per-project memory in:
```
~/.claude/projects/-Users-<you>-Programming-WMKF-Apps-Phase-II-Summaries/memory/
```

On the work Mac, that path is a **symlink** pointing to `.claude-memory/` inside this repo, so memory writes flow through git like any other file.

On the home Mac, that path is probably a **real directory** not connected to the repo. That means:
- Memories written at home never made it into git
- Memories committed from work never reached Claude Code at home
- Any behavioral corrections made at home (telling Claude to stop doing X, remember Y) were silently lost

---

## Step 1: Check Whether the Problem Exists

```bash
ls -la ~/.claude/projects/-Users-$(whoami)-Programming-WMKF-Apps-Phase-II-Summaries/memory
```

**If you see `-> /…/.claude-memory`** — you're already set up. Stop here, nothing to do.

**If you see a real directory listing** — continue below.

---

## Step 2: Diff Home-Only Memories Against the Repo

Before touching anything, see what's unique to the home Mac:

```bash
diff -rq \
  ~/.claude/projects/-Users-$(whoami)-Programming-WMKF-Apps-Phase-II-Summaries/memory \
  ~/Programming/WMKF_Apps/Phase-II-Summaries/.claude-memory
```

Note any files that appear **only on the home side** (`Only in /…/memory`). These are the orphaned memories that need to be rescued.

---

## Step 3: Copy Orphaned Files Into the Repo

For each file that exists only on the home side, copy it into `.claude-memory/`:

```bash
cp ~/.claude/projects/-Users-$(whoami)-Programming-WMKF-Apps-Phase-II-Summaries/memory/<filename> \
   ~/Programming/WMKF_Apps/Phase-II-Summaries/.claude-memory/
```

If a file exists on both sides with different content, open both and merge manually — the repo version reflects work-Mac sessions, the local version reflects home-Mac sessions. Combine the "How to apply" sections if they diverged.

Also check `MEMORY.md` itself — it may have entries on the home side that aren't in the repo version. Merge those in.

---

## Step 4: Back Up and Replace With Symlink

```bash
# Back up just in case
cp -r \
  ~/.claude/projects/-Users-$(whoami)-Programming-WMKF-Apps-Phase-II-Summaries/memory \
  ~/Desktop/claude-memory-backup-$(date +%Y%m%d)

# Replace the real directory with a symlink
PROJECT_SLUG="-Users-$(whoami)-Programming-WMKF-Apps-Phase-II-Summaries"
TARGET=~/.claude/projects/$PROJECT_SLUG
rm -rf "$TARGET/memory"
ln -s "$HOME/Programming/WMKF_Apps/Phase-II-Summaries/.claude-memory" "$TARGET/memory"

# Verify
ls -la "$TARGET/memory"
# Should show: memory -> /Users/<you>/Programming/WMKF_Apps/Phase-II-Summaries/.claude-memory
```

---

## Step 5: Commit and Push Any Rescued Files

```bash
cd ~/Programming/WMKF_Apps/Phase-II-Summaries
git status .claude-memory/
git add .claude-memory/
git commit -m "Rescue orphaned home-Mac memories — wire symlink"
git push origin main
```

---

## What to Expect Going Forward

Once the symlink is in place on both machines, memory writes on either machine flow into `.claude-memory/` and get committed + pushed like any other repo file. The `/stop` skill commits and pushes at session end, which includes memory changes.

**One habit to maintain:** always run `/stop` before switching machines. If you close a session without pushing, the other machine won't have that session's memory writes until you push manually.

---

## Verify the Setup Is Working

After the symlink is created, open Claude Code on the home Mac and start a session. The memories from this work-Mac session should be visible — in particular the behavioral rules (verbatim Codex output, red gates are P0, verify before destructive carryover, etc.).

If Claude still seems to be missing rules it should know, check:
```bash
ls ~/.claude/projects/-Users-$(whoami)-Programming-WMKF-Apps-Phase-II-Summaries/memory/
# Should show the same files as .claude-memory/ in the repo
```
