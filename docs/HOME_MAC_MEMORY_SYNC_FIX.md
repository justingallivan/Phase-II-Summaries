# Home Mac Memory Sync Fix

**Written from the work Mac (2026-05-14).** The work Mac has Claude Code memory correctly wired into git via a symlink. The home Mac likely does not — memories written there have been local-only and out of sync.

---

## What's Happening

Claude Code stores per-project memory in a directory whose name is derived from the **full absolute path** of the project on that machine:

```
~/.claude/projects/<slug>/memory/
```

where `<slug>` is the project path with every `/` replaced by `-`
(e.g., `/Users/alice/Code/MyApp` → `-Users-alice-Code-MyApp`).

**If the project lives at a different path on the home Mac** (different username, different folder structure), Claude Code uses a completely different slug and a completely different memory directory. The home Mac has been writing memories there, entirely disconnected from the repo.

On the work Mac, the memory directory is a **symlink** → `.claude-memory/` inside this repo, so writes flow through git. The home Mac needs the same wiring — but pointed at whatever slug it actually uses.

---

## Step 0: Find the Correct Slug on the Home Mac

The slug must be derived from the project's actual path on the home Mac, not assumed from the work Mac's path.

```bash
# From inside the cloned repo on the home Mac:
cd /path/to/your/clone/of/Phase-II-Summaries
PROJECT_PATH=$(pwd)
PROJECT_SLUG=$(echo "$PROJECT_PATH" | sed 's|/|-|g')
echo "Slug: $PROJECT_SLUG"
echo "Memory dir: ~/.claude/projects/$PROJECT_SLUG/memory"
```

Then verify the directory exists:
```bash
ls -la ~/.claude/projects/$PROJECT_SLUG/
```

If it doesn't exist yet, Claude Code hasn't opened this project on the home Mac under that path — create it in Step 4.

---

## Step 1: Check Whether the Problem Exists

```bash
# Still inside the repo root, with PROJECT_SLUG set from Step 0:
ls -la ~/.claude/projects/$PROJECT_SLUG/memory
```

**If you see `-> /…/.claude-memory`** — you're already set up. Stop here, nothing to do.

**If you see a real directory listing** — continue below.

---

## Step 2: Diff Home-Only Memories Against the Repo

Before touching anything, see what's unique to the home Mac:

```bash
diff -rq \
  ~/.claude/projects/$PROJECT_SLUG/memory \
  "$(pwd)/.claude-memory"
```

Note any files that appear **only on the home side** (`Only in …/memory`). These are the orphaned memories that need to be rescued.

---

## Step 3: Copy Orphaned Files Into the Repo

For each file that exists only on the home side, copy it into `.claude-memory/`:

```bash
cp ~/.claude/projects/$PROJECT_SLUG/memory/<filename> \
   "$(pwd)/.claude-memory/"
```

If a file exists on both sides with different content, open both and merge manually — the repo version reflects work-Mac sessions, the local version reflects home-Mac sessions. Combine the "How to apply" sections where they diverged.

Also check `MEMORY.md` itself — it may have entries on the home side that aren't in the repo version. Merge those in.

---

## Step 4: Back Up and Replace With Symlink

```bash
# Back up just in case
cp -r \
  ~/.claude/projects/$PROJECT_SLUG/memory \
  ~/Desktop/claude-memory-backup-$(date +%Y%m%d)

# Create the target directory if it doesn't exist yet
mkdir -p ~/.claude/projects/$PROJECT_SLUG

# Replace the real directory with a symlink to the repo
rm -rf ~/.claude/projects/$PROJECT_SLUG/memory
ln -s "$(pwd)/.claude-memory" ~/.claude/projects/$PROJECT_SLUG/memory

# Verify
ls -la ~/.claude/projects/$PROJECT_SLUG/memory
# Should show: memory -> /path/to/your/clone/.claude-memory
```

---

## Step 5: Commit and Push Any Rescued Files

```bash
git status .claude-memory/
git add .claude-memory/
git commit -m "Rescue orphaned home-Mac memories — wire symlink"
git push origin main
```

---

## What to Expect Going Forward

Once the symlink is in place on both machines, memory writes on either machine flow into `.claude-memory/` and get committed + pushed like any other repo file. The `/stop` skill commits `.claude-memory/` and pushes at session end.

**One habit to maintain:** always run `/stop` before switching machines. If you close a session without pushing, the other machine won't have that session's memory writes until you push manually.

---

## Verify the Setup Is Working

After the symlink is created, open Claude Code on the home Mac and start a session. The memories from work-Mac sessions should be visible — in particular the behavioral rules (verbatim Codex output, red gates are P0, verify before destructive carryover, etc.).

If Claude still seems to be missing rules it should know:
```bash
ls ~/.claude/projects/$PROJECT_SLUG/memory/
# Should show the same files as .claude-memory/ in the repo
```
