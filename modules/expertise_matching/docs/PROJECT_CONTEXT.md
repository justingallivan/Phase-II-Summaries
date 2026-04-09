# W.M. Keck Foundation — Reviewer Matching Project

## Project Purpose
This project supports Beth (Program Officer, W.M. Keck Foundation) in matching research proposals to the most qualified reviewers from a database of consultants, board members, and research program staff. The primary deliverable is expert reviewer recommendations for Phase I screening and Phase II review across both the Medical Research (MR) and Science & Engineering (S&E) programs.

## Key Files
- **`consultant_expertise.csv`** — Master database of reviewers with structured expertise profiles (see schema below). Current version: 38 entries (25 consultants, 9 board members, 4 research program staff).
- **`reviewer_matcher.jsx`** — React dashboard for browsing, filtering, and AI-assisted matching of the reviewer database.

## CSV Schema (13 columns)
| Column | Description |
|---|---|
| Name | Full name |
| Role_Type | Consultant / Board / Research Program Staff |
| Role | Title only (no institution) |
| Affiliation | Institution |
| ORCID | Full URL (https://orcid.org/...) or N/A |
| Primary_Fields | 2–4 broad disciplinary areas |
| Keywords | 5–6 most distinctive expertise terms (semicolon-delimited) |
| Subfields_Specialties | Detailed research areas (semicolon-delimited) |
| Methods_Techniques | Specific experimental/computational methods |
| Distinctions | Fellowships; society memberships; named awards; prizes (no pre-PhD distinctions except Hertz/NIH/NSF) |
| Expertise | Concise research strengths and proposal review relevance; domain-level only — no paper citations, lab names, or specific publication references |
| Keck_Affiliation | None / Past Grantee / Board Member / Board Member; Past Grantee / Research Program Staff |
| Keck_Affiliation_Details | Specific grant history or role details |

## Formatting Rules
- **No commas in any data field** — all internal lists use semicolons
- **Role column**: titles only, no institution names
- **Keywords**: 5–6 terms maximum, no institutional or award names
- **Distinctions**: fellowships and honors only; no job history; no pre-PhD distinctions except Hertz/NIH/NSF fellowships
- **Expertise**: research strengths + review relevance; **no citations, no paper titles, no lab or program names, no funding portfolio details** — domain-level summaries only
- **ORCID**: full URLs or N/A

## Current Roster (38 entries)

### Research Program Staff (4) — Primary proposal reviewers
- **Beth L. Pruitt** — CSO, Keck Foundation / UCSB (on leave); bioengineering/mechanobiology; MEMS, cell mechanics, iPSC cardiomyocytes
- **Justin Gallivan** — Senior Program Director S&E; chemistry/synthetic biology; riboswitches, directed evolution, microbiome engineering
- **Kevin Moses** — Senior Program Director; developmental biology/genetics; Drosophila, EGF/Hedgehog/Notch signaling
- **Jean J. Kim** — Senior Program Director MR; neuroscience/stem cell biology; iPSC disease modeling, neurodevelopmental disorders

### Board Members (9)
- **Andrea M. Ghez** — UCLA; observational astrophysics; galactic center, black holes, adaptive optics (Nobel 2020; Board + Past Grantee)
- **William R. Brody** — Keck Foundation; radiology/biomedical engineering; MRI, CT, digital angiography, AI in radiology (Board)
- **James S. Economou** — UCLA; surgical oncology/tumor immunology; CAR-T, cancer immunotherapy (Board; also serves as consultant on MR proposals)
- **Kelsey C. Martin** — UCLA/Simons Foundation; neuroscience/RNA biology; synaptic plasticity, local translation, epitranscriptomics (Board + Past Grantee)
- **Edward M. Stolper** — Caltech; geology/geochemistry; igneous petrology, planetary science (Board; also serves as consultant on SE proposals)
- **Kent Kresa** — Keck Foundation; aerospace/defense systems engineering; Northrop Grumman (Board; systems perspective only)
- **Thomas E. Everhart** — Caltech Trustee Emeritus; electron physics; SEM instrumentation, electron optics (Board; genuine scientific reviewer)
- **Robert A. Bradway** — Amgen; biopharmaceutical industry; biologics, ADC, precision oncology (Board; industry/translational perspective only — NOT scientific peer review)
- **Richard N. Foster** — Millbrook Management Group; innovation strategy/R&D economics (Board; strategic perspective only — no scientific review role)

### Consultants (25, including 1 TBD)
**Physics & Engineering**
- **John E. Sader** — Caltech; AFM, NEMS/MEMS, fluid-structure interaction, nanomechanics
- **David Goldhaber-Gordon** — Stanford; quantum transport, 2D materials, correlated electrons, topological matter (Past Keck Grantee) [NOTE: condensed matter physics ≠ quantum computing]
- **Douglas Natelson** — Rice; nanoscale transport, strongly correlated electrons, plasmonics, molecular junctions
- **Jack G.E. Harris** — Yale; quantum optomechanics, phonons, superfluid mechanics, quantum measurement
- **Aydogan Ozcan** — UCLA; computational imaging, AI-driven optics, holographic microscopy, lab-on-chip

**Materials Science & Chemistry**
- **Ram Seshadri** — UCSB; functional inorganic materials, solid-state chemistry, thermoelectrics, battery materials
- **Craig E. Manning** — UCLA; metamorphic petrology, geofluids, deep Earth geochemistry [NOTE: geochemistry complement to Stolper's petrology/planetary focus]

**Soft Matter, Biophysics & Active Matter**
- **M. Cristina Marchetti** — UCSB; active matter theory, collective cell behavior, tissue mechanics, nonequilibrium systems

**Computational Biology & Genomics**
- **Sean R. Eddy** — Harvard; sequence analysis, RNA structure, hidden Markov models, comparative genomics
- **Katherine S. Pollard** — Gladstone/UCSF; evolutionary genomics, human accelerated regions, microbiome genomics
- **Gene W. Yeo** — UCSD; RNA biology, alternative splicing, RNA-binding proteins, CLIP-seq
- **Trey Ideker** — UCSD; network biology, systems cancer biology, multi-omics integration
- **Jason E. Stajich** — UC Riverside; evolutionary genomics, fungal genomics, microbial phylogenomics
- **Paul D. Thomas** — USC; functional genomics, gene ontology, comparative genomics
- **Sheng Li** — USC Keck; ML for cancer epigenomics, deep learning for genomics
- **Jason Ernst** — UCLA; regulatory genomics, chromatin state modeling, epigenomics, deep learning
- **Sriram Sankararaman** — UCLA; population genetics, statistical genomics, human genetic variation
- **Eran Halperin** — UCLA; statistical genomics, computational biology, admixture analysis
- **Harold Pimentel** — UCLA; transcriptomics, RNA-seq statistics, differential expression

**Biomedical Imaging & Data Science**
- **B.S. Manjunath** — UCSB; bioimage informatics, computer vision, spatial omics imaging
- **Nina Miolane** — UCSB; geometric/topological ML, computational anatomy, biological shape analysis
- **Alex Bui** — UCLA; clinical informatics, medical AI, health data science
- **Wei Wang** — UCLA; data mining, ML for bioinformatics, computational biology

**Astrophysics & Data Science**
- **S. George Djorgovski** — Caltech; astroinformatics, ML for astronomical surveys, time-domain astronomy

**TBD (Priority Recruit)**
- **TBD: Neurodegeneration specialist** — AD cell biology: tau propagation, amyloid processing, microglial activation, neuroinflammation; needed for 6 MR proposals pending in J26

## Reviewer Matching Approach

### Process
1. Read the full proposal (abstract + aims + methods + PI biosketch)
2. Identify the 3–5 core disciplinary areas and key methods
3. Match against the CSV — assess each entry honestly for coverage
4. Flag genuine expertise gaps not covered by any roster member
5. Recommend a primary panel (2–3) and note secondary options

### Important Conventions
- **Do not apply S&E vs. MR program distinctions as a constraint on reviewer eligibility** — these are committee structure artifacts, not expertise boundaries
- **Be honest about gaps** — if no roster member can credibly evaluate a proposal's core claims, say so explicitly and describe what expertise is missing
- **Distinguish partial from strong matches** — a reviewer who can evaluate one component but not another should be labeled as such
- **Research Program Staff are eligible reviewers** — treat them like any other roster entry for matching purposes
- **Depth over breadth** — prefer reviewers who can critically evaluate the central scientific claims over generalists who can only assess peripheral aspects
- **Board members with non-scientific roles**: Bradway (industry perspective only), Foster (strategy perspective only), and Kresa (systems engineering perspective) should never be listed as scientific peer reviewers; flag explicitly if their perspective is nonetheless relevant

### Known Expertise Boundaries (do not conflate)
- **Goldhaber-Gordon**: condensed matter physics and quantum materials — NOT quantum computing algorithms or quantum information science
- **Gallivan**: biochemistry/synthetic biology chemistry — NOT synthetic organic chemistry or medicinal chemistry
- **Marchetti**: theoretical/computational active matter and soft matter — NOT experimental cell biology
- **Djorgovski**: astrophysics data science — NOT general ML for biology or medicine
- **Bradway**: biopharmaceutical industry judgment — NOT scientific peer review of molecular mechanisms
- **Economou** and **Stolper**: board members who can serve as genuine consultants on proposals in their core domains — treat them as consultants when assigning to proposals outside their formal board interest list

### Expertise Gaps Identified in J26 (inform future recruitment)
The following domains are not well covered by the current roster and recurred as gaps in J26 Phase I:
- **Alzheimer's disease / neurodegeneration cell biology** — tau, amyloid, microglia, neuroinflammation (PRIORITY: 6 J26 proposals unassigned)
- **Quantum computing algorithms / quantum information science** — distinct from quantum materials/condensed matter
- **Synthetic organic / medicinal chemistry** — distinct from Gallivan's biochemistry
- **Computational chemistry / structure-based drug discovery** — not covered
- **Atmospheric science / cloud microphysics** — 1 J26 gap
- **Plasma physics** — 1 J26 gap
- **Seismology / tectonic geophysics** — 2 J26 gaps (partially covered by Stolper/Manning for geochemistry; need seismologist)
- **Lupus / autoimmune rheumatology** — 1 J26 gap

## Phase I Batch Assignment Workflow (J26 experience)

When handling a full Phase I batch (100–300 proposals), the workflow is:

### Step 1 — Ingest proposals
Load the proposals spreadsheet. Required columns: application #, program (MR/SE), institution, PI name, title, summary.

### Step 2 — Assign Lead PD
Assign each proposal to the primary staff reviewer (Gallivan, Moses, Kim, or Pruitt) based on scientific domain. Key principles:
- Kim: iPSC, neuroscience (MR), stem cell biology, cancer genomics, immune-cell biology
- Gallivan: synthetic biology, RNA regulatory mechanisms, microbiology, chemical biology, organic chemistry-adjacent SE proposals
- Moses: developmental biology, genetics, evo-devo, model organisms, signaling pathways; serves as generalist backup
- Pruitt: all condensed matter physics, MEMS/nanofabrication, quantum sensing, soft matter mechanics, optical instrumentation SE proposals
- Target load distribution: no PD should exceed ~70 proposals; aim for balance weighted by domain density

### Step 3 — Assign Secondary PD
Each proposal gets a secondary PD — the next-best staff member to consult if the lead PD has a conflict or needs backup. Flag cases where Pruitt is scientifically strongest but assigned as secondary for load management (these should be clearly noted for follow-up).

### Step 4 — Assign Consultants
For proposals requiring specialist depth beyond staff expertise, assign 1–2 consultants from the roster. Cap at 10 proposals per consultant to avoid overloading any individual. Dual-role board members (Economou, Stolper) can serve as consultants on additional proposals beyond their board interest list.

### Step 5 — Flag Board Interest
For each board member, identify proposals of genuine scientific interest (not courtesy assignments). Board members with scientific expertise (Ghez, Brody, Martin, Economou, Stolper, Everhart) should be flagged only where their specific domain overlaps. Non-scientific board members (Bradway, Foster, Kresa) should be flagged only where their industry/strategic perspective genuinely adds value, and always labeled clearly as such.

### Step 6 — Keck Fit Assessment
Flag proposals that are MISFIT (does not meet Keck mission) or BORDERLINE (fundable but framing concerns). Keck funds fundamental discovery science, not applied R&D or technology commercialization. Use this to catch proposals that should be declined or sent back for framing revision before Phase II.

### Step 7 — Output
Primary deliverable: Excel workbook with sheets for Reviewer Assignments, Rationale Detail, per-board-member interest lists, Keck Fit Review, Reviewer Usage statistics, Consultant Recruitment gaps, and Expertise Coverage. Secondary deliverable: Word usage report with narrative assessment of each reviewer's load and coverage rationale.

## Adding New Entries to the CSV
When adding a new reviewer:
1. Research via web search: institutional page, Google Scholar, PubMed, ORCID
2. Verify current affiliation (institutions change)
3. Fill all 13 columns following schema and formatting rules above
4. Keywords: choose 5–6 most distinctive terms — avoid institutional names, award names, or terms duplicated in Primary_Fields
5. Distinctions: fellowships and honors only; apply the no-pre-PhD rule (except Hertz/NIH/NSF)
6. Expertise: 2–3 sentences max; domain-level only — no citations or paper titles; end with "Relevant for [program type] proposals in [fields]"
7. Check that no commas appear in any field
8. Verify ORCID as full URL

## Proposal Analysis Approach
When reading a Phase I or Phase II proposal for reviewer matching:
- Note PI institution, program (MR vs S&E), requested amount, project period
- Identify: (1) central scientific question, (2) key methodologies, (3) disciplinary home(s), (4) any applied/translational components
- Flag if the proposal is genuinely basic science vs. methods/technology development vs. applied — this affects which reviewer expertise matters most
- Check for PI conflicts: if a current roster member is a PI on the proposal, exclude them and note the conflict
