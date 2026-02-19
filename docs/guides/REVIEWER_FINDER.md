# Reviewer Finder Guide

Find qualified peer reviewers for grant proposals using AI analysis combined with academic database verification.

## Overview

The Reviewer Finder has three tabs:

| Tab | Purpose |
|-----|---------|
| **Find Reviewers** | Upload a proposal, run AI analysis, and discover candidates |
| **My Candidates** | View and manage saved reviewers, generate invitation emails |
| **Database** | Browse all researchers saved across proposals |

## Step-by-Step: Finding Reviewers

### 1. Upload a Proposal

- Click **Upload PDF** or drag and drop a proposal document
- The system extracts metadata: title, abstract, PI name, institution, and co-investigators

### 2. Run Discovery

- Click **Find Reviewers** to start the search
- Claude AI analyzes the proposal and suggests reviewer candidates
- Each suggestion is verified against real academic databases (PubMed, ArXiv, BioRxiv, ChemRxiv)
- Results appear as candidate cards with publication counts, h-index, and relevance scores

### 3. Review Candidates

Each candidate card shows:
- **Name and affiliation** with a link to their Google Scholar profile
- **Expertise keywords** extracted from their publications
- **Relevance reasoning** — why this person is a good match
- **Warning badges** — institution overlap with the PI, or other potential conflicts

### 4. Save Candidates

- Check the box on candidates you want to keep
- Click **Save Selected** to store them in My Candidates
- Saved candidates persist in the database and are linked to the proposal

## My Candidates Tab

This tab shows all saved reviewers grouped by proposal. From here you can:

- **Edit** a candidate's contact info or notes
- **Delete** candidates you no longer need
- **Enrich Contacts** — run automated email/website lookup for candidates missing contact info
- **Generate Emails** — create invitation .eml files for selected candidates

### Enriching Contacts

Select candidates and click **Enrich Contacts** to search for their email addresses through a 5-tier lookup system:
1. Existing database records
2. ORCID profiles
3. PubMed author affiliations
4. Google Scholar pages
5. Institutional directory search

### Generating Invitation Emails

1. Select candidates with email addresses
2. Click **Email Selected**
3. Choose whether to use Claude AI personalization (adds a paragraph referencing the reviewer's expertise)
4. Click **Generate** to create .eml files
5. Download the files and open them in your email client

> **Note:** .eml files open as received messages. To send, either **Forward** the message (removing "Fwd:" from the subject) or copy the content into a new email.

## Database Tab

Browse and search all researchers across all proposals:
- **Search** by name, affiliation, or email
- **Filter** by "Has Email", "Has Website", or expertise tags
- **Sort** by name, affiliation, h-index, or last updated
- Click any row to view full details, edit notes, or associate the researcher with a different proposal

### Adding Researchers Manually

Click **Add Researcher** to enter a new researcher directly:
- Name, affiliation, department
- Contact info (email, website, ORCID, Google Scholar ID)
- Metrics (h-index, i10-index, citations)
- Expertise keywords (comma-separated)

## Settings

Click the **gear icon** to configure:

### Grant Cycle
- **Program Name** — e.g., "W. M. Keck Foundation"
- **Review Deadline** — date shown in invitation emails
- **Summary Pages** — which page(s) to extract from proposals (default: page 2)
- **Custom Fields** — additional dates used in email templates (proposal due date, send date, etc.)

### Attachments
- **Review Template** — PDF or Word file included with invitation emails
- **Additional Attachments** — other files to include

### Sender Info
- **Your Name and Email** — appears in the email "From" field
- **Signature Block** — appended to each email

### Email Template
- Customize the subject line and body using template placeholders
- Common placeholders: `{{greeting}}`, `{{proposalTitle}}`, `{{piName}}`, `{{reviewDeadline}}`, `{{signature}}`
- See the full placeholder list in the template editor

## Tips

- Run discovery with different temperature settings (0.3 = focused, 1.0 = creative) to get diverse candidate pools
- Use the **Re-extract** button in My Candidates if you need to change which summary pages are extracted
- Settings are saved per user profile — switching profiles loads that profile's settings
