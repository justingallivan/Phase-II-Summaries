#!/bin/bash
#
# setup-git-nosync.sh
#
# Configures the repository to prevent iCloud from syncing the .git directory.
# This avoids git corruption when working on the same repo from multiple Macs.
#
# Run this ONCE on each Mac where you work on this project.
#
# What it does:
#   1. Moves .git to .git.nosync (iCloud ignores .nosync files/folders)
#   2. Creates a symlink: .git -> .git.nosync
#   3. Git continues to work normally via the symlink
#
# After setup:
#   - Use git push/pull to sync between Macs (not iCloud)
#   - Each Mac has its own .git.nosync directory
#   - Working files still sync via iCloud
#

set -e  # Exit on error

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Git .nosync Setup ==="
echo "Repository: $REPO_ROOT"
echo ""

# Check if already set up
if [ -L .git ]; then
    echo "✓ Already configured! .git is a symlink to:"
    ls -la .git
    exit 0
fi

# Check if .git exists and is a directory
if [ ! -d .git ]; then
    echo "ERROR: No .git directory found."
    echo ""
    echo "If this is a fresh Mac, clone the repo first:"
    echo "  git clone https://github.com/justingallivan/Phase-II-Summaries.git"
    echo ""
    echo "Then run this script again."
    exit 1
fi

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "WARNING: You have uncommitted changes!"
    echo ""
    git status --short
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted. Commit or stash your changes first."
        exit 1
    fi
fi

# Perform the setup
echo "Setting up .git.nosync..."

# Step 1: Move .git to .git.nosync
mv .git .git.nosync
echo "  ✓ Moved .git to .git.nosync"

# Step 2: Create symlink
ln -s .git.nosync .git
echo "  ✓ Created symlink .git -> .git.nosync"

# Step 3: Verify
if git rev-parse HEAD > /dev/null 2>&1; then
    echo "  ✓ Git is working correctly"
else
    echo "  ✗ ERROR: Git is not working. Reverting..."
    rm .git
    mv .git.nosync .git
    exit 1
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "iCloud will no longer sync the .git directory on this Mac."
echo ""
echo "Remember:"
echo "  - Use 'git push' before switching to another Mac"
echo "  - Use 'git pull' when starting on this Mac"
echo "  - Or just use /start and /stop which handle this automatically"
echo ""
