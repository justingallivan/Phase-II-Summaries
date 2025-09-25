/**
 * Sample proposal text fixtures for testing
 */

export const SHORT_PROPOSAL = `
Title: Machine Learning Applications in Climate Science

Abstract: This proposal outlines a research project to develop novel machine learning algorithms for climate data analysis. The project aims to improve weather prediction accuracy by 15% through advanced neural network architectures.

Principal Investigator: Dr. Jane Smith, Professor of Computer Science at University of California, Berkeley.

The research will focus on deep learning models specifically designed for time-series climate data, incorporating both satellite observations and ground-based measurements.
`;

export const LONG_PROPOSAL = `
Title: Advanced Computational Methods for Understanding Protein Folding Dynamics

Abstract: Protein folding is one of the most fundamental processes in biology, yet our understanding of the mechanisms governing this process remains incomplete. This proposal presents a comprehensive research program to develop and apply advanced computational methods for studying protein folding dynamics at unprecedented resolution and scale.

Principal Investigator: Dr. Sarah Johnson, Professor of Biochemistry at Stanford University
Co-Investigator: Dr. Michael Chen, Associate Professor of Computer Science at Stanford University

Background and Significance:
Protein misfolding is implicated in numerous diseases including Alzheimer's, Parkinson's, and type 2 diabetes. Understanding the molecular mechanisms of protein folding could lead to breakthrough treatments for these conditions. Current experimental techniques provide limited insight into the folding process due to the extremely fast timescales involved (microseconds to milliseconds) and the difficulty in observing intermediate states.

Research Approach:
Our interdisciplinary team will combine expertise in biochemistry, computer science, and biophysics to address this challenge. We propose three specific aims:

1. Development of enhanced molecular dynamics simulation algorithms capable of capturing folding events with atomic resolution
2. Integration of machine learning approaches to predict folding pathways from sequence data
3. Validation of computational predictions through collaboration with experimental groups

Methodology:
We will employ state-of-the-art computational resources including GPU clusters and quantum computing platforms. Our approach builds on recent advances in machine learning, particularly transformer architectures adapted for protein sequences.

Expected Outcomes:
This research is expected to yield:
- Novel computational tools for protein folding prediction
- Fundamental insights into folding mechanisms
- Potential therapeutic targets for protein misfolding diseases

Budget and Timeline:
The project is planned for 5 years with a total budget of $2.5 million. Year 1 will focus on algorithm development, years 2-4 on implementation and testing, and year 5 on validation and dissemination.

Research Team:
Dr. Johnson brings 15 years of experience in protein biochemistry and has published over 100 peer-reviewed articles. Dr. Chen is an expert in machine learning with specific experience in biological applications.

Broader Impacts:
This work will train graduate students and postdocs in interdisciplinary research methods and contribute to understanding of fundamental biological processes with direct healthcare applications.
`;

export const MINIMAL_PROPOSAL = `
Brief Research Summary
PI: Dr. Test Researcher
Institution: Test University
Research Area: Computer Science
Methods: Computational analysis
`;

export const PROPOSAL_WITH_SPECIAL_CHARS = `
Title: Résumé-based Café Studies & "Collaborative" Research

Abstract: This proposal examines the effects of café environments on productivity. Special characters include: é, ñ, ü, and symbols like @, #, $, %, &.

The research involves multiple "phases" and uses 'various' quotation marks. It also includes mathematical notation: α, β, γ, and equations like E=mc².

PI: Dr. François O-Connell-Smith
`;

export const MULTILINGUAL_PROPOSAL = `
Title: Cross-Cultural Communication in Global Teams

Abstract: This research examines communication patterns in international collaborations. The study includes participants from various countries and cultures.

Keywords: collaboration, communication, multicultural, global teams

Some text in different languages:
- Spanish: La comunicación es fundamental
- French: La communication est essentielle  
- German: Kommunikation ist wichtig
- Chinese: 沟通很重要

PI: Dr. International Researcher
`;

/**
 * Sample proposal metadata for testing structured extraction
 */
export const SAMPLE_METADATA = {
  filename: 'stanford_university_protein_folding.pdf',
  institution: 'Stanford University',
  principal_investigator: 'Dr. Sarah Johnson',
  investigators: ['Dr. Sarah Johnson', 'Dr. Michael Chen'],
  research_area: 'Biochemistry/Computer Science',
  methods: ['Molecular dynamics simulation', 'Machine learning', 'GPU computing'],
  funding_amount: '$2.5 million',
  duration: '5 years',
  keywords: ['protein folding', 'molecular dynamics', 'machine learning', 'computational biology']
};

/**
 * Sample reviewer recommendations for testing
 */
export const SAMPLE_REVIEWERS = `
1. **Dr. David Wilson, Professor**
   Institution: MIT, Department of Biology
   Expertise: Protein folding mechanisms, structural biology
   Why Good Match: Leading expert in experimental protein folding studies with 20+ years experience. Has published extensively on folding intermediates and would provide excellent evaluation of the computational predictions.
   Potential Concerns: None identified
   Seniority: Senior

2. **Dr. Lisa Zhang, Associate Professor**
   Institution: UCSF, Department of Biophysics
   Expertise: Computational biology, molecular simulations
   Why Good Match: Expert in molecular dynamics simulations with specific experience in protein systems. Would be ideal to evaluate the technical computational approaches.
   Potential Concerns: None identified  
   Seniority: Mid-Career

3. **Dr. Robert Kumar, Professor**
   Institution: Harvard University, School of Medicine
   Expertise: Machine learning in biology, protein structure prediction
   Why Good Match: Pioneer in applying ML to protein problems. Would provide critical assessment of the machine learning components and their biological relevance.
   Potential Concerns: None identified
   Seniority: Senior
`;

/**
 * Error cases for testing robustness
 */
export const ERROR_CASES = {
  EMPTY_TEXT: '',
  NULL_TEXT: null,
  UNDEFINED_TEXT: undefined,
  VERY_SHORT_TEXT: 'Too short',
  ONLY_WHITESPACE: '   \n\t   ',
  NON_STRING: { not: 'a string' },
  MALFORMED_PDF: 'This is not a valid PDF content',
  MISSING_FILENAME: '',
};

/**
 * Performance testing data
 */
export const LARGE_PROPOSAL = SHORT_PROPOSAL.repeat(1000); // ~50KB text
export const EXTRA_LARGE_PROPOSAL = SHORT_PROPOSAL.repeat(5000); // ~250KB text