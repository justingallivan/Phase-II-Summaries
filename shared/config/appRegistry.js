/**
 * App Registry - Single source of truth for all application definitions
 *
 * Used by Layout.js (navigation), index.js (home page), and access control.
 * App keys match the page path minus the leading slash.
 */

export const APP_REGISTRY = [
  {
    key: 'concept-evaluator',
    name: 'Concept Evaluator',
    href: '/concept-evaluator',
    icon: '🔬',
    description: 'Screen research concepts with AI analysis and automated literature search to identify the strongest candidates',
    categories: ['concepts'],
    features: ['AI Analysis', 'Literature Search', 'Novelty Assessment', 'Batch Evaluation'],
  },
  {
    key: 'multi-perspective-evaluator',
    name: 'Multi-Perspective Evaluator',
    href: '/multi-perspective-evaluator',
    icon: '🎭',
    description: 'Evaluate concepts using three AI perspectives (Optimist, Skeptic, Neutral) with integrated synthesis and recommendations',
    categories: ['concepts'],
    features: ['3 AI Perspectives', 'Consensus Analysis', 'Disagreement Resolution', 'Framework Selection'],
  },
  {
    key: 'batch-phase-i-summaries',
    name: 'Batch Phase I Summaries',
    href: '/batch-phase-i-summaries',
    icon: '📑',
    description: 'Process multiple Phase I proposals simultaneously with customizable summary length',
    categories: ['phase-i'],
    features: ['Batch Processing', 'Phase I Specific', 'Custom Length', 'Bulk Export'],
  },
  {
    key: 'batch-proposal-summaries',
    name: 'Batch Phase II Summaries',
    href: '/batch-proposal-summaries',
    icon: '📑',
    description: 'Process multiple Phase II proposals simultaneously with customizable summary length',
    categories: ['phase-ii'],
    features: ['Batch Processing', 'Custom Length', 'Multi-File Upload', 'Bulk Export'],
  },
  {
    key: 'funding-gap-analyzer',
    name: 'Funding Analysis',
    href: '/funding-gap-analyzer',
    icon: '💵',
    description: 'Analyze federal funding landscapes for research proposals using NSF, NIH, and USAspending.gov data',
    categories: ['phase-i', 'phase-ii'],
    features: ['NSF Awards API', 'NIH RePORTER', 'USAspending.gov', 'Funding Gap Analysis'],
  },
  {
    key: 'phase-i-writeup',
    name: 'Create Phase I Writeup Draft',
    href: '/phase-i-writeup',
    icon: '✍️',
    description: 'Generate Keck Foundation Phase I writeup drafts with standardized formatting',
    categories: ['phase-i'],
    features: ['PDF Analysis', '1-Page Format', 'Institution Detection', 'Export Options'],
  },
  {
    key: 'proposal-summarizer',
    name: 'Create Phase II Writeup Draft',
    href: '/proposal-summarizer',
    icon: '✍️',
    description: 'Generate Keck Foundation Phase II writeup drafts with standardized formatting',
    categories: ['phase-ii'],
    features: ['PDF Analysis', 'Claude AI Drafts', 'Q&A Chat', 'Export Options'],
  },
  {
    key: 'reviewer-finder',
    name: 'Reviewer Finder',
    href: '/reviewer-finder',
    icon: '🎯',
    description: 'Find qualified peer reviewers using Claude AI analysis combined with real database verification (PubMed, ArXiv, BioRxiv, ChemRxiv)',
    categories: ['phase-i', 'phase-ii'],
    features: ['Claude AI Analysis', 'Database Verification', 'Publication Links', 'Reasoning Explanations'],
  },
  {
    key: 'peer-review-summarizer',
    name: 'Summarize Peer Reviews',
    href: '/peer-review-summarizer',
    icon: '📝',
    description: 'Analyze peer review feedback and generate site visit questions',
    categories: ['phase-ii'],
    features: ['Review Analysis', 'Common Themes', 'Action Items', 'Response Templates'],
  },
  {
    key: 'expense-reporter',
    name: 'Expense Reporter',
    href: '/expense-reporter',
    icon: '💰',
    description: 'Extract and organize expense data from receipts and invoices with automated categorization',
    categories: ['other'],
    features: ['Receipt OCR', 'Image Processing', 'Auto-Categorization', 'Excel/CSV Export'],
  },
  {
    key: 'literature-analyzer',
    name: 'Literature Analyzer',
    href: '/literature-analyzer',
    icon: '📖',
    description: 'Comprehensive analysis and synthesis of research papers and academic literature',
    categories: ['other'],
    features: ['Paper Synthesis', 'Theme Extraction', 'Cross-Paper Synthesis', 'Export Reports'],
  },
  {
    key: 'dynamics-explorer',
    name: 'Dynamics Explorer',
    href: '/dynamics-explorer',
    icon: '💬',
    description: 'Chat with your CRM data using natural language. Query, explore, and export Dynamics 365 records with AI-powered assistance',
    categories: ['other'],
    features: ['Natural Language Queries', 'Schema Discovery', 'Data Export', 'Multi-Turn Chat'],
  },
  {
    key: 'integrity-screener',
    name: 'Applicant Integrity Screener',
    href: '/integrity-screener',
    icon: '🔍',
    description: 'Screen grant applicants for research integrity concerns using Retraction Watch, PubPeer, and news sources',
    categories: ['phase-i', 'phase-ii'],
    features: ['Retraction Watch DB', 'PubPeer Search', 'News Analysis', 'AI Summarization'],
  },
];

/** All app keys for convenience */
export const ALL_APP_KEYS = APP_REGISTRY.map(app => app.key);

/** Paths that are always accessible (no app grant required) */
export const ALWAYS_ACCESSIBLE = ['/', '/admin', '/profile-settings', '/auth/signin', '/auth/error'];

/** App keys granted to new users by default */
export const DEFAULT_APP_GRANTS = ['dynamics-explorer'];
