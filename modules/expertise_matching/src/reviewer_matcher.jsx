import { useState } from "react";

const REVIEWERS = [
  {
    name: "John E. Sader",
    role_type: "Consultant",
    role: "Professor",
    affiliation: "California Institute of Technology",
    orcid: "https://orcid.org/0000-0002-7096-0627",
    primary_fields: "Applied Mathematics; Physics; Engineering",
    keywords: "AFM; NEMS/MEMS; fluid-structure interaction; rarefied gas dynamics; nanomechanics",
    subfields: "Fluid mechanics; Solid mechanics; Nanomechanics; Rarefied gas dynamics; Plasmonics; Colloid science; Mass spectrometry; Fluid-structure interaction; Vortex dynamics",
    methods: "Atomic force microscopy (AFM) cantilever calibration (Sader Method); Lattice Boltzmann method; Linear/nonlinear oscillatory flow analysis; Nanoelectromechanical systems (NEMS)",
    distinctions: "Fellow Australian Academy of Science; Fellow Australian Mathematical Society; Fellow Australasian Fluid Mechanics Society",
    expertise: "Micro/nanomechanical systems; AFM theory and cantilever calibration; fluid-structure interaction at small scales; rarefied gas dynamics; plasmonics; colloid science. Relevant for S&E proposals in nanoscale instrumentation; MEMS/NEMS; and quantitative biophysics.",
    keck_affiliation: "",
  },
  {
    name: "Ram Seshadri",
    role_type: "Consultant",
    role: "Professor",
    affiliation: "University of California Santa Barbara",
    orcid: "https://orcid.org/0000-0001-5858-4027",
    primary_fields: "Materials Science; Solid State Chemistry; Condensed Matter Physics",
    keywords: "functional inorganic materials; solid-state chemistry; thermoelectrics; phosphors; battery materials",
    subfields: "Crystal chemistry; Structure-property relations in functional inorganic materials; Phosphors/solid-state lighting; Magnetics; Thermoelectrics; Ferroics/multiferroics; Photovoltaics; Battery materials; Magnetocalorics; Frustrated magnetism; Polar materials; Oxide nanomaterials; Heterogeneous catalysis",
    methods: "First-principles electronic structure calculations; Solvothermal synthesis; Structural characterization; Neutron/X-ray diffraction; Compositional tuning/solid solution",
    distinctions: "Fellow American Physical Society; Fellow Royal Society of Chemistry; Fellow Materials Research Society",
    expertise: "Functional inorganic materials including thermoelectrics; phosphors/solid-state lighting; magnetics; battery cathodes; multiferroics; and photovoltaics. Strong in structure-property relationships and first-principles computation. Relevant for S&E proposals in solid-state chemistry and energy materials.",
    keck_affiliation: "",
  },
  {
    name: "David Goldhaber-Gordon",
    role_type: "Consultant",
    role: "Professor",
    affiliation: "Stanford University",
    orcid: "https://orcid.org/0000-0001-8549-0560",
    primary_fields: "Condensed Matter Physics; Mesoscopic Physics; Nanoelectronics",
    keywords: "quantum transport; correlated electrons; topological matter; 2D materials; nanofabrication",
    subfields: "Quantum transport in low-dimensional materials; Kondo effect; Quantum dots and quantum point contacts; 2D electron gases; Graphene physics; Topological insulators; Moiré superlattices; Quantum anomalous Hall effect; Fractional Chern insulators; Twisted bilayer graphene; Electron-electron interactions; Quantum criticality; Non-Fermi liquids; Delafossite metals",
    methods: "Cryogenic transport measurements (millikelvin); Nanofabrication; Scanning gate microscopy; Ionic liquid gating; van der Waals heterostructure assembly; Precision electrical measurements",
    distinctions: "Fellow American Physical Society; Oliver E. Buckley Condensed Matter Prize (APS) 2023",
    expertise: "Quantum transport in low-dimensional and correlated electron systems; topological matter; moiré superlattices; 2D materials; nanoscale device physics. Past Keck grantee. Relevant for S&E proposals in condensed matter physics and quantum materials.",
    keck_affiliation: "Past Grantee",
  },
  {
    name: "M. Cristina Marchetti",
    role_type: "Consultant",
    role: "Professor",
    affiliation: "University of California Santa Barbara",
    orcid: "https://orcid.org/0000-0003-3583-4999",
    primary_fields: "Theoretical Physics; Soft Matter Physics; Biological Physics; Nonequilibrium Statistical Mechanics",
    keywords: "active matter; biological physics; collective cell behavior; soft matter theory; nonequilibrium systems",
    subfields: "Active matter theory; Active nematics; Collective cell migration; Tissue mechanics and rheology; Motility-induced phase separation; Topological defects in active fluids; Flocking and self-propelled particles; Wound healing biophysics; Morphogenesis; Bacterial dynamics",
    methods: "Continuum hydrodynamic theory; Bottom-up and top-down modeling; Computational simulation; Vertex models; Phase-field models; Nonequilibrium statistical mechanics",
    distinctions: "NAS member; Fellow American Physical Society; Simons Investigator",
    expertise: "Theory of active matter; collective cell migration; tissue mechanics; motility-induced phase separation; topological defects in active fluids. Relevant for S&E proposals at the physics-biology interface including cell motility; tissue mechanics; and emergent collective behavior.",
    keck_affiliation: "",
  },
  {
    name: "Douglas Natelson",
    role_type: "Consultant",
    role: "Professor",
    affiliation: "Rice University",
    orcid: "https://orcid.org/0000-0003-2370-9859",
    primary_fields: "Condensed Matter Physics; Nanoscience; Nanoelectronics",
    keywords: "strongly correlated electrons; nanoscale transport; plasmonics; molecular junctions; nanofabrication",
    subfields: "Strongly correlated electron materials; Nanoscale quantum transport; Atomic- and molecular-scale junctions; Plasmonics and nano-optics; Spin transport in magnetic insulators; Organic semiconductors; Quantum coherence and decoherence; Nonequilibrium quantum systems; Photothermoelectric effects; Strange metals; VO2 and transition metal oxides",
    methods: "Nanofabrication; Low-temperature electrical transport; Single-molecule Raman spectroscopy; Scanning tunneling microscopy; Electromigration nanogap fabrication; Surface-enhanced infrared absorption; Current noise measurements; Ionic liquid gating",
    distinctions: "Fellow American Physical Society",
    expertise: "Nanoscale charge; spin; and heat transport; strongly correlated electron materials; plasmonics; molecular junctions; nonequilibrium quantum systems. Relevant for S&E proposals in condensed matter physics; nanoscale devices; and energy conversion.",
    keck_affiliation: "",
  },
  {
    name: "Andrea M. Ghez",
    role_type: "Board",
    role: "Professor",
    affiliation: "University of California Los Angeles",
    orcid: "https://orcid.org/0000-0003-3230-5055",
    primary_fields: "Observational Astrophysics; Galactic Astronomy; Gravitational Physics",
    keywords: "observational astrophysics; supermassive black holes; galactic center; adaptive optics; general relativity",
    subfields: "Supermassive black holes; Galactic center dynamics; Stellar orbital mechanics near black holes; Tests of general relativity in strong gravity; Galaxy formation and evolution; Star formation in extreme environments; High-resolution infrared astronomy",
    methods: "Adaptive optics (Keck Observatory); Near-infrared imaging and spectroscopy; Speckle imaging; Stellar kinematics and astrometry",
    distinctions: "Nobel Prize in Physics 2020; NAS member; MacArthur Fellow; Crafoord Prize 2012",
    expertise: "Observational astrophysics; galactic center dynamics; supermassive black holes; tests of general relativity in strong gravity; adaptive optics instrumentation. Past Keck grantee with extensive Keck Observatory research history. Relevant for S&E proposals in astronomy; astrophysics; and high-resolution instrumentation.",
    keck_affiliation: "Board Member; Past Grantee",
  },
  {
    name: "William R. Brody",
    role_type: "Board",
    role: "Trustee",
    affiliation: "W.M. Keck Foundation",
    orcid: null,
    primary_fields: "Radiology; Biomedical Engineering; Medical Imaging; Electrical Engineering",
    keywords: "medical imaging; dual-energy X-ray subtraction; digital subtraction angiography; cardiovascular imaging; medical instrumentation",
    subfields: "Cardiovascular imaging; CT; MRI; Dual-energy X-ray subtraction imaging; Digital subtraction angiography; Hybrid subtraction angiography; Gated cardiac CT; Doppler ultrasound; Medical acoustics; Digital radiography; Cancer imaging; AI in radiology; Medical device development",
    methods: "Dual-energy scanned projection radiography; Hybrid subtraction angiography; Gated cardiac CT; Intravenous digital subtraction angiography; Doppler ultrasound flowmetry; MRI system development; Quantitative cardiovascular imaging",
    distinctions: "NAM member; NAE member; Fellow American Academy of Arts and Sciences; Fellow IEEE; Fellow ISMRM; Fellow American College of Radiology; Fellow American College of Cardiology; Gold Medal Radiological Society of North America 2010; Fellow American Institute for Medical and Biological Engineering; IEEE Medal for Innovations in Healthcare Technology",
    expertise: "Physician-scientist and inventor whose first- and last-author research established foundational methods in medical imaging: Doppler ultrasound flowmetry; dual-energy X-ray subtraction imaging (sole-inventor US patent); intravenous digital subtraction angiography; hybrid subtraction angiography; and gated cardiac CT. More than 100 publications spanning cardiovascular imaging; CT; MRI; digital radiography; and medical acoustics. Co-founded multiple medical device companies translating imaging innovations into clinical products. Relevant for Medical Research and S&E proposals in medical imaging; biomedical instrumentation; cardiovascular imaging; and AI in radiology.",
    keck_affiliation: "Board Member",
  },
  {
    name: "James S. Economou",
    role_type: "Board",
    role: "Professor of Surgery",
    affiliation: "University of California Los Angeles",
    orcid: null,
    primary_fields: "Surgical Oncology; Tumor Immunology; Cancer Immunotherapy; Gene Therapy",
    keywords: "tumor immunology; cancer immunotherapy; CAR-T; adoptive cell therapy; surgical oncology",
    subfields: "Adoptive cell therapy; CAR-T cell therapy; TCR-engineered T cells; Dendritic cell vaccination; DNA vaccines; Cytokine biology; Melanoma immunotherapy; Hepatocellular carcinoma immunotherapy; Gene therapy vectors; Tumor microenvironment",
    methods: "Adoptive T cell transfer; Dendritic cell engineering and vaccination; Adenoviral and retroviral gene transfer; TCR transgenic lymphocyte generation; Flow cytometry; Clinical trial design",
    distinctions: "Fellow American Surgical Association; Fellow Society of Surgical Oncology",
    expertise: "Tumor immunology; cancer immunotherapy; adoptive cell therapy (CAR-T; TCR-engineered T cells); dendritic cell vaccination; gene therapy; tumor microenvironment; surgical oncology. Relevant for Medical Research proposals in cancer biology; immunology; and cell-based therapies.",
    keck_affiliation: "Board Member",
  },
  {
    name: "Kelsey C. Martin",
    role_type: "Board",
    role: "Professor of Biological Chemistry; Dean Emerita David Geffen School of Medicine",
    affiliation: "University of California Los Angeles; Simons Foundation",
    orcid: "https://orcid.org/0000-0003-0932-563X",
    primary_fields: "Neuroscience; Cell Biology; Molecular Biology; Synaptic Plasticity; Learning and Memory",
    keywords: "synaptic plasticity; local mRNA translation; learning and memory; RNA biology; neuroscience",
    subfields: "Synaptic plasticity and long-term memory; Local mRNA translation at synapses; Synapse-to-nucleus signaling; Activity-dependent transcription; RNA localization in neurons; Epitranscriptomics (m6A); Neuronal gene expression regulation; Autism spectrum disorder molecular mechanisms",
    methods: "Live cell imaging of local translation; Transcriptome and translatome profiling; Ribosome profiling; RNA-seq; Hippocampal LTP electrophysiology; miRNA functional analysis; Mouse behavioral memory tasks",
    distinctions: "NAS member; NAM member; AAAS Fellow; Pasarow Award in Neuropsychiatry",
    expertise: "Synaptic plasticity and long-term memory; local mRNA translation at synapses; synapse-to-nucleus signaling; activity-dependent transcription; epitranscriptomics (m6A). Relevant for Medical Research proposals in neuroscience; cell biology; and RNA biology.",
    keck_affiliation: "Board Member; Past Grantee",
  },
  {
    name: "Edward M. Stolper",
    role_type: "Board",
    role: "William E. Leonhard Professor of Geology",
    affiliation: "California Institute of Technology",
    orcid: null,
    primary_fields: "Geology; Geochemistry; Petrology; Planetary Science; Cosmochemistry",
    keywords: "igneous petrology; silicate melts; volatiles in magmas; experimental petrology; planetary geochemistry",
    subfields: "Igneous petrology (terrestrial and extraterrestrial); Volatiles in silicate melts; Experimental petrology; Stable isotope geochemistry; Meteorite petrology; Mars geochemistry; Lunar geochemistry; Mantle melting and magma genesis; Mid-ocean ridge basalts",
    methods: "High-pressure/high-temperature experiments; Phase equilibria; NMR spectroscopy; Electron microprobe; SIMS; Stable isotope analysis; Mars rover instrument science",
    distinctions: "NAS member; Royal Society Foreign Member; Academia Europaea; Wollaston Medal 2019; Roebling Medal 2017; Goldschmidt Award 2012",
    expertise: "Igneous petrology; volatile solubility in silicate melts; experimental petrology; planetary and extraterrestrial geochemistry; Mars and lunar geochemistry; mantle melting. Relevant for S&E proposals in geochemistry; earth and planetary science; and experimental mineralogy.",
    keck_affiliation: "Board Member",
  },
  {
    name: "Beth L. Pruitt",
    role_type: "Research Program Staff",
    role: "Chief Science Officer",
    affiliation: "W.M. Keck Foundation / University of California Santa Barbara (on leave)",
    orcid: "https://orcid.org/0000-0002-4861-2124",
    primary_fields: "Mechanical Engineering; Bioengineering; Mechanobiology; Microfabrication; Biophysics",
    keywords: "mechanobiology; MEMS; Wnt/beta-catenin mechanosensing; iPSC stem cell models; sensory neuroscience mechanobiology",
    subfields: "Cell mechanobiology; Mechanosensing and force-sensitive pathways; Wnt/beta-catenin mechanotransduction and cell cycle (mechanical strain → Wnt3A activation); MEMS/microsystems for biology; Stem cell-derived cardiomyocytes (hiPSC-CM maturation; disease modeling; cardiotoxicity); Cell-cell and cell-ECM adhesion mechanics; Cardiac biomechanics; Sensory mechanobiology (touch; hearing; C. elegans mechanosensory neurons); Microfabricated force sensors; Single-cell biophysics; Tissue mechanics and stem cell fate; Positional cue mechanosensing",
    methods: "MEMS fabrication; Microfabricated cantilever force sensors; Traction force microscopy; Cell stretcher devices; Micropatterning; Live-cell imaging; High-throughput single-cell assays; CRISPR/Cas9 iPSC engineering; Patch clamp electrophysiology",
    distinctions: "Fellow AAAS; Fellow BMES; Fellow AIMBE; Fellow ASME; NSF CAREER Award; DARPA Young Faculty Award; Denice Denton Leadership Award; BMES Chris Jacobs Leadership Award",
    expertise: "Mechanobiology; MEMS/microfabrication; cell mechanics and force sensing; iPSC-derived cardiomyocyte models; cardiac biomechanics. Work spans Wnt/beta-catenin mechanotransduction; mechanically regulated cell cycle entry; sensory mechanobiology including touch-sensitive neurons and hearing mechanosensors; and cardiac biomechanics in iPSC-cardiomyocyte models. Expertise extends into neuroscience; stem cells; and cardiology contexts. Relevant across S&E and Medical Research proposals in biophysics; bioengineering; cell biology; regenerative mechanobiology; and sensory neuroscience.",
    keck_affiliation: "Research Program Staff",
  },
  {
    name: "Justin Gallivan",
    role_type: "Research Program Staff",
    role: "Senior Program Director Science & Engineering",
    affiliation: "W.M. Keck Foundation",
    orcid: null,
    primary_fields: "Chemistry; Synthetic Biology; Biotechnology; Chemical Biology",
    keywords: "synthetic biology; riboswitches; microbiome engineering; living materials; directed evolution",
    subfields: "Synthetic riboswitches; Aptamer-based gene regulation; Bacterial chemotaxis reprogramming; Microbiome engineering; Living materials; Directed evolution; Environmental biosensors and bioremediation; Biodefense and dual-use biotechnology",
    methods: "Riboswitch engineering; In vitro selection (SELEX); Flow cytometry-based genetic screens; High-throughput screening; Bacterial chemotaxis assays; Cell-free transcription/translation; Directed evolution; Metabolic engineering; Molecular cloning",
    distinctions: "NIH NRSA Postdoctoral Fellowship; Beckman Young Investigator; Sloan Fellow; Dreyfus Teacher-Scholar; Kavli Frontiers in Science Fellow",
    expertise: "Synthetic biology; RNA-based gene regulation in bacteria (riboswitches; aptamers); microbiome engineering; living materials; directed evolution; environmental biosensors. Research expertise is specifically in prokaryotic RNA synthetic biology — not mammalian RNA biology or eukaryotic gene regulation. Relevant for S&E proposals in synthetic biology; chemical biology; and microbiology.",
    keck_affiliation: "Research Program Staff",
  },
  {
    name: "Kevin Moses",
    role_type: "Research Program Staff",
    role: "Senior Program Director",
    affiliation: "W.M. Keck Foundation",
    orcid: null,
    primary_fields: "Developmental Biology; Genetics; Neuroscience; Science Philanthropy",
    keywords: "Drosophila genetics; conserved developmental signaling; Wnt/Notch/Hedgehog; transcription factors; developmental neuroscience",
    subfields: "Drosophila eye development and morphogenetic furrow progression; Photoreceptor cell fate specification; EGF receptor/MAP kinase signaling (conserved across metazoa); Hedgehog signaling in development and adult tissue maintenance; Wingless/Wnt pathway in stem cell niche and tissue patterning; Notch/EGF receptor crosstalk in cell fate decisions; Fragile X (FMR1/FMRP); microRNA-FMRP interaction; Adult tissue regeneration signaling (Wnt; Notch; Hedgehog are core regenerative pathways); Morphogen gradients and positional information systems; Stem cell niche signaling",
    methods: "Drosophila genetics; Forward and reverse genetic screens; Mosaic analysis (FLP/FRT); Immunohistochemistry; Confocal microscopy; In situ hybridization; Molecular cloning; Transgenic Drosophila",
    distinctions: "SERC/NATO Postdoctoral Fellowship; NIH Postdoctoral Fellowship; Caroline Spitzer Fellow (ACS)",
    expertise: "Drosophila developmental genetics with deep expertise in conserved signaling pathways (Wnt/Wingless; Hedgehog; Notch; EGF/MAPK) that are central to mammalian tissue regeneration; adult stem cell niches; and positional identity. Extensive grant program leadership across major science philanthropy organizations has built broad evaluative expertise spanning developmental; cell; and systems biology. Can evaluate genetic and signaling logic of regenerative biology proposals as well as developmental neuroscience; Drosophila disease models; and genetics broadly. Relevant for S&E and Medical Research proposals in developmental biology; regenerative biology; stem cell signaling; neuroscience; and genetics.",
    keck_affiliation: "Research Program Staff",
  },
  {
    name: "Jean J. Kim",
    role_type: "Research Program Staff",
    role: "Senior Program Director Medical Research",
    affiliation: "W.M. Keck Foundation / Baylor College of Medicine",
    orcid: null,
    primary_fields: "Neuroscience; Stem Cell Biology; Molecular & Cellular Biology; Disease Modeling",
    keywords: "iPSC disease modeling; neuronal differentiation; stem cell biology; neurodevelopmental disorders; iPSC-derived neurons for neurological disease",
    subfields: "Human iPSC-based disease modeling; Autism spectrum disorder mechanisms; Neurodevelopmental disorders (MECP2 Duplication Syndrome; TANGO2-deficiency); Cardiac arrhythmia modeling in iPSC-derived cardiomyocytes; Directed neuronal differentiation for neurological and neurodegenerative disease models; iPSC platform services for Alzheimer's; Parkinson's; HD; and ALS researchers; Chromatin regulation in neuroblastoma; Epigenetic reprogramming; Pluripotency; Synapse formation and function in hiPSC-derived neurons",
    methods: "iPSC derivation and characterization; Directed neuronal differentiation; Immunohistochemistry; Molecular cloning; Ribosome profiling; RNA-seq; CRISPR/Cas9; Electrophysiology (iPSC-cardiomyocytes); Flow cytometry; Confocal microscopy",
    distinctions: "NIH F31 Predoctoral Fellowship (Yale)",
    expertise: "Human iPSC disease modeling and platform-level expertise in neuronal differentiation applicable across neurodevelopmental and neurodegenerative disease contexts. Platform-level iPSC expertise includes neuronal differentiation across a broad range of neurological disease contexts; from neurodevelopmental disorders through major neurodegenerative diseases. Can evaluate iPSC methodology quality; neuronal differentiation protocol rigor; and disease-modeling approach for any neurological proposal; but is not a specialist in AD molecular biology (tau; amyloid; microglial activation). Relevant for Medical Research proposals in neuroscience; stem cell biology; genetic disease modeling; and neurodegenerative disease iPSC platforms.",
    keck_affiliation: "Research Program Staff",
  },
  {
    name: "Sean R. Eddy",
    role_type: "Consultant",
    role: "Professor of Molecular & Cellular Biology",
    affiliation: "Harvard University",
    orcid: "https://orcid.org/0000-0001-6676-4706",
    primary_fields: "Computational Biology; Bioinformatics; Evolutionary Genomics; RNA Biology",
    keywords: "HMMER; sequence homology; profile HMMs; noncoding RNA; comparative genomics",
    subfields: "Biological sequence analysis; Hidden Markov models; Protein homology detection; RNA secondary structure prediction; Genome annotation; Noncoding RNA gene identification; Stochastic context-free grammars; Evolutionary sequence analysis; Neural cell-type genomics",
    methods: "Profile hidden Markov models (HMMER/Infernal); Stochastic context-free grammars; Bayesian probabilistic inference; Large-scale genome annotation; Comparative genome analysis; Multiple sequence alignment",
    distinctions: "HHMI Investigator (2000–2022); Fellow Academy of Science of St. Louis",
    expertise: "Computational methods for genome and RNA sequence analysis; HMMER and Infernal software for sequence homology detection; probabilistic modeling of protein and RNA families; genome annotation and evolutionary analysis of noncoding RNAs. Relevant for S&E and Medical Research proposals in computational genomics; RNA biology; and bioinformatics.",
    keck_affiliation: "",
  },
  {
    name: "Katherine S. Pollard",
    role_type: "Consultant",
    role: "Director Gladstone Institute of Data Science & Biotechnology; Professor of Epidemiology & Biostatistics",
    affiliation: "Gladstone Institutes / University of California San Francisco",
    orcid: "https://orcid.org/0000-0002-9870-6196",
    primary_fields: "Computational Biology; Bioinformatics; Evolutionary Genomics; Statistical Genomics",
    keywords: "comparative genomics; human accelerated regions; microbiome metagenomics; regulatory enhancers; machine learning genomics",
    subfields: "Human Accelerated Regions (HARs); Comparative and functional genomics; Regulatory enhancer identification; Microbiome metagenomics; DNA shape and chromatin folding; Statistical methods for omics data; Evolutionary conservation and acceleration; Gene expression analysis; Single-cell genomics; Epigenomics",
    methods: "Statistical phylogenetic methods; Machine learning for regulatory sequence; Massively parallel reporter assays; CRISPR screens; Metagenomic abundance quantification; Longitudinal omics modeling; Open-source bioinformatics tool development",
    distinctions: "NAM member; Fellow AAAS; Fellow International Society for Computational Biology; Fellow AIMBE; Fellow California Academy of Sciences; Chan Zuckerberg Biohub Investigator; Sloan Research Fellowship",
    expertise: "Develops statistical and computational methods for comparative genomics; metagenomics; and regulatory genomics; pioneered Human Accelerated Regions as a framework for understanding human-specific evolution; strong in machine learning integration of large-scale genomic datasets. Relevant for S&E and Medical Research proposals in bioinformatics; evolutionary genomics; and regulatory biology.",
    keck_affiliation: "",
  },
  {
    name: "Gene W. Yeo",
    role_type: "Consultant",
    role: "Professor of Cellular and Molecular Medicine",
    affiliation: "University of California San Diego",
    orcid: "https://orcid.org/0000-0002-0799-6037",
    primary_fields: "RNA Biology; Computational Biology; Genomics; Neuroscience; RNA Therapeutics",
    keywords: "RNA binding proteins; eCLIP; alternative splicing; RNA therapeutics; CRISPR-RNA targeting",
    subfields: "RNA binding protein (RBP) mapping; Post-transcriptional gene regulation; Alternative splicing in stem cells and brain; RNA processing in neurodegeneration; eCLIP and STAMP methodology; Stress granule biology; m6A epitranscriptomics; CRISPR/Cas RNA targeting; iPSC neuronal models; Repeat expansion disorders",
    methods: "eCLIP (enhanced CLIP); STAMP (single-cell translation and protein-RNA interaction); CLIPper/SKIPPER peak calling; MaxENT splice site scoring; iPSC neuronal differentiation; Computational RBP interactome analysis; CRISPR-based RNA targeting in vivo",
    distinctions: "Alfred P. Sloan Research Fellowship; International RNA Society Early Career Award; Crick-Jacobs Fellow (inaugural)",
    expertise: "Hybrid computational and experimental lab focused on RNA binding proteins; post-transcriptional regulation; and RNA-targeted therapeutics; developed eCLIP as a world-standard for mapping protein-RNA interactions; applies iPSC and organoid models to neurodegeneration. Relevant for S&E and Medical Research proposals in RNA biology; neurodegeneration; genomics; and RNA therapeutics.",
    keck_affiliation: "",
  },
  {
    name: "Trey Ideker",
    role_type: "Consultant",
    role: "Professor of Medicine; Bioengineering; and Computer Science",
    affiliation: "University of California San Diego",
    orcid: "https://orcid.org/0000-0002-1708-8454",
    primary_fields: "Systems Biology; Computational Biology; Cancer Biology; Bioinformatics; Network Medicine",
    keywords: "protein interaction networks; systems biology; epigenetic aging clock; cancer network maps; Cytoscape",
    subfields: "Protein-protein and genetic interaction networks; Network-based disease modeling; Epigenetic aging and DNA methylation clocks; Cancer cell map initiative; CRISPR synthetic lethality mapping; Deep learning models of cell structure; Precision oncology; Multi-scale cell imaging and network fusion; Network biomarkers for patient stratification",
    methods: "Cytoscape network analysis; CRISPR/Cas9 synthetic-lethal mapping; Protein interaction mapping; Multiscale cell imaging with immunofluorescence; Deep learning on biological networks; Hierarchical network decomposition; Epigenetic clock modeling; Multi-omics integration",
    distinctions: "Fellow AAAS; Fellow AIMBE; Fellow International Society for Computational Biology; ICSB Overton Prize 2009; Highly Cited Researcher (Clarivate 2020–2024)",
    expertise: "Pioneered theory and practice of systems biology including protein network mapping; epigenetic aging clocks; and AI-driven precision oncology. Developer of widely used network analysis tools for biology; leads large-scale collaborative programs in cancer systems biology and biomedical AI. Relevant for S&E and Medical Research proposals in systems biology; cancer genomics; network medicine; and computational biology.",
    keck_affiliation: "",
  },
  {
    name: "Jason E. Stajich",
    role_type: "Consultant",
    role: "Professor of Microbiology & Plant Pathology",
    affiliation: "University of California Riverside",
    orcid: "https://orcid.org/0000-0002-7591-0020",
    primary_fields: "Evolutionary Genomics; Mycology; Microbial Genomics; Computational Biology; Phylogenomics",
    keywords: "fungal genomics; phylogenomics; microbial evolution; comparative genomics; transposable elements",
    subfields: "Fungal evolutionary genomics; Comparative fungal genomes (zygomycetes; chytrids; Aspergillus; Coccidioides; Fusarium); Fungal-animal pathogen interactions; Transposable element dynamics; Microbiome genomics; Soil and extremophile fungi; Plant-fungal interactions; Population genomics of pathogens; Genome assembly and annotation",
    methods: "Genome sequencing and assembly; Comparative genomics; Phylogenetic inference; Population genomics; RNA-seq transcriptomics; Transposon analysis; Metagenomics; Open-source bioinformatics tool development (Phyling; FGMP)",
    distinctions: "C. J. Alexopoulos Prize (Mycological Society of America); Miller Institute for Basic Research Postdoctoral Fellowship",
    expertise: "Fungal evolutionary and comparative genomics; phylogenomics; microbial-host interactions; population genetics of fungal pathogens including Coccidioides and Aspergillus; open-source bioinformatics tool development. Relevant for S&E and Medical Research proposals in microbial genomics; infectious disease; ecology; and evolutionary biology.",
    keck_affiliation: "",
  },
  {
    name: "Paul D. Thomas",
    role_type: "Consultant",
    role: "Professor of Population and Public Health Sciences",
    affiliation: "University of Southern California",
    orcid: "https://orcid.org/0000-0002-9074-3507",
    primary_fields: "Computational Biology; Bioinformatics; Functional Genomics; Evolutionary Biology",
    keywords: "PANTHER; Gene Ontology; protein function prediction; phylogenomics; ancestral genome reconstruction",
    subfields: "Protein family phylogenomics (PANTHER); Gene Ontology curation and functional annotation; Phylogenetic propagation of gene function; Human genome gene prediction and annotation; Protein sequence-function evolution; Ancestral genome reconstruction; Gene function enrichment analysis; Ortholog inference",
    methods: "PANTHER phylogenomics software; Gene Ontology Phylogenetic Annotation (PAINT); Bayesian function inference; Hidden Markov models for protein families; InterProScan integration; Large-scale omics enrichment analysis",
    distinctions: "Director Gene Ontology Consortium; Human Genome Project contributor (first human genome sequencing paper 2001)",
    expertise: "PANTHER developer and Gene Ontology Consortium director; expertise in protein function inference from evolutionary relationships; genome-scale annotation of gene function; and statistical enrichment analysis for omics datasets. Relevant for S&E and Medical Research proposals in functional genomics; protein biology; and computational biology.",
    keck_affiliation: "",
  },
  {
    name: "Sheng Li",
    role_type: "Consultant",
    role: "Associate Professor of Biochemistry & Molecular Medicine",
    affiliation: "University of Southern California Keck School of Medicine",
    orcid: "https://orcid.org/0000-0002-6258-3147",
    primary_fields: "Computational Biology; Cancer Epigenomics; Hematology; Bioinformatics; Aging Biology",
    keywords: "cancer epigenomics; DNA methylation; clonal hematopoiesis; single-cell multi-omics; leukemia",
    subfields: "Cancer epigenomics and DNA methylation heterogeneity; Clonal hematopoiesis and leukemia evolution; Single-cell multi-omics; Spatial transcriptomics; Long-read sequencing epigenomics; Hematopoietic stem cell aging; Tumor microenvironment; Cellular senescence; Transcription factor regulatory networks",
    methods: "Single-cell RNA-seq and ATAC-seq; Spatial transcriptomics; Nanopore long-read DNA methylation; Hi-C chromatin conformation; CRISPR epigenome editing; Machine learning for multi-omics integration; Tumor heterogeneity computational analysis",
    distinctions: "LLS Career Development Program Scholar Award; AACR NextGen Star; NIH MIRA (Maximizing Investigators' Research Award)",
    expertise: "Develops AI-driven computational methods for cancer epigenomics and hematopoietic stem cell aging; expertise in DNA methylation; clonal hematopoiesis; and single-cell multi-omics; applies long-read sequencing to epigenetic variation. Relevant for Medical Research proposals in cancer biology; hematology; epigenomics; and stem cell aging.",
    keck_affiliation: "",
  },
  {
    name: "B.S. Manjunath",
    role_type: "Consultant",
    role: "Professor of Electrical & Computer Engineering",
    affiliation: "University of California Santa Barbara",
    orcid: null,
    primary_fields: "Image Analysis; Bioimage Informatics; Computer Vision; Multimedia Computing",
    keywords: "bioimage informatics; image segmentation; BisQue platform; texture analysis; multimodal data",
    subfields: "Bioimage analysis and informatics; Image segmentation and registration; Texture and shape analysis; Biological image databases; Microscopy image processing; Neuron morphology analysis; Cell tracking; High-dimensional feature extraction; Steganography and image security; Remote sensing image analysis",
    methods: "Bioimage segmentation; BisQue open-source image informatics platform; Content-based image retrieval; Convolutional deep learning for images; Biological image annotation; 3D/4D microscopy data management; MPEG-7 multimedia representation",
    distinctions: "Director NSF Bio-Image Informatics Center; 24 patents; MPEG-7 co-editor",
    expertise: "Bioimage informatics; image segmentation; analysis and retrieval of microscopy data; developer of BisQue platform for large-scale biological image management and analysis; expert in texture and shape analysis for biological images. Relevant for S&E and Medical Research proposals requiring quantitative microscopy; high-content imaging analysis; or large-scale image data infrastructure.",
    keck_affiliation: "",
  },
  {
    name: "Nina Miolane",
    role_type: "Consultant",
    role: "Assistant Professor of Electrical & Computer Engineering",
    affiliation: "University of California Santa Barbara",
    orcid: null,
    primary_fields: "Geometric Deep Learning; Computational Biology; Biomedical Imaging; Applied Mathematics; AI for Science",
    keywords: "geometric deep learning; shape analysis; cryo-EM reconstruction; Riemannian geometry; computational anatomy",
    subfields: "Geometric statistics for biomedical imaging; Protein and cell shape analysis; Cryo-electron microscopy reconstruction; Membrane protein structure; Equivariant and topological deep learning; Riemannian geometry in machine learning; Computational anatomy; Women's brain health imaging; Geomstats library",
    methods: "Geometric deep learning (equivariant networks); Shape descriptor computation; Cryo-EM 3D reconstruction; Riemannian manifold statistics; Topological data analysis; Python Geomstats library; Computer vision for biological shapes",
    distinctions: "L'Oréal-UNESCO for Women in Science Award; NSF CAREER Award; NIH R01",
    expertise: "Geometric AI for biomedical shape analysis; develops mathematical and deep learning methods for quantifying biological shapes at molecular to organ scale; expert in cryo-EM reconstruction; membrane protein structure; and geometric statistics for imaging. Relevant for S&E and Medical Research proposals involving quantitative imaging; cryo-EM; structural biology; and AI-driven image analysis.",
    keck_affiliation: "",
  },
  {
    name: "Craig E. Manning",
    role_type: "Consultant",
    role: "Distinguished Professor of Geology and Geochemistry",
    affiliation: "University of California Los Angeles",
    orcid: null,
    primary_fields: "Geology; Geochemistry; Petrology; Metamorphic Petrology; Experimental Petrology",
    keywords: "high-pressure aqueous geochemistry; metamorphic petrology; subduction fluids; hydrothermal systems; fluid-rock interaction",
    subfields: "High-pressure aqueous geochemistry; Metamorphic petrology; Experimental petrology; Subduction zone fluid chemistry; Mid-ocean ridge hydrothermal systems; Fluid-rock interaction in lower crust; Mineral solubility in water; Volatiles in crustal fluids; Permeability and fluid flow; Deep carbon cycle; Cenozoic magma-hydrothermal systems; Tectonometamorphic evolution of central Asia",
    methods: "High-pressure/high-temperature piston-cylinder experiments; Phase equilibria; Mineral solubility measurements; Fluid inclusion analysis; Stable isotope geochemistry; Electron microprobe; Field-based metamorphic petrology",
    distinctions: "Fellow American Geophysical Union; Fellow Mineralogical Society of America; AGU Norman Bowen Award 2017; Distinguished Professor UCLA",
    expertise: "Experimental geochemist specializing in high-pressure aqueous geochemistry; fluid-rock interaction in the deep crust and subduction zones; mineral solubility; metamorphic petrology; and the deep carbon cycle. Relevant for S&E proposals in geochemistry; earth science; experimental petrology; and crustal fluid systems.",
    keck_affiliation: "",
  },
  {
    name: "Aydogan Ozcan",
    role_type: "Consultant",
    role: "Chancellor's Professor and Volgenau Chair for Engineering Innovation; HHMI Professor",
    affiliation: "University of California Los Angeles",
    orcid: null,
    primary_fields: "Computational Imaging; Electrical Engineering; Biomedical Engineering; Photonics; AI for Science",
    keywords: "computational imaging; lensless microscopy; deep learning optics; mobile diagnostics; biophotonics",
    subfields: "Lensless and on-chip computational microscopy; Deep learning for optical imaging and sensing; Mobile diagnostics and point-of-care technologies; Holographic imaging; Fluorescence microscopy; AI-enhanced pathology; Optical computing; Telemedicine and global health sensing; Bio-sensing; Nanophotonic sensor arrays",
    methods: "Lensless (lensfree) microscopy; Holographic reconstruction; Deep learning neural network image processing; Smartphone-based diagnostic device engineering; Wide-field fluorescence imaging; In silico staining; Digital pathology; Optical coherence tomography",
    distinctions: "NAE Member (2025); HHMI Professor; Fellow AAAS; Fellow IEEE; Fellow AIMBE; Fellow SPIE; Fellow APS; PECASE; Dennis Gabor Award (SPIE) 2023; Joseph Fraunhofer Award (Optica) 2022; NSF CAREER Award; NIH Director's New Innovator Award; Guggenheim Fellow",
    expertise: "Pioneered computational imaging platforms combining optics; deep learning; and mobile sensing for diagnostics; lensless microscopy; AI-driven virtual staining; and point-of-care technologies. Relevant for S&E and Medical Research proposals in optical engineering; computational microscopy; AI for imaging; and biomedical diagnostics.",
    keck_affiliation: "",
  },
  {
    name: "Jason Ernst",
    role_type: "Consultant",
    role: "Professor of Biological Chemistry; Computer Science; and Computational Medicine",
    affiliation: "University of California Los Angeles",
    orcid: null,
    primary_fields: "Computational Biology; Bioinformatics; Epigenomics; Regulatory Genomics; Machine Learning",
    keywords: "ChromHMM; chromatin state modeling; epigenomics; regulatory genomics; non-coding genome",
    subfields: "Chromatin state modeling and genome annotation; Regulatory genomics and enhancer biology; Non-coding variant interpretation; Epigenomic variation across cell types and individuals; Single-cell epigenomics; Noncoding de novo variants in autism; DNA methylation; Psychiatric and neurological disease genomics; Cancer genomics; Functional annotation of the human genome",
    methods: "ChromHMM (chromatin state annotation); DREM/STEM (time-series gene expression); Machine learning for regulatory sequence; Imputation of epigenomic data; Epigenome-wide association; RNA-seq and ATAC-seq integration; Genome-wide computational annotation",
    distinctions: "NSF CAREER Award; NIH Avenir Award; Sloan Research Fellowship; NSF Postdoctoral Fellowship",
    expertise: "Develops and applies machine learning methods for epigenomics and regulatory genomics; ChromHMM developer for chromatin state annotation; expert in non-coding genome interpretation; epigenomic variation; and functional annotation across diseases including cancer; ASD; and psychiatric disorders. Relevant for S&E and Medical Research proposals in computational genomics; epigenomics; and gene regulation.",
    keck_affiliation: "",
  },
  {
    name: "Sriram Sankararaman",
    role_type: "Consultant",
    role: "Professor of Computer Science; Human Genetics; and Computational Medicine",
    affiliation: "University of California Los Angeles",
    orcid: null,
    primary_fields: "Computational Genomics; Population Genetics; Statistical Genomics; Machine Learning; Evolutionary Biology",
    keywords: "population genetics; admixture; GWAS; archaic introgression; ML for genomics",
    subfields: "Population structure and ancestry inference; GWAS and genome-wide association at biobank scale; Archaic introgression (Neanderthal and Denisovan DNA); Local ancestry estimation in admixed populations; Gene-environment interaction; Epistasis detection; Variance components analysis; Deep learning for phenotype imputation; Genomic privacy; Human evolutionary genomics",
    methods: "Probabilistic PCA for genetic variation; Local ancestry inference; Kernel-based association testing; Scalable variance component models; Deep learning phenotype imputation; Population structure inference at biobank scale; Admixture graph estimation",
    distinctions: "NSF CAREER Award; Sloan Research Fellowship; Microsoft Investigator Fellowship; NIH Pathway to Independence Award; Okawa Foundation Research Grant; Hellman Fellow",
    expertise: "Statistical and computational methods for population genetics; biobank-scale GWAS; ancestry inference in admixed populations; archaic introgression; and ML-driven genomic analysis. Relevant for S&E and Medical Research proposals in population genetics; computational genomics; human evolutionary biology; and large-scale genetic data analysis.",
    keck_affiliation: "",
  },
  {
    name: "Eran Halperin",
    role_type: "Consultant",
    role: "Professor of Computer Science; Computational Medicine; Human Genetics; and Anesthesiology",
    affiliation: "University of California Los Angeles",
    orcid: null,
    primary_fields: "Statistical Genomics; Computational Biology; Bioinformatics; Clinical Data Science; Epidemiology",
    keywords: "GWAS; methylation deconvolution; microbiome computation; EHR genomics; cell-type-specific analysis",
    subfields: "Statistical methods for GWAS and epigenetic studies; Cell-type deconvolution from bulk methylation and RNA data; Microbiome temporal modeling; Electronic health records integrated with genomics; Single-cell and single-nucleus RNA analysis; Population stratification correction; Genomic privacy; Epigenome-wide association studies",
    methods: "ReFACTor and TCA cell-type deconvolution; Linear mixed models for genomics; FEAST microbiome source tracking; Bayesian methods for genetic data; Epigenome-wide association analysis; EHR-integrated genomic analysis; Machine learning for clinical genomic outcomes",
    distinctions: "Fellow International Society for Computational Biology; Rothschild Fellowship; Technion-Juludan Prize; Krill Prize",
    expertise: "Statistical and computational genomics spanning GWAS methods; methylation cell-type deconvolution; microbiome modeling; and EHR-integrated genetic data analysis. Relevant for S&E and Medical Research proposals in statistical genomics; epigenomics; computational medicine; and clinical data science.",
    keck_affiliation: "",
  },
  {
    name: "Alex Bui",
    role_type: "Consultant",
    role: "Professor of Radiological Sciences; Bioengineering; and Bioinformatics; Director Medical and Imaging Informatics",
    affiliation: "University of California Los Angeles",
    orcid: null,
    primary_fields: "Medical Informatics; Clinical AI; Biomedical Data Science; Imaging Informatics; mHealth",
    keywords: "medical informatics; EHR; AI in healthcare; clinical decision support; biomedical data science",
    subfields: "Medical and imaging informatics; Electronic health record analytics; Reinforcement learning in clinical settings; mHealth and mobile sensing; AI/ML for clinical decision support; Biomedical data visualization; Precision health informatics; Clinical AI translation; NIH Bridge2AI Coordination; Translational informatics; Social determinants of health modeling",
    methods: "EHR data integration and analytics; Machine learning for clinical outcomes; Distributed data architectures; Reinforcement learning; Mobile health sensor data; NLP for clinical text; Biomedical image informatics; Multi-modal data fusion for healthcare",
    distinctions: "David Geffen Chair in Informatics; PI UCLA Bridge2AI Coordination Center; Co-Chair UC AI Council; Senior Associate Dean DGSOM UCLA",
    expertise: "Medical informatics and clinical AI spanning EHR analytics; mHealth; reinforcement learning for clinical decisions; biomedical data visualization; and precision health infrastructure. Relevant for Medical Research proposals in clinical data science; AI in healthcare; and translational informatics.",
    keck_affiliation: "",
  },
  {
    name: "Wei Wang",
    role_type: "Consultant",
    role: "Leonard Kleinrock Chair Professor of Computer Science and Computational Medicine",
    affiliation: "University of California Los Angeles",
    orcid: null,
    primary_fields: "Data Mining; Machine Learning; Bioinformatics; Computational Medicine; Natural Language Processing",
    keywords: "big data analytics; data mining; ML for biology; computational medicine; network biology",
    subfields: "Big data analytics and scalable mining algorithms; Machine learning for biological and medical data; Natural language processing for biomedical text; Network-based approaches in systems biology; Computational cancer biology; Graph neural networks; Single-cell data analysis; AI for science; Knowledge discovery from heterogeneous data",
    methods: "Scalable machine learning algorithms; Graph and network analysis; Deep learning for biological data; NLP for clinical and biomedical text; High-dimensional data mining; Multi-omics data integration; Bioinformatics pipeline development",
    distinctions: "ACM Fellow; IEEE Fellow; NSF CAREER Award; Microsoft Research New Faculty Fellow; Okawa Foundation Research Award; ACM SIGKDD Service Award",
    expertise: "Broadly expert in data mining; machine learning; and computational approaches to biology and medicine; applies AI and network methods to cancer; systems biology; and clinical data at scale. Relevant for S&E and Medical Research proposals in computational biology; data science; and AI-driven scientific discovery.",
    keck_affiliation: "",
  },
  {
    name: "Harold Pimentel",
    role_type: "Consultant",
    role: "Assistant Professor of Computational Medicine and Human Genetics",
    affiliation: "University of California Los Angeles",
    orcid: null,
    primary_fields: "Computational Biology; Bioinformatics; Transcriptomics; Statistical Genomics; Gene Regulation",
    keywords: "RNA quantification; kallisto; sleuth; differential expression; transcriptome statistics",
    subfields: "RNA quantification and transcript abundance estimation; Differential expression analysis; Statistical modeling of high-throughput RNA-seq data; Gene regulation and transcriptomics; Single-cell RNA-seq methods; Computational methods for high-dimensional biology; Genomic data reproducibility and statistical rigor",
    methods: "kallisto (rapid RNA-seq pseudoalignment); sleuth (differential expression); Bayesian inference for transcriptomics; Single-cell RNA-seq analysis; Bootstrap-based uncertainty quantification; Statistical modeling of gene expression",
    distinctions: "NSF CAREER Award",
    expertise: "Develops computational and statistical methods for RNA quantification and transcriptomics; creator of kallisto and sleuth tools widely used in gene expression analysis. Junior faculty with growing expertise in statistical genomics. Relevant for S&E and Medical Research proposals in transcriptomics; RNA biology; and computational genomics.",
    keck_affiliation: "",
  },
  {
    name: "S. George Djorgovski",
    role_type: "Consultant",
    role: "Professor of Astronomy and Data Science",
    affiliation: "California Institute of Technology",
    orcid: null,
    primary_fields: "Observational Astrophysics; Data Science; Astroinformatics; Cosmology; Time-Domain Astronomy",
    keywords: "astroinformatics; digital sky surveys; machine learning for astronomy; gamma-ray bursts; galaxy formation",
    subfields: "Observational cosmology and galaxy formation; Quasar and gamma-ray burst observations; Gravitational lenses and binary quasars; Globular cluster dynamics; Time-domain and synoptic sky surveys; Virtual Observatory and cyber-infrastructure; Machine learning and AI for large astronomical datasets; Data-driven discovery in science; AstroInformatics methodology; Knowledge transfer between astronomy and biomedicine",
    methods: "Digital sky survey analysis (DPOSS); Machine learning for image classification; Astroinformatics pipelines; Virtual Observatory frameworks; Light-curve analysis; Multi-wavelength survey data fusion; AI/ML-driven anomaly detection in large datasets",
    distinctions: "Fellow AAAS; Sloan Research Fellowship; Presidential Young Investigator; Harvard Junior Fellow; Senior Data Science Advisor W.M. Keck Foundation; Dudley Observatory Award; NASA Group Achievement Award",
    expertise: "Observational astrophysicist and pioneer of astroinformatics who developed frameworks for applying machine learning and data science to large-scale astronomical surveys; works on methodology transfer from astronomy to medicine and other fields. Current Senior Data Science Advisor to the W.M. Keck Foundation. Relevant for S&E proposals in astronomy; astrophysics; data science; and AI for scientific discovery.",
    keck_affiliation: "Past Grantee",
  },
  {
    name: "Jack G.E. Harris",
    role_type: "Consultant",
    role: "Professor of Physics and Applied Physics",
    affiliation: "Yale University",
    orcid: null,
    primary_fields: "Quantum Optomechanics; Condensed Matter Physics; Quantum Physics; Topological Physics; AMO Physics",
    keywords: "quantum optomechanics; superfluid helium; exceptional points; macroscopic quantum effects; mechanical oscillators",
    subfields: "Quantum optomechanics and macroscopic quantum phenomena; Superfluid helium quantum mechanics; Non-Hermitian physics and exceptional points; Levitated mechanical oscillators; Topological effects in coupled oscillators; Quantum-limited force detection; Persistent currents in mesoscopic rings; Quantum sensing and dark matter detection; Light-matter interaction in cavities; Membrane-in-the-middle optomechanical devices",
    methods: "Optical cavity fabrication; Superfluid helium containment and levitation; Cryogenic optomechanical devices; Precision optical interferometry; Non-Hermitian Hamiltonian engineering; Single-crystal membrane resonators; Microwave and optical cavity coupling",
    distinctions: "Vannevar Bush Faculty Fellowship (DoD) 2019; Fellow APS (DAMOP) 2016; Sloan Research Fellowship; DARPA Young Faculty Award; Yale Junior Faculty Fellowship",
    expertise: "Quantum optomechanics combining high-finesse optical cavities; superfluid helium; and ultrasensitive mechanical oscillators; pioneered membrane-in-the-middle devices; exceptional point physics; and macroscopic quantum sensing. Past Keck grantee. Relevant for S&E proposals in quantum physics; quantum sensing; macroscopic quantum phenomena; and optomechanics.",
    keck_affiliation: "Past Grantee",
  },
  {
    name: "Kent Kresa",
    role_type: "Board",
    role: "Board Member",
    affiliation: "W.M. Keck Foundation",
    orcid: null,
    primary_fields: "Aerospace Engineering; Defense Technology; Systems Engineering; Technology Leadership",
    keywords: "aeronautics; defense R&D; systems engineering; aerospace technology; DARPA",
    subfields: "Ballistic missile defense; Reentry vehicle technology; Aerospace manufacturing and systems integration; Defense advanced research; Large-scale technology development; Corporate technology strategy",
    methods: "Systems engineering; Large-scale technology program management; Defense R&D program oversight; Aerospace vehicle design and integration",
    distinctions: "NAE Member (aeronautical technology; 1997)",
    expertise: "Aerospace engineering and defense technology; DARPA research programs; MIT Lincoln Laboratory ballistic missile defense; Northrop Grumman aerospace systems. Relevant for S&E proposals in aerospace engineering; large-scale instrumentation; and defense-adjacent technology. Board role is primarily strategic; scientific review scope is narrow.",
    keck_affiliation: "Board Member",
  },
  {
    name: "TBD: Neurodegeneration specialist",
    role_type: "Consultant",
    role: "To be recruited",
    affiliation: "TBD",
    orcid: null,
    primary_fields: "Neuroscience; Cell Biology; Disease Modeling",
    keywords: "Alzheimer's disease; neurodegeneration; iPSC disease models; tau pathology; neuronal aging",
    subfields: "iPSC-based Alzheimer's modeling; tau/amyloid pathology; neurodegen mechanisms; neuronal aging; microglial biology in AD; Parkinson's disease; disease biomarkers",
    methods: "iPSC neuronal differentiation; live imaging; tau/amyloid assays; CRISPR disease modeling; omics of neurodegeneration",
    distinctions: "TBD",
    expertise: "Expert in Alzheimer's disease molecular biology; tau pathology; amyloid processing; microglial activation; or neuroinflammation in neurodegeneration. Note: Jean Kim (iPSC platform) can evaluate methodology and disease-modeling approach for all 6 proposals; what is missing is the AD-specific cell biology — the scientific premise of tau propagation; amyloid cascade; microglial biology; and neuronal aging. Relevant for MR proposals in neurodegeneration: 1002020; 1002168; 1002257; 1002292; 1002372; 1002218.",
    keck_affiliation: "",
  },
  {
    name: "Thomas E. Everhart",
    role_type: "Board",
    role: "Trustee Emeritus",
    affiliation: "California Institute of Technology",
    orcid: null,
    primary_fields: "Electron Physics; Electrical Engineering; Nanoscale Instrumentation",
    keywords: "scanning electron microscopy; electron beam physics; electron optics; semiconductor imaging; nanoscale characterization",
    subfields: "Scanning electron microscopy (SEM) instrumentation; Electron beam detection; Secondary electron imaging; Voltage contrast imaging; Electron reflection theory; EBIC imaging; Semiconductor device characterization; Electron optics; Nanoscale surface topography; Microfabrication characterization",
    methods: "SEM design and instrumentation; Secondary electron detection (Everhart-Thornley detector); Voltage contrast imaging of p-n junctions; EBIC imaging; Electron beam penetration modeling; Nanoscale surface characterization",
    distinctions: "NAE member 1978; Fellow IEEE; Fellow AAAS; Foreign Member Royal Academy of Engineering; IEEE Founders Medal 2002; Okawa Prize 2002; IEEE Centennial Medal 1984; Marshall Scholarship",
    expertise: "Physicist and SEM pioneer whose foundational research established the principles of scanning electron microscopy — including electron detection efficiency; secondary electron contrast mechanisms; voltage contrast imaging of semiconductor junctions; and electron beam penetration theory. Co-inventor of the Everhart-Thornley secondary electron detector; now standard in virtually all SEMs. Deep knowledge of electron beam instrumentation; nanoscale surface and device characterization; and electron optics. Relevant for S&E proposals in electron beam instrumentation; nanoscale characterization; semiconductor physics; and advanced microscopy.",
    keck_affiliation: "Board Member",
  },
  {
    name: "Robert A. Bradway",
    role_type: "Board",
    role: "Trustee; Chairman and CEO",
    affiliation: "Amgen",
    orcid: null,
    primary_fields: "Biopharmaceutical Industry; Oncology; Cardiometabolic Medicine; Population Genetics",
    keywords: "biologics development; cancer therapeutics; precision oncology; ADC; population genetics",
    subfields: "Biologic drug development; Antibody-based cancer therapeutics; Antibody-drug conjugates (ADC); Cardiometabolic disease (PCSK9; lipid-lowering biologics); Population-scale human genetics; Biosimilars; Precision oncology; R&D pipeline management; Clinical development strategy; Large pharma operations",
    methods: "Biopharmaceutical R&D strategy; Clinical development pipeline oversight; Population genetics platform evaluation (large-scale cohort studies); Target validation assessment; Drug commercialization strategy",
    distinctions: "Chairman CEO Roundtable on Cancer; Member American Heart Association CEO Roundtable",
    expertise: "Biopharmaceutical executive with deep industry experience in cancer biologics; cardiometabolic therapeutics; and large-scale human genetics. Oversaw strategic development across antibody-drug conjugates; PCSK9 inhibitors; and biosimilars; and directed acquisition of population-genetics capabilities. His perspective is translational and strategic rather than bench scientific — most valuable for proposals with a clear path toward biologic drug development; antibody engineering platforms; population-scale target discovery; or precision oncology. Not a scientific peer reviewer in the traditional sense; flag for industry-perspective input on translational proposals.",
    keck_affiliation: "Board Member",
  },
  {
    name: "Richard N. Foster",
    role_type: "Board",
    role: "Trustee",
    affiliation: "Millbrook Management Group LLC",
    orcid: null,
    primary_fields: "Innovation Strategy; R&D Management; Technology Economics",
    keywords: "innovation strategy; R&D portfolio management; technology S-curves; creative destruction; science philanthropy strategy",
    subfields: "Innovation economics; Technology disruption and S-curves; R&D return-on-investment analysis; Capital allocation for science; Life sciences investment strategy; Complexity economics (Santa Fe Institute); Healthcare industry strategy; Science policy",
    methods: "R&D portfolio analysis; Technology trajectory modeling; Capital markets and innovation performance analysis; Strategic consulting for technology-intensive industries",
    distinctions: "Maurice Holland Award (Industrial Research Institute) 1986; Venture Partner Lux Capital; Board Memorial Sloan Kettering Cancer Center",
    expertise: "PhD engineer and former McKinsey senior partner whose career focused on the economics of R&D; technology S-curves; and innovation strategy. Author of influential frameworks on how technological disruption unfolds across industries. Board experience includes Memorial Sloan Kettering and the Santa Fe Institute (complexity economics). His perspective is strategic and economic rather than scientific — most useful for assessing R&D platform proposals; large-scale enabling technology bets; or proposals where the innovation trajectory and translational potential are primary considerations. Not a scientific reviewer; no proposals in J26 identified where his specific expertise adds distinct scientific value.",
    keck_affiliation: "Board Member",
  }
];

const ROLE_COLORS = {
  "Consultant": { bg: "#e8f0fb", text: "#2a5298", border: "#b8cef5" },
  "Board": { bg: "#fef3e2", text: "#8a4a00", border: "#f5d5a0" },
  "Research Program Staff": { bg: "#e8f5ee", text: "#1a6640", border: "#a8d8bc" },
};

const MATCH_COLORS = [
  { bg: "#1a3a5c", text: "#fff", label: "Strong match" },
  { bg: "#2e6da4", text: "#fff", label: "Good match" },
  { bg: "#7bafd4", text: "#fff", label: "Partial match" },
];

export default function ReviewerMatcher() {
  const [proposal, setProposal] = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [filterField, setFilterField] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [tab, setTab] = useState("match"); // "match" | "browse"

  const toggle = (name) => setExpanded(e => ({ ...e, [name]: !e[name] }));

  const buildReviewerContext = () =>
    REVIEWERS.map(r =>
      `NAME: ${r.name}\nROLE: ${r.role_type}\nFIELDS: ${r.primary_fields}\nKEYWORDS: ${r.keywords}\nSUBFIELDS: ${r.subfields}\nEXPERTISE: ${r.expertise}\nKECK: ${r.keck_affiliation}`
    ).join("\n\n---\n\n");

  const runMatch = async () => {
    if (!proposal.trim()) return;
    setLoading(true);
    setResults(null);

    const prompt = `You are a scientific program officer matching grant proposals to expert reviewers for the W.M. Keck Foundation.

IMPORTANT CONSTRAINTS:
- Goldhaber-Gordon covers condensed matter physics and quantum MATERIALS — NOT quantum computing algorithms or quantum information science
- Gallivan covers biochemistry and synthetic biology chemistry — NOT synthetic organic or medicinal chemistry  
- Bradway provides INDUSTRY/TRANSLATIONAL perspective only — NOT scientific peer review
- Foster provides STRATEGY perspective only — NOT scientific peer review
- Kresa provides SYSTEMS ENGINEERING perspective only — NOT scientific peer review
- Marchetti covers active matter THEORY — NOT experimental cell biology
- Distinguish "can evaluate the quantum materials claims" from "can evaluate quantum computing claims"

Here is the research proposal:
"""
${proposal}
"""

Here are the available reviewers:
${buildReviewerContext()}

Task: Identify reviewers with genuine expertise to evaluate this proposal. Be selective and honest — only recommend reviewers with meaningful domain alignment. If a board member's role is non-scientific (Bradway, Foster, Kresa), only include them if their specific perspective adds distinct value, and label it clearly.

Respond ONLY with a JSON array (no markdown, no preamble):
[
  {
    "name": "Reviewer full name (exactly as given)",
    "match_strength": "strong" | "good" | "partial",
    "rationale": "1-2 sentence explanation referencing specific expertise",
    "perspective_type": "scientific" | "industry" | "strategic" | "systems"
  }
]

Order by match strength. Return [] if no reviewer is relevant.`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await response.json();
      const text = data.content?.map(b => b.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setResults(parsed);
    } catch (err) {
      setResults([]);
    }
    setLoading(false);
  };

  const getReviewer = (name) => REVIEWERS.find(r => r.name === name);
  const matchColor = (strength) =>
    strength === "strong" ? MATCH_COLORS[0] : strength === "good" ? MATCH_COLORS[1] : MATCH_COLORS[2];

  const filteredReviewers = REVIEWERS.filter(r => {
    const roleMatch = filterRole === "All" || r.role_type === filterRole;
    const fieldMatch = !filterField || 
      r.primary_fields.toLowerCase().includes(filterField.toLowerCase()) ||
      r.keywords.toLowerCase().includes(filterField.toLowerCase()) ||
      r.subfields.toLowerCase().includes(filterField.toLowerCase());
    return roleMatch && fieldMatch;
  });

  const roleOptions = ["All", "Consultant", "Board", "Research Program Staff"];

  return (
    <div style={{ fontFamily: "'Georgia', serif", minHeight: "100vh", background: "#f5f4f0", padding: "2rem" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "#8a7a6a", marginBottom: "0.4rem" }}>
            W.M. Keck Foundation
          </div>
          <h1 style={{ fontSize: "1.7rem", fontWeight: 700, color: "#1a1a1a", margin: 0, lineHeight: 1.2 }}>
            Reviewer Matching
          </h1>
          <div style={{ height: 2, width: 48, background: "#c8a96e", margin: "0.75rem 0" }} />
          <p style={{ color: "#5a4a3a", fontSize: "0.85rem", margin: 0, lineHeight: 1.6 }}>
            {REVIEWERS.length} reviewers in database ({REVIEWERS.filter(r=>r.role_type==="Consultant").length} consultants · {REVIEWERS.filter(r=>r.role_type==="Board").length} board · {REVIEWERS.filter(r=>r.role_type==="Research Program Staff").length} staff)
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
          {[["match","Match Proposal"],["browse","Browse Roster"]].map(([t,label]) => (
            <button key={t} onClick={()=>setTab(t)} style={{
              background: tab===t ? "#1a3a5c" : "#fff",
              color: tab===t ? "#fff" : "#444",
              border: "1px solid " + (tab===t ? "#1a3a5c" : "#ccc"),
              borderRadius: 4, padding: "0.45rem 1rem", fontSize: "0.82rem",
              fontFamily: "Georgia, serif", cursor: "pointer",
            }}>{label}</button>
          ))}
        </div>

        {/* ── MATCH TAB ── */}
        {tab === "match" && (
          <>
            <div style={{ background: "#fff", border: "1px solid #ddd8d0", borderRadius: 6, padding: "1.25rem", marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6a5a4a", marginBottom: "0.6rem" }}>
                Proposal Description
              </label>
              <textarea
                value={proposal}
                onChange={e => setProposal(e.target.value)}
                placeholder="Paste proposal title, abstract, or description here..."
                style={{
                  width: "100%", minHeight: 140, border: "1px solid #d5cfc5",
                  borderRadius: 4, padding: "0.75rem", fontSize: "0.9rem",
                  fontFamily: "Georgia, serif", color: "#2a2a2a", resize: "vertical",
                  background: "#fdfcfa", outline: "none", boxSizing: "border-box", lineHeight: 1.6,
                }}
              />
              <div style={{ marginTop: "0.9rem", display: "flex", justifyContent: "flex-end" }}>
                <button onClick={runMatch} disabled={loading || !proposal.trim()} style={{
                  background: proposal.trim() && !loading ? "#1a3a5c" : "#aaa",
                  color: "#fff", border: "none", borderRadius: 4, padding: "0.6rem 1.4rem",
                  fontSize: "0.85rem", fontFamily: "Georgia, serif", letterSpacing: "0.05em",
                  cursor: proposal.trim() && !loading ? "pointer" : "not-allowed",
                }}>
                  {loading ? "Matching…" : "Find Reviewers"}
                </button>
              </div>
            </div>

            {results !== null && (
              <div>
                <div style={{ fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6a5a4a", marginBottom: "0.9rem" }}>
                  {results.length === 0 ? "No matching reviewers found" : `${results.length} reviewer${results.length > 1 ? "s" : ""} identified`}
                </div>
                {results.length === 0 && (
                  <div style={{ background: "#fff", border: "1px solid #ddd8d0", borderRadius: 6, padding: "1.25rem", color: "#6a5a4a", fontSize: "0.9rem" }}>
                    No reviewers in the current database have sufficient expertise to evaluate this proposal.
                  </div>
                )}
                {results.map((r) => {
                  const rev = getReviewer(r.name);
                  if (!rev) return null;
                  const mc = matchColor(r.match_strength);
                  const rc = ROLE_COLORS[rev.role_type] || ROLE_COLORS["Consultant"];
                  const isOpen = expanded[r.name];
                  const isNonSci = r.perspective_type && r.perspective_type !== "scientific";

                  return (
                    <div key={r.name} style={{ background: "#fff", border: "1px solid #ddd8d0", borderRadius: 6, marginBottom: "0.75rem", overflow: "hidden" }}>
                      <div style={{ background: mc.bg, padding: "0.35rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: mc.text, fontWeight: 600 }}>
                          {mc.label}
                        </span>
                        {isNonSci && (
                          <span style={{ fontSize: "0.6rem", background: "#FFF0CC", color: "#7F4E00", borderRadius: 2, padding: "0.1rem 0.4rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                            {r.perspective_type} perspective
                          </span>
                        )}
                      </div>
                      <div style={{ padding: "1rem 1.1rem 0.9rem" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "0.25rem" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                              <span style={{ fontSize: "1rem", fontWeight: 700, color: "#1a1a1a" }}>{rev.name}</span>
                              <span style={{ fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", background: rc.bg, color: rc.text, border: `1px solid ${rc.border}`, borderRadius: 3, padding: "0.15rem 0.45rem" }}>
                                {rev.role_type}
                              </span>
                            </div>
                            <div style={{ fontSize: "0.8rem", color: "#5a4a3a", marginBottom: "0.5rem" }}>{rev.affiliation}</div>
                            <p style={{ margin: 0, fontSize: "0.87rem", color: "#3a3a3a", lineHeight: 1.55 }}>{r.rationale}</p>
                          </div>
                        </div>
                        <div style={{ marginTop: "0.7rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                          {rev.keywords.split(";").map(k => (
                            <span key={k} style={{ fontSize: "0.7rem", background: "#f0ece4", color: "#4a3a2a", borderRadius: 3, padding: "0.15rem 0.5rem", border: "1px solid #ddd5c8" }}>
                              {k.trim()}
                            </span>
                          ))}
                        </div>
                        <button onClick={() => toggle(r.name)} style={{ marginTop: "0.7rem", background: "none", border: "none", color: "#2e6da4", fontSize: "0.78rem", cursor: "pointer", padding: 0, fontFamily: "Georgia, serif", textDecoration: "underline" }}>
                          {isOpen ? "Hide details" : "Show full profile"}
                        </button>
                        {isOpen && (
                          <div style={{ marginTop: "0.9rem", borderTop: "1px solid #ede8e0", paddingTop: "0.9rem", fontSize: "0.82rem", color: "#3a3a3a", lineHeight: 1.6 }}>
                            <div style={{ marginBottom: "0.6rem" }}><span style={{ fontWeight: 600 }}>Primary Fields: </span>{rev.primary_fields}</div>
                            <div style={{ marginBottom: "0.6rem" }}><span style={{ fontWeight: 600 }}>Subfields: </span>{rev.subfields}</div>
                            <div style={{ marginBottom: "0.6rem" }}><span style={{ fontWeight: 600 }}>Methods: </span>{rev.methods}</div>
                            {rev.distinctions && <div style={{ marginBottom: "0.6rem" }}><span style={{ fontWeight: 600 }}>Distinctions: </span>{rev.distinctions}</div>}
                            {rev.keck_affiliation !== "None" && <div style={{ marginBottom: "0.6rem" }}><span style={{ fontWeight: 600 }}>Keck Role: </span>{rev.keck_affiliation}</div>}
                            {rev.orcid && <div><span style={{ fontWeight: 600 }}>ORCID: </span><a href={rev.orcid} target="_blank" rel="noreferrer" style={{ color: "#2e6da4" }}>{rev.orcid}</a></div>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── BROWSE TAB ── */}
        {tab === "browse" && (
          <>
            <div style={{ background: "#fff", border: "1px solid #ddd8d0", borderRadius: 6, padding: "1rem", marginBottom: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6a5a4a", marginBottom: "0.4rem" }}>Role</label>
                <select value={filterRole} onChange={e=>setFilterRole(e.target.value)} style={{ border: "1px solid #ccc", borderRadius: 4, padding: "0.4rem 0.7rem", fontFamily: "Georgia, serif", fontSize: "0.85rem", background: "#fdfcfa" }}>
                  {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ display: "block", fontSize: "0.7rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6a5a4a", marginBottom: "0.4rem" }}>Field / Keyword</label>
                <input value={filterField} onChange={e=>setFilterField(e.target.value)} placeholder="e.g. RNA, quantum, imaging..." style={{ width: "100%", border: "1px solid #ccc", borderRadius: 4, padding: "0.4rem 0.7rem", fontFamily: "Georgia, serif", fontSize: "0.85rem", background: "#fdfcfa", boxSizing: "border-box" }} />
              </div>
              <div style={{ fontSize: "0.8rem", color: "#8a7a6a", alignSelf: "center", whiteSpace: "nowrap" }}>
                {filteredReviewers.length} of {REVIEWERS.length}
              </div>
            </div>
            {filteredReviewers.map(rev => {
              const rc = ROLE_COLORS[rev.role_type] || ROLE_COLORS["Consultant"];
              const isOpen = expanded[rev.name];
              const isNonSci = rev.name === "Robert A. Bradway" || rev.name === "Richard N. Foster";
              return (
                <div key={rev.name} style={{ background: "#fff", border: "1px solid #ddd8d0", borderRadius: 6, marginBottom: "0.6rem", overflow: "hidden" }}>
                  <div style={{ padding: "0.9rem 1.1rem 0.8rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.2rem" }}>
                      <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1a1a1a" }}>{rev.name}</span>
                      <span style={{ fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", background: rc.bg, color: rc.text, border: `1px solid ${rc.border}`, borderRadius: 3, padding: "0.15rem 0.45rem" }}>{rev.role_type}</span>
                      {isNonSci && <span style={{ fontSize: "0.6rem", background: "#FFF0CC", color: "#7F4E00", borderRadius: 2, padding: "0.1rem 0.4rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>non-scientific</span>}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#5a4a3a", marginBottom: "0.45rem" }}>{rev.affiliation}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "0.5rem" }}>
                      {rev.keywords.split(";").map(k => (
                        <span key={k} style={{ fontSize: "0.68rem", background: "#f0ece4", color: "#4a3a2a", borderRadius: 3, padding: "0.12rem 0.45rem", border: "1px solid #ddd5c8" }}>{k.trim()}</span>
                      ))}
                    </div>
                    <button onClick={()=>toggle(rev.name)} style={{ background: "none", border: "none", color: "#2e6da4", fontSize: "0.75rem", cursor: "pointer", padding: 0, fontFamily: "Georgia, serif", textDecoration: "underline" }}>
                      {isOpen ? "Hide" : "Show profile"}
                    </button>
                    {isOpen && (
                      <div style={{ marginTop: "0.8rem", borderTop: "1px solid #ede8e0", paddingTop: "0.8rem", fontSize: "0.8rem", color: "#3a3a3a", lineHeight: 1.6 }}>
                        <div style={{ marginBottom: "0.5rem" }}><span style={{ fontWeight: 600 }}>Expertise: </span>{rev.expertise}</div>
                        <div style={{ marginBottom: "0.5rem" }}><span style={{ fontWeight: 600 }}>Primary Fields: </span>{rev.primary_fields}</div>
                        <div style={{ marginBottom: "0.5rem" }}><span style={{ fontWeight: 600 }}>Subfields: </span>{rev.subfields}</div>
                        <div style={{ marginBottom: "0.5rem" }}><span style={{ fontWeight: 600 }}>Methods: </span>{rev.methods}</div>
                        {rev.distinctions && <div style={{ marginBottom: "0.5rem" }}><span style={{ fontWeight: 600 }}>Distinctions: </span>{rev.distinctions}</div>}
                        {rev.keck_affiliation !== "None" && <div style={{ marginBottom: "0.5rem" }}><span style={{ fontWeight: 600 }}>Keck Role: </span>{rev.keck_affiliation}</div>}
                        {rev.orcid && <div><span style={{ fontWeight: 600 }}>ORCID: </span><a href={rev.orcid} target="_blank" rel="noreferrer" style={{ color: "#2e6da4" }}>{rev.orcid}</a></div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
