/**
 * Sample Claude API response fixtures for testing
 */

export const MOCK_SUMMARIZATION_RESPONSE = `
## Executive Summary
• This proposal addresses the fundamental challenge of protein folding prediction using computational methods
• The research combines molecular dynamics simulations with machine learning to achieve unprecedented accuracy
• Led by Dr. Sarah Johnson and Dr. Michael Chen from Stanford University with complementary expertise
• Expected to yield breakthrough insights into protein misfolding diseases like Alzheimer's and Parkinson's
• Requires foundation support due to the high-risk, interdisciplinary nature that traditional funding agencies avoid

## Background & Impact
Protein folding represents one of biology's most critical unsolved problems, with direct implications for understanding and treating neurodegenerative diseases. Current experimental techniques cannot capture the rapid folding process, while existing computational methods lack the resolution needed for therapeutic development. This research would fill a crucial gap by developing new algorithms capable of predicting folding pathways with atomic precision.

## Methodology
The research employs a three-pronged computational approach: enhanced molecular dynamics simulations using GPU clusters, machine learning algorithms adapted from natural language processing, and quantum computing platforms for complex calculations. The team will validate predictions through experimental collaborations and iterative refinement of computational models.

## Personnel
The principal investigator is <u>Dr. Sarah Johnson</u>, a professor of biochemistry at Stanford University with 15 years of experience and over 100 publications in protein science. Co-investigator <u>Dr. Michael Chen</u> is an associate professor of computer science at Stanford University specializing in machine learning applications to biological systems.

## Justification for Keck Funding
Traditional funding agencies typically avoid supporting highly interdisciplinary projects that span multiple departments and require substantial computational resources. The integration of quantum computing with biological research represents a speculative but potentially transformative approach that federal agencies would consider too risky for standard funding mechanisms.
`;

export const MOCK_METADATA_RESPONSE = {
  filename: "stanford_protein_folding.pdf",
  institution: "Stanford University",
  principal_investigator: "Dr. Sarah Johnson",
  investigators: ["Dr. Sarah Johnson", "Dr. Michael Chen"],
  research_area: "Computational Biology",
  methods: ["Molecular Dynamics", "Machine Learning", "Quantum Computing"],
  funding_amount: "$2.5 million",
  duration: "5 years",
  keywords: ["protein folding", "computational biology", "machine learning"]
};

export const MOCK_REVIEWER_EXTRACTION_RESPONSE = {
  title: "Advanced Computational Methods for Understanding Protein Folding Dynamics",
  primaryResearchArea: "Computational Biology",
  secondaryAreas: "Biochemistry, Computer Science, Biophysics",
  keyMethodologies: "Molecular dynamics simulation, Machine learning, GPU computing",
  authorInstitution: "Stanford University",
  researchScope: "Computational",
  interdisciplinary: "Yes",
  keyInnovations: "Enhanced MD algorithms, ML for folding prediction, Quantum computing integration",
  applicationDomains: "Drug discovery, Disease treatment, Therapeutic development"
};

export const MOCK_DOCUMENT_ANALYSIS_RESPONSE = `
**DOCUMENT OVERVIEW**
This document presents a comprehensive research proposal for developing computational methods to understand protein folding dynamics, combining molecular dynamics simulations with machine learning approaches.

**KEY POINTS**
• Addresses protein folding mechanisms implicated in major diseases like Alzheimer's and Parkinson's
• Proposes novel computational algorithms using GPU clusters and quantum computing platforms
• Integrates machine learning with traditional molecular dynamics for improved accuracy
• Plans validation through experimental collaborations and iterative model refinement
• Expected to generate new therapeutic targets for protein misfolding diseases

**MAIN THEMES**
The document focuses on three main themes: computational innovation in biological research, interdisciplinary collaboration between computer science and biochemistry, and translational potential for disease treatment.

**TECHNICAL DETAILS**
The methodology involves enhanced molecular dynamics simulation algorithms, transformer architectures adapted for protein sequences, GPU cluster computing, and quantum computing platforms for complex calculations.

**RECOMMENDATIONS OR CONCLUSIONS**
The proposal recommends a 5-year research program with $2.5 million funding, emphasizing the need for sustained support of high-risk interdisciplinary research with transformative potential.

**NOTABLE INSIGHTS**
The integration of quantum computing with biological simulation represents a particularly innovative approach that could revolutionize computational biology beyond the immediate protein folding applications.
`;

export const MOCK_PEER_REVIEW_ANALYSIS = `
We received 3 reviews

The proposal received two reviews of Excellent and one of Very Good.

The reviewers were <u>Dr. Martin Thompson</u> (University of Chicago, expertise in structural biology), <u>Dr. Elena Rodriguez</u> (Caltech, expertise in computational methods), and <u>Dr. James Liu</u> (could not be determined from review documents).

The overall tone of the reviews was highly positive, with reviewers praising the innovative approach and strong team qualifications. Common themes included enthusiasm for the interdisciplinary approach and concerns about computational resource requirements.

The most positive reviewer said: "This represents exactly the kind of innovative, high-risk research that could transform our understanding of protein folding mechanisms."

Another reviewer noted: "The integration of machine learning with molecular dynamics is technically sound and addresses real limitations in current approaches."

The most critical reviewer noted: "While the approach is promising, the computational requirements may be underestimated, and the timeline seems optimistic for such complex algorithm development."

## Questions and Concerns

• How will the team handle the massive computational requirements during peak simulation periods?
• What contingency plans exist if the machine learning models fail to converge on meaningful folding predictions?
• Has the team considered potential intellectual property issues with quantum computing collaborations?
• What specific validation metrics will be used to assess the accuracy of folding predictions?
• How will the interdisciplinary nature of the project be managed across different departmental structures?
`;

export const MOCK_ERROR_RESPONSES = {
  RATE_LIMIT: {
    error: {
      type: "rate_limit_error",
      message: "Rate limit exceeded"
    }
  },
  
  INVALID_REQUEST: {
    error: {
      type: "invalid_request_error", 
      message: "Invalid request format"
    }
  },
  
  API_ERROR: {
    error: {
      type: "api_error",
      message: "Internal server error"
    }
  }
};

export const MOCK_STREAMING_RESPONSES = [
  { progress: 10, message: "Processing document..." },
  { progress: 30, message: "Analyzing content..." },
  { progress: 60, message: "Generating summary..." },
  { progress: 90, message: "Finalizing results..." },
  { progress: 100, message: "Complete!", results: { summary: MOCK_SUMMARIZATION_RESPONSE } }
];

export const MOCK_BATCH_RESPONSES = {
  1: "Concise 1-page summary focusing on essential information...",
  2: "Detailed 2-page summary with comprehensive coverage...", 
  3: "Thorough 3-page analysis with extensive context...",
  4: "Complete 4-page evaluation with supporting details...",
  5: "Comprehensive 5-page assessment with full documentation..."
};

export const MOCK_QUALITY_SCORES = {
  HIGH_QUALITY: {
    score: 9,
    strengths: ["Comprehensive coverage", "Clear structure", "Accurate information"],
    improvements: ["Minor formatting adjustments"],
    missing: []
  },
  
  MEDIUM_QUALITY: {
    score: 6,
    strengths: ["Good overall structure", "Covers main points"],
    improvements: ["Needs more technical detail", "Could improve clarity"],
    missing: ["Budget information", "Timeline details"]
  },
  
  LOW_QUALITY: {
    score: 3,
    strengths: ["Basic information present"],
    improvements: ["Major structural issues", "Missing key sections", "Unclear writing"],
    missing: ["Methodology", "Team qualifications", "Impact assessment"]
  }
};