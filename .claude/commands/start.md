# Session Start

Start a new coding session with proper git sync and context loading.

## Step 1: Git Housekeeping

Before reading any files, ensure the repository is in sync:

1. **Verify repo health** - Quick sanity check:
   ```bash
   git rev-parse HEAD
   ```
   If this fails, the repo may be corrupted (see CLAUDE.md for recovery steps).

2. **Fetch remote changes** - Check if other machines pushed updates:
   ```bash
   git fetch origin
   git status
   ```

3. **Pull if behind** - If local is behind remote, pull first:
   ```bash
   git pull origin main
   ```
   Do NOT proceed with work if there are merge conflicts - alert the user.

4. **Check for stale changes** - If there are uncommitted changes, warn the user:
   - These may be leftover from a previous session
   - Ask if they should be committed, stashed, or discarded

## Step 2: Load Context

Read the following files to get context for this session:

1. **SESSION_PROMPT.md** - Previous session summary and potential next steps
2. **CLAUDE.md** - Project documentation and conventions

## Step 3: Present Summary

After completing the above:
- Report git sync status (up to date, pulled N commits, or any issues)
- Summarize what was accomplished in the previous session
- List the potential next steps from SESSION_PROMPT.md
- Note any uncommitted changes that need attention
- Ask what the user would like to work on this session
