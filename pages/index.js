import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

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
    id: 'find-reviewers',
    title: 'Find Reviewers',
    description: 'Identify and match expert reviewers for grant proposals based on expertise and research areas',
    icon: '🔎',
    status: 'active',
    features: ['Expert Matching', 'Research Area Analysis', 'Reviewer Profiles', 'Conflict Detection'],
    path: '/find-reviewers'
  },
  {
    id: 'peer-review-summarizer',
    title: 'Summarize Peer Reviews',
    description: 'Synthesize and analyze peer review feedback with actionable insights and recommendations',
    icon: '📝',
    status: 'active',
    features: ['Review Analysis', 'Common Themes', 'Action Items', 'Response Templates'],
    path: '/peer-review-summarizer'
  },
  {
    id: 'expense-reporter',
    title: 'Expense Reporter',
    description: 'Extract and organize expense data from receipts and invoices with automated categorization',
    icon: '💰',
    status: 'active',
    features: ['Receipt OCR', 'Image Processing', 'Auto-Categorization', 'Excel/CSV Export'],
    path: '/expense-reporter'
  },
  {
    id: 'literature-analyzer',
    title: 'Literature Analyzer',
    description: 'Comprehensive analysis and synthesis of research papers and academic literature',
    icon: '📖',
    status: 'coming-soon',
    features: ['Paper Synthesis', 'Citation Analysis', 'Theme Extraction', 'Knowledge Mapping'],
    path: '/literature-analyzer'
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
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Document Processing Suite</title>
        <meta name="description" content="AI-powered document processing applications for research, analysis, and automation" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* Header Section */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              📄 Document Processing Suite
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              AI-powered applications for research analysis, document processing, and workflow automation
            </p>
          </div>
        </div>
      </header>

      {/* Filter Section */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-center">
            <div className="flex flex-col sm:flex-row gap-2 bg-gray-100 p-2 rounded-lg">
              <button 
                className={`px-6 py-3 font-semibold rounded-lg transition-all duration-200 ${
                  selectedCategory === 'all' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                onClick={() => setSelectedCategory('all')}
              >
                All Apps ({apps.length})
              </button>
              <button 
                className={`px-6 py-3 font-semibold rounded-lg transition-all duration-200 ${
                  selectedCategory === 'active' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                onClick={() => setSelectedCategory('active')}
              >
                Available ({apps.filter(a => a.status === 'active').length})
              </button>
              <button 
                className={`px-6 py-3 font-semibold rounded-lg transition-all duration-200 ${
                  selectedCategory === 'coming-soon' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                onClick={() => setSelectedCategory('coming-soon')}
              >
                Coming Soon ({apps.filter(a => a.status === 'coming-soon').length})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredApps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">
            <p className="text-gray-600 mb-4">Built with Claude AI • Powered by Next.js • Deployed on Vercel</p>
            <div className="flex justify-center items-center gap-4">
              <a 
                href="https://github.com/justingallivan/Phase-II-Summaries" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-gray-700 transition-colors duration-200"
              >
                GitHub
              </a>
              <span className="text-gray-300">•</span>
              <a 
                href="https://claude.ai" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-gray-700 transition-colors duration-200"
              >
                Claude AI
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AppCard({ app }) {
  const isActive = app.status === 'active';
  
  const CardContent = (
    <div className={`
      bg-white border border-gray-200 rounded-xl p-6 shadow-sm
      transition-all duration-200 hover:shadow-md hover:border-gray-300
      ${isActive ? 'cursor-pointer hover:scale-[1.02]' : 'opacity-75'}
      group h-full flex flex-col
    `}>
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="text-3xl flex-shrink-0">{app.icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-gray-800">
            {app.title}
          </h3>
          <span className={`
            inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold
            ${app.status === 'active' 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-amber-50 text-amber-700 border border-amber-200'
            }
          `}>
            {app.status === 'active' ? '✓ Available' : '⏳ Coming Soon'}
          </span>
        </div>
      </div>
      
      {/* Description */}
      <p className="text-gray-600 text-sm leading-relaxed mb-4 group-hover:text-gray-700">
        {app.description}
      </p>
      
      {/* Features */}
      <div className="flex flex-wrap gap-2 mb-6 flex-grow">
        {app.features.map((feature, index) => (
          <span 
            key={index} 
            className="inline-flex items-center px-2 py-1 bg-gray-50 text-gray-600 text-xs rounded border border-gray-200"
          >
            {feature}
          </span>
        ))}
      </div>
      
      {/* Action Button */}
      <div className="mt-auto">
        {isActive ? (
          <div className="flex items-center justify-center py-3 px-6 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-lg transition-all duration-200">
            <span>Launch App</span>
            <span className="ml-2 group-hover:translate-x-1 transition-transform duration-200">→</span>
          </div>
        ) : (
          <div className="flex items-center justify-center py-3 px-6 bg-gray-100 text-gray-500 font-semibold rounded-lg cursor-not-allowed">
            Coming Soon
          </div>
        )}
      </div>
    </div>
  );

  if (isActive) {
    return (
      <Link href={app.path} className="block h-full">
        {CardContent}
      </Link>
    );
  }

  return CardContent;
}