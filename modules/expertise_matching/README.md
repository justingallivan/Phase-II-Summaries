# Keck Reviewer Matching — Claude Code Integration Package

## What This Is

A self-contained module for matching W.M. Keck Foundation research proposals to qualified reviewers. It includes a structured reviewer database (38 entries), a React dashboard for browsing and AI-assisted matching, operational procedures for Phase I batch and Phase II individual review, and a reference usage report from J26.

## How to Integrate

### Option A — Subdirectory (recommended)

Drop this folder into your project as a subdirectory. The `CLAUDE.md` at the root of this folder will automatically scope Claude Code's instructions when working inside it, without interfering with your existing root-level `CLAUDE.md`.

```
your-app/
├── CLAUDE.md              ← your existing file, unchanged
├── ...your code...
└── modules/keck-matching/
    ├── CLAUDE.md           ← Keck-specific instructions (included)
    ├── data/
    │   └── consultant_expertise.csv
    ├── docs/
    │   ├── SKILL_reviewer_matching.md
    │   ├── PROJECT_CONTEXT.md
    │   └── J26_usage_report.md
    └── src/
        └── reviewer_matcher.jsx
```

The path `modules/keck-matching/` is a suggestion — use whatever directory name fits your project structure. The only requirement is that `CLAUDE.md` sits at the root of the Keck module folder.

### Option B — Add a pointer to your root CLAUDE.md

If other parts of your app need to call into the matching logic (e.g., importing the reviewer data or the JSX component), add a short reference at the bottom of your existing root `CLAUDE.md`:

```markdown
## Keck Reviewer Matching Module
See `modules/keck-matching/CLAUDE.md` for domain-specific instructions
on reviewer matching, CSV schema, and expertise boundary constraints.
```

This keeps your root file clean while ensuring Claude Code knows to look there when relevant.

### Option C — Both

Use the subdirectory CLAUDE.md for detailed instructions AND add the pointer to your root file. This is useful if Keck matching is tightly integrated with other modules.

## Contents

| File | Purpose |
|---|---|
| `CLAUDE.md` | Claude Code instructions for this module — matching rules, expertise boundaries, PD domains, CSV schema, known gaps |
| `data/consultant_expertise.csv` | Master reviewer database (38 entries, 13 columns). All internal lists use semicolons, never commas. |
| `src/reviewer_matcher.jsx` | React component with two tabs: AI-powered proposal matching (calls Claude API) and filterable roster browser |
| `docs/SKILL_reviewer_matching.md` | Full operational procedures — Mode A (Phase I batch of 100–300 proposals) and Mode B (individual Phase II matching) |
| `docs/PROJECT_CONTEXT.md` | Complete project context: roster details, matching conventions, CSV formatting rules, known expertise gaps |
| `docs/J26_usage_report.md` | J26 Phase I usage statistics — PD loads, board engagement, consultant assignments, per-reviewer narratives |

## What Claude Code Needs to Know

The `CLAUDE.md` file is designed to give Claude Code everything it needs for day-to-day tasks (matching, CSV edits, gap flagging) in a compact format. For complex operations like full Phase I batch processing, it references `docs/SKILL_reviewer_matching.md` for the complete step-by-step workflow.

Key constraints that Claude Code must always enforce:

1. **Expertise boundaries** — Several reviewers have domains that sound similar but are critically different (e.g., quantum materials ≠ quantum computing; synthetic biology ≠ synthetic organic chemistry). These are spelled out in `CLAUDE.md`.
2. **Non-scientific board members** — Bradway, Foster, and Kresa provide industry/strategic perspectives only, never scientific peer review. Must be labeled clearly when recommended.
3. **Gap flagging** — If no roster member can evaluate a proposal's core claims, Claude Code should say so and describe the missing expertise rather than force-fitting a poor match.

## The React Component

`reviewer_matcher.jsx` is a standalone React component that:
- Embeds the full 38-person reviewer roster as structured data
- Provides AI-powered matching via the Anthropic API (Claude Sonnet)
- Includes a browse/filter mode for the full roster
- Requires no API key in the code (handled by the hosting environment)

To integrate it into your app, import it as a component. It has no external dependencies beyond React.

## CSV Maintenance

When adding or editing reviewers in `consultant_expertise.csv`:
- **No commas** in any field — use semicolons for all internal lists
- **Keywords**: exactly 5–6 terms; no institution or award names
- **Expertise**: domain-level summaries only — no paper citations, lab names, or program names
- **ORCID**: full URL (`https://orcid.org/...`) or `N/A`
- Full rules are in `CLAUDE.md` and `docs/PROJECT_CONTEXT.md`
