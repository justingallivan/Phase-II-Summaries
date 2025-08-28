import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import styles from '../styles/Landing.module.css';

const apps = [
  {
    id: 'document-analyzer',
    title: 'Document Analyzer',
    description: 'Comprehensive AI-powered document analysis with insights, themes, and structured data extraction',
    icon: '🔍',
    status: 'active',
    features: ['AI Analysis', 'Theme Extraction', 'Structured Data', 'Multi-Format Export'],
    path: '/document-analyzer'
  },
  {
    id: 'proposal-summarizer',
    title: 'Create Phase II Writeup Draft',
    description: 'Generate standardized writeup drafts from PDF research proposals using Claude AI',
    icon: '🔬',
    status: 'active',
    features: ['PDF Analysis', 'Claude AI Drafts', 'Q&A Chat', 'Export Options'],
    path: '/proposal-summarizer'
  },
  {
    id: 'batch-proposal-summaries',
    title: 'Batch Proposal Summaries',
    description: 'Process multiple proposals at once with customizable summary length (1-5 pages)',
    icon: '📚',
    status: 'active',
    features: ['Batch Processing', 'Custom Length', 'Multi-File Upload', 'Bulk Export'],
    path: '/batch-proposal-summaries'
  },
  {
    id: 'grant-reviewer',
    title: 'Grant Reviewer',
    description: 'Automated scoring and evaluation of grant proposals with detailed feedback',
    icon: '📊',
    status: 'coming-soon',
    features: ['Scoring System', 'Evaluation Criteria', 'Comparative Analysis', 'Review Reports'],
    path: '/grant-reviewer'
  },
  {
    id: 'literature-analyzer',
    title: 'Literature Analyzer',
    description: 'Comprehensive analysis and synthesis of research papers and academic literature',
    icon: '📖',
    status: 'coming-soon',
    features: ['Paper Synthesis', 'Citation Analysis', 'Theme Extraction', 'Knowledge Mapping'],
    path: '/literature-analyzer'
  },
  {
    id: 'peer-review-summarizer',
    title: 'Summarize Peer Reviews',
    description: 'Synthesize and analyze peer review feedback with actionable insights and recommendations',
    icon: '📝',
    status: 'active',
    features: ['Review Analysis', 'Common Themes', 'Action Items', 'Response Templates'],
    path: '/peer-review-summarizer'
  }
];

export default function LandingPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filteredApps = apps.filter(app => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'active') return app.status === 'active';
    if (selectedCategory === 'coming-soon') return app.status === 'coming-soon';
    return true;
  });

  return (
    <div className={styles.container}>
      <Head>
        <title>Document Processing Suite</title>
        <meta name="description" content="AI-powered document processing applications for research, analysis, and automation" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>📄 Document Processing Suite</h1>
          <p className={styles.subtitle}>
            AI-powered applications for research analysis, document processing, and workflow automation
          </p>
        </div>
      </div>

      <div className={styles.filterSection}>
        <div className={styles.filterButtons}>
          <button 
            className={`${styles.filterBtn} ${selectedCategory === 'all' ? styles.active : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            All Apps ({apps.length})
          </button>
          <button 
            className={`${styles.filterBtn} ${selectedCategory === 'active' ? styles.active : ''}`}
            onClick={() => setSelectedCategory('active')}
          >
            Available ({apps.filter(a => a.status === 'active').length})
          </button>
          <button 
            className={`${styles.filterBtn} ${selectedCategory === 'coming-soon' ? styles.active : ''}`}
            onClick={() => setSelectedCategory('coming-soon')}
          >
            Coming Soon ({apps.filter(a => a.status === 'coming-soon').length})
          </button>
        </div>
      </div>

      <div className={styles.appsGrid}>
        {filteredApps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerContent}>
          <p>Built with Claude AI • Powered by Next.js • Deployed on Vercel</p>
          <div className={styles.footerLinks}>
            <a href="https://github.com/justingallivan/Phase-II-Summaries" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <span>•</span>
            <a href="https://claude.ai" target="_blank" rel="noopener noreferrer">
              Claude AI
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppCard({ app }) {
  const isActive = app.status === 'active';
  
  const CardContent = (
    <div className={`${styles.appCard} ${isActive ? styles.active : styles.disabled}`}>
      <div className={styles.cardHeader}>
        <div className={styles.appIcon}>{app.icon}</div>
        <div className={styles.cardHeaderText}>
          <h3 className={styles.appTitle}>{app.title}</h3>
          <span className={`${styles.statusBadge} ${styles[app.status]}`}>
            {app.status === 'active' ? 'Available' : 'Coming Soon'}
          </span>
        </div>
      </div>
      
      <p className={styles.appDescription}>{app.description}</p>
      
      <div className={styles.featureList}>
        {app.features.map((feature, index) => (
          <span key={index} className={styles.feature}>
            {feature}
          </span>
        ))}
      </div>
      
      <div className={styles.cardFooter}>
        {isActive ? (
          <div className={styles.launchButton}>
            Launch App →
          </div>
        ) : (
          <div className={styles.comingSoonButton}>
            Coming Soon
          </div>
        )}
      </div>
    </div>
  );

  if (isActive) {
    return (
      <Link href={app.path} className={styles.cardLink}>
        {CardContent}
      </Link>
    );
  }

  return CardContent;
}