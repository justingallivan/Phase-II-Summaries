import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';

export default function Layout({ 
  children, 
  title = 'Document Processing Suite',
  description = 'AI-powered document processing applications for research, analysis, and automation',
  showNavigation = true,
  maxWidth = '7xl'
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigationItems = [
    { name: 'Home', href: '/', icon: '🏠' },
    { name: 'Create Phase II Writeup Draft', href: '/proposal-summarizer', icon: '✍️' },
    { name: 'Phase I Writeup', href: '/phase-i-writeup', icon: '✍️' },
    { name: 'Batch Phase II', href: '/batch-proposal-summaries', icon: '📑' },
    { name: 'Batch Phase I', href: '/batch-phase-i-summaries', icon: '📑' },
    { name: 'Reviewer Finder', href: '/reviewer-finder', icon: '🎯' },
    { name: 'Peer Review Summary', href: '/peer-review-summarizer', icon: '📝' },
    { name: 'Expense Reporter', href: '/expense-reporter', icon: '💰' },
    { name: 'Funding Gap Analyzer', href: '/funding-gap-analyzer', icon: '💵' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className={`max-w-${maxWidth} mx-auto px-4`}>
          <div className="flex justify-between items-center py-4">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 text-xl font-bold text-gray-900 hover:text-gray-700 transition-colors">
              <span>📄</span>
              <span className="hidden sm:inline">Document Processing Suite</span>
              <span className="sm:hidden">Doc Suite</span>
            </Link>

            {/* Desktop Navigation */}
            {showNavigation && (
              <nav className="hidden md:flex items-center gap-1">
                {navigationItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all duration-200"
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.name}</span>
                  </Link>
                ))}
              </nav>
            )}

            {/* Mobile Menu Button */}
            {showNavigation && (
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all duration-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                </svg>
              </button>
            )}
          </div>

          {/* Mobile Navigation */}
          {showNavigation && isMobileMenuOpen && (
            <div className="md:hidden border-t border-gray-200 py-4">
              <nav className="space-y-2">
                {navigationItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 px-3 py-2 text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all duration-200"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span>{item.name}</span>
                  </Link>
                ))}
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className={`max-w-${maxWidth} mx-auto px-4`}>
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className={`max-w-${maxWidth} mx-auto px-4 py-8`}>
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              Built with Claude AI • Powered by Next.js • Deployed on Vercel
            </p>
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

// Page Header Component for consistent page titles
export function PageHeader({ title, subtitle, icon, children }) {
  return (
    <div className="bg-white shadow-sm border-b border-gray-200 -mx-4 mb-8">
      <div className="px-4 py-8">
        <div className="text-center">
          <div className="flex justify-center items-center gap-3 mb-4">
            {icon && <span className="text-4xl">{icon}</span>}
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
              {title}
            </h1>
          </div>
          {subtitle && (
            <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
              {subtitle}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

// Card Component for consistent card styling
export function Card({ 
  children, 
  className = '',
  hover = true,
  padding = 'p-6'
}) {
  return (
    <div className={`
      bg-white border border-gray-200 rounded-xl shadow-sm
      ${hover ? 'transition-all duration-200 hover:shadow-md hover:border-gray-300' : ''}
      ${padding} ${className}
    `}>
      {children}
    </div>
  );
}

// Button Component for consistent styling
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  ...props
}) {
  const baseClasses = 'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variants = {
    primary: 'bg-gray-900 hover:bg-gray-800 text-white focus:ring-gray-500',
    secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-900 focus:ring-gray-300',
    outline: 'border border-gray-300 hover:border-gray-400 text-gray-700 bg-white hover:bg-gray-50 focus:ring-gray-300',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500'
  };

  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg'
  };

  const disabledClasses = 'opacity-50 cursor-not-allowed hover:bg-gray-400';

  return (
    <button
      className={`
        ${baseClasses}
        ${variants[variant]}
        ${sizes[size]}
        ${disabled || loading ? disabledClasses : ''}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
      )}
      {children}
    </button>
  );
}