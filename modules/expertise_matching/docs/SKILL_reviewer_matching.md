# SKILL: Keck Proposal Reviewer Matching

## When to Use This Skill
Use when Beth uploads W.M. Keck Foundation proposal PDFs (Phase I batch or individual Phase II) and asks for reviewer recommendations, or when asked to update/expand `consultant_expertise.csv`, or when asked to produce the Phase I assignment workbook and usage report.

---

## Mode A — Phase I Batch Assignment (100–300 proposals)

Use this mode when given a spreadsheet of Phase I proposals. Deliverables are an Excel workbook and a Word usage report.

### Step 1 — Load Data
- Load proposals spreadsheet (columns: application #, program MR/SE, institution, PI, title, summary)
- Load `consultant_expertise.csv` (currently 38 entries)

### Step 2 — Assign Lead PD
Assign each proposal to the primary staff PD based on scientific domain:

| PD | Core domains |
|---|---|
| **Jean Kim** | iPSC disease modeling; neurodegenerative disease; neuronal molecular biology; stem cell biology; cancer genomics; immune-cell biology; cardiac arrhythmia modeling |
| **Justin Gallivan** | Synthetic biology; RNA regulatory mechanisms; riboswitches; microbiome; chemical biology; biochemistry-adjacent SE proposals; environmental sensing |
| **Kevin Moses** | Developmental biology; genetics; evo-devo; model organism biology (Drosophila; zebrafish; C. elegans); Wnt/Hedgehog/Notch/EGF signaling; regenerative biology; neurodevelopment |
| **Beth L. Pruitt** | Condensed matter physics; MEMS/NEMS/nanofabrication; quantum sensing and instrumentation; cryogenic systems; soft matter mechanics; optical instrumentation; cell mechanics and mechanobiology |

**Key distinctions:**
- Gallivan's chemistry = biochemistry/synthetic biology, NOT synthetic organic or materials chemistry
- Pruitt handles ALL condensed matter physics SE proposals — Moses and Gallivan have no coverage here
- Moses serves as the broadest generalist backup; use him for developmental biology across both programs
- When load imbalance develops, move proposals to the next-best PD and mark them with a secondary-PD asterisk flag for follow-up

**Target load**: aim for roughly equal distribution. Flag if any PD exceeds 70 proposals. In J26: Kim 65, Gallivan 63, Moses 55, Pruitt 47 (Pruitt's lower count reflects the narrower SE physics domain, not underutilization).

### Step 3 — Assign Secondary PD
For every proposal, add a secondary PD — the next-best staff member to consult if the lead has a conflict or gap. Use this column to flag Pruitt as secondary where she was scientifically strongest but moved to secondary for load management (mark with asterisk and note "loop her in on review").

### Step 4 — Assign Consultants (cap: 10 per person)
For proposals requiring specialist depth beyond staff expertise, assign 1–2 consultants. Reference the consultant roster and their domain coverage. Do not exceed 10 proposals per consultant. Dual-role board members (Economou: tumor immunology; Stolper: geochemistry/petrology) can be assigned as consultants beyond their formal board interest list when the proposal is in their core domain.

**Consultant assignment priorities:**
- Condensed matter / quantum materials: Goldhaber-Gordon, Natelson, Harris (do not use for quantum computing claims)
- Materials science / solid-state chemistry: Seshadri, Manning (geochemistry)
- Computational biology / genomics: Eddy, Pollard, Yeo, Stajich, Thomas, Pimentel (RNA-seq)
- Cancer genomics / epigenomics: Sheng Li, Ernst, Ideker, Sankararaman, Halperin
- Biomedical imaging / AI: Ozcan, Manjunath, Miolane, Bui, Wei Wang
- Active matter / biophysics: Marchetti
- Astrophysics / data science: Ghez (board), Djorgovski
- Tumor immunology (board+consultant): Economou
- Geochemistry / planetary science (board+consultant): Stolper

### Step 5 — Flag Board Interest
Identify proposals of genuine scientific interest per board member. Only flag where there is real domain overlap — not courtesy assignments.

| Board Member | Scientific basis for flagging |
|---|---|
| William R. Brody | Medical imaging hardware; AI in radiology; biomedical instrumentation |
| Kelsey C. Martin | Synaptic plasticity; local mRNA translation; RNA biology; memory circuits |
| James S. Economou | Tumor immunology; cancer immunotherapy; CAR-T; tumor microenvironment |
| Edward M. Stolper | Geochemistry; petrology; planetary science; prebiotic chemistry |
| Andrea M. Ghez | Astrophysics; adaptive optics; gravitational physics; high-res instrumentation |
| Thomas E. Everhart | SEM instrumentation; electron beam physics; electron optics |
| Kent Kresa | Aerospace; defense systems engineering — systems perspective only |
| Robert A. Bradway | Biologics/ADC/oncology pipeline — INDUSTRY PERSPECTIVE ONLY, not scientific review |
| Richard N. Foster | R&D strategy — no proposals flagged in J26; include only if clear strategic relevance |

Board members with non-scientific roles (Bradway, Foster, Kresa) must be labeled clearly when flagged. Bradway flagged for 5 proposals in J26; Foster for 0.

### Step 6 — Keck Fit Assessment
Flag proposals as:
- **STRONG**: exemplary basic discovery science, clearly fundable
- **GOOD**: solid Keck fit (default for unflagged proposals)
- **BORDERLINE**: potentially fundable but framing needs scrutiny before Phase II
- **MISFIT**: does not meet Keck mission — recommend decline (applied R&D, commercialization, clinical trials, incremental work)

In J26: 4 MISFITS, 10 BORDERLINE out of 230 total.

### Step 7 — Flag Expertise Gaps
After all assignments, identify proposals where NO consultant adequately covers a key scientific claim. Describe what is missing and why it matters. In J26, the only unfilled priority gap was AD/neurodegeneration cell biology (6 proposals).

### Step 8 — Build Outputs
**Excel workbook** (12 sheets):
1. Reviewer Assignments — all proposals; Lead PD, Secondary PD (with asterisk flags), Board Interest, Consultant(s), Keck Fit, rationale summary, gap flag
2–N. Per-board-member interest sheets (one per board member with proposals)
N+1. Rationale Detail — full written rationale per proposal
N+2. Keck Fit Review — MISFIT and BORDERLINE proposals with assessment notes
N+3. Reviewer Usage — PD distribution (SE/MR %), board engagement, consultant usage
N+4. Consultant Recruitment — unfilled TBD profiles and small coverage gaps
N+5. Expertise Coverage — one row per roster member

**Word usage report** (6 sections):
1. PD distribution table with SE/MR breakdown
2. Board engagement table (board interest counts + consultant dual-role tallies)
3. Consultant usage table
4. Staff expertise narrative (one paragraph per PD)
5. Board member profiles (one paragraph per board member)
6. Consultant profiles (one paragraph per consultant + TBD)

---

## Mode B — Individual Phase II Reviewer Matching

Use this mode when given a single proposal PDF.

### Step 1 — Read the Proposal
Extract:
- **Program**: Medical Research or Science & Engineering
- **Institution** and **PI name**
- **Project title** and **requested amount**
- **Core scientific question** (1 sentence)
- **Key methods** (list the 3–5 most technically demanding)
- **Disciplinary home(s)**
- **Nature of work**: basic science / methods development / applied / translational
- **Check for conflicts**: is any current roster member a PI or named collaborator?

### Step 2 — Match Roster
For each roster member, assess honestly:
- **Strong match**: can critically evaluate the central scientific claims
- **Partial match**: can evaluate one component but not others — specify which
- **No match**: expertise does not overlap meaningfully — do not recommend

Do NOT default to the closest match if the match is genuinely poor. Flag the gap explicitly.

### Step 3 — Check for Gaps
After matching, ask: are there core aspects this proposal that NO roster member can credibly evaluate? If yes:
- Describe what expertise is missing
- Explain why it matters for evaluating this proposal
- Sketch the profile an outside consultant should have

### Step 4 — Output
**Proposal summary** (2–3 sentences: what it is, why it's Keck-appropriate)

**Recommended panel** (2–3 names with rationale):
- Name — why they're the right match, what they can evaluate specifically

**Secondary options** (if relevant)

**Expertise gaps** (specific: what's missing and why it matters)

**Not recommended** (briefly flag any roster members who might seem superficially relevant but are actually poor fits — prevents mis-assignment)

---

## Conventions and Constraints

- **S&E vs. MR program labels are NOT constraints on reviewer eligibility** — these are committee structure artifacts, not expertise boundaries
- **Research Program Staff are eligible reviewers** — treat them like any other roster entry
- **Board members can serve as reviewers** — note their board role; Economou and Stolper can also serve as consultants on proposals in their core domains
- **Expertise boundaries to never conflate**:
  - Goldhaber-Gordon: quantum materials/condensed matter ≠ quantum computing algorithms
  - Gallivan: biochemistry/synthetic biology ≠ synthetic organic/medicinal chemistry
  - Marchetti: active matter theory ≠ experimental cell biology
  - Bradway: industry judgment ≠ scientific peer review
  - Kresa: systems engineering ≠ scientific peer review
- **Depth over breadth**: prefer reviewers who can critically evaluate the central scientific claims over generalists who can only assess peripheral aspects
- **PI conflicts**: if a roster member is a PI or named co-investigator on a proposal, exclude them from that proposal's reviewer panel and note the conflict explicitly

---

## CSV Maintenance

### Adding a new entry
1. Web search: "[Name] [Institution]" + Google Scholar or lab page
2. Verify current affiliation (do not assume stability)
3. Fill all 13 columns per schema in PROJECT_CONTEXT.md
4. Run a comma-check: no commas allowed in any field (use semicolons throughout)
5. ORCID: full URL format https://orcid.org/[ID] or N/A
6. Keywords: exactly 5–6 terms; no institution names; no award names; no terms already captured in Primary_Fields
7. Distinctions: honors/fellowships only; no pre-PhD distinctions except Hertz/NIH/NSF; no job history
8. Expertise: domain-level summary only — no citations, no paper titles, no lab names; end with "Relevant for [X] proposals in [fields]"

### Editing an existing entry
- Always view the full current entry before editing
- When updating affiliation, also check and update Role if title changed
- When correcting Keywords, maintain the 5–6 term limit
- After any edit, verify no commas were introduced
- Do not add individual publications or citation-style references to any Expertise field

### Schema reference (13 columns in order)
Name, Role_Type, Role, Affiliation, ORCID, Primary_Fields, Keywords, Subfields_Specialties, Methods_Techniques, Distinctions, Expertise, Keck_Affiliation, Keck_Affiliation_Details

### Expertise field policy
All Expertise fields must be written as domain-level summaries only. Do not include:
- Paper citations or titles
- Named grants or programs
- Lab names or center names
- Specific publications as proxies for expertise
This policy ensures individual papers are not over-weighted in future matching sessions and keeps the field useful as a concise expertise summary rather than a CV snippet.

---

## Known Gaps — Priority Consultant Recruitment

Based on J26 experience, the following expertise areas are recurring gaps in the current roster. When recruiting new consultants, prioritize:

| Priority | Domain | Proposals affected in J26 | Notes |
|---|---|---|---|
| 1 | Alzheimer's disease / neurodegeneration cell biology | 6 MR proposals | Tau propagation; amyloid processing; microglial activation; neuroinflammation. Not covered by Kim (iPSC platform) or any current consultant. |
| 2 | Quantum computing / quantum algorithms | 1+ SE proposals | Distinct from Goldhaber-Gordon's condensed matter quantum materials expertise. |
| 3 | Seismology / tectonic geophysics | 2 SE proposals | Stolper and Manning cover geochemistry/petrology; neither covers seismic methods or tectonic dynamics. |
| 4 | Synthetic organic / medicinal chemistry | Recurring | Gallivan covers biochemistry/synthetic biology only. No synthetic organic chemist on roster. |
| 5 | Plasma physics | 1 SE proposal | No coverage. |
| 6 | Atmospheric science / cloud microphysics | 1 SE proposal | No coverage. |
