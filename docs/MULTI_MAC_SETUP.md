# Multi-Mac Development Setup

Instructions for setting up this project on multiple Macs using Git for synchronization.

## Overview

Each Mac has its own local clone. GitHub is the source of truth. Use `/start` and `/stop` skills to sync between machines.

---

## Fresh Setup on a New Mac

### Step 1: Choose Location and Clone

```bash
# Create directory if needed
mkdir -p ~/Programming

# Clone the repo
cd ~/Programming
git clone https://github.com/justingallivan/Phase-II-Summaries.git
cd Phase-II-Summaries
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Set Up Environment Variables

You have two options:

**Option A: Copy from existing Mac (easiest)**

Transfer your `.env.local` file from your other Mac via AirDrop, secure email, or copy the contents manually.

**Option B: Create fresh**

```bash
cp .env.example .env.local
```

Then edit `.env.local` and add these values:

```env
# Required
CLAUDE_API_KEY=your_claude_api_key

# Database (copy from Vercel dashboard or other Mac)
POSTGRES_URL=your_postgres_connection_string

# Authentication (Azure AD)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secret
AZURE_AD_CLIENT_ID=your_client_id
AZURE_AD_CLIENT_SECRET=your_client_secret
AZURE_AD_TENANT_ID=your_tenant_id

# Optional - Enhanced Features
SERP_API_KEY=your_serp_key
NCBI_API_KEY=your_ncbi_key
ORCID_CLIENT_ID=your_orcid_id
ORCID_CLIENT_SECRET=your_orcid_secret

# Optional - User Profiles
USER_PREFS_ENCRYPTION_KEY=your_32_byte_hex_key
```

### Step 4: Verify Setup

```bash
# Test the build
npm run build

# Start dev server
npm run dev
```

Visit http://localhost:3000 to confirm it works.

### Step 5: Test Git Workflow

```bash
# Verify git is connected
git remote -v
# Should show: origin  https://github.com/justingallivan/Phase-II-Summaries.git

# Test fetch
git fetch origin
git status
```

---

## Daily Workflow (All Macs)

| When | Command | What it does |
|------|---------|--------------|
| Start working | `/start` | Fetches, pulls if behind, loads context |
| Done working | `/stop` | Commits changes, pushes, updates docs |

**Important:** Always run `/stop` before switching Macs to avoid merge conflicts.

---

## Troubleshooting

### Merge Conflicts

If you forgot to push from one Mac and pulled on another:

```bash
# See what's conflicting
git status

# Option 1: Keep your local changes
git checkout --ours <file>

# Option 2: Keep remote changes
git checkout --theirs <file>

# After resolving, commit
git add .
git commit -m "Resolve merge conflict"
```

### Forgot to Pull Before Working

If you made changes without pulling first and now have divergent branches:

```bash
# Stash your changes
git stash

# Pull remote
git pull origin main

# Re-apply your changes
git stash pop

# Resolve any conflicts, then commit
```

### Node Modules Issues

If you see strange errors after pulling, try a fresh install:

```bash
rm -rf node_modules .next
npm install
```

---

## Notes

- Each Mac has independent `node_modules` (not synced) - this avoids binary compatibility issues
- `.env.local` is gitignored - you must set it up on each Mac
- The database is shared (Vercel Postgres) - both Macs access the same data
