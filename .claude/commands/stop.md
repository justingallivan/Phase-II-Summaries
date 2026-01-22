# Session End

Wrap up the current session by updating documentation and syncing to remote.

## Step 1: Review the Session

Check git log and status to see what was accomplished:
```bash
git log --oneline -10  # Find commits made this session
git status             # Check for uncommitted changes
git diff --stat        # If there are staged/unstaged changes
```

## Step 2: Commit Any Remaining Changes

If there are uncommitted changes:
1. Review what's changed with `git diff`
2. Stage relevant files with `git add <files>`
3. Commit with a descriptive message
4. Do NOT leave uncommitted changes - they may cause issues on another machine

## Step 3: Update Documentation

1. **Read current files** - Review SESSION_PROMPT.md and CLAUDE.md to understand existing structure

2. **Update SESSION_PROMPT.md** - Rewrite with:
   - New session number (increment from current)
   - Summary of what was completed this session (with commit hashes if applicable)
   - Key files that were added or modified
   - Potential next steps for the next session
   - Any relevant context or gotchas for continuity

3. **Update CLAUDE.md** if needed - Only update if:
   - New apps or features were added
   - API endpoints changed
   - Database schema changed
   - New scripts were added
   - Configuration or conventions changed

4. **Update DEVELOPMENT_LOG.md** if needed - Append session notes if significant work was done

## Step 4: Commit Documentation Updates

After updating documentation files:
```bash
git add SESSION_PROMPT.md CLAUDE.md DEVELOPMENT_LOG.md
git commit -m "Document Session N and create Session N+1 prompt"
```

## Step 5: Push to Remote (Critical for Multi-Mac Workflow)

Always push before ending the session:
```bash
git push origin main
```

Verify the push succeeded. If it fails:
- Check for network issues
- Check if remote has changes (may need to pull first)
- Alert the user - do NOT end session with unpushed commits

## Step 6: Show Summary

Display:
- List of commits made this session
- Documentation files that were updated
- Confirmation that changes are pushed to remote
- Reminder of next steps for the next session

## SESSION_PROMPT.md Format

```markdown
# Session [N+1] Prompt: [Brief Description]

## Session [N] Summary

[What was accomplished]

### What Was Completed

1. **Feature/Fix Name**
   - Details
   - Details

### Commits
- `hash` - Message
- `hash` - Message

## Potential Next Steps

### 1. [Next task]
Description of what could be done next

### 2. [Another task]
Description

## Key Files Reference

| File | Purpose |
|------|---------|
| `path/to/file.js` | What it does |

## Testing

```bash
# How to test
```
```
