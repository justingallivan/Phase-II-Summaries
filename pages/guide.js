import { useState, useEffect, useRef } from 'react';
import Layout, { Card } from '../shared/components/Layout';
import { useAppAccess } from '../shared/context/AppAccessContext';
import { GUIDE_SECTIONS } from '../shared/config/guideContent';

export default function GuidePage() {
  const { hasAccess, isSuperuser } = useAppAccess();
  const [activeSection, setActiveSection] = useState(null);
  const [tocOpen, setTocOpen] = useState(false);
  const sectionRefs = useRef({});

  // Filter sections by user access
  const visibleSections = GUIDE_SECTIONS.filter(section => {
    if (section.adminOnly) return isSuperuser;
    if (!section.appKey) return true;
    return hasAccess(section.appKey);
  });

  // Handle hash navigation on mount and hash changes
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.slice(1);
      if (hash && sectionRefs.current[hash]) {
        setActiveSection(hash);
        // Small delay to let the DOM render
        setTimeout(() => {
          sectionRefs.current[hash]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Track active section on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px' }
    );

    Object.values(sectionRefs.current).forEach(el => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [visibleSections]);

  const scrollToSection = (key) => {
    window.history.replaceState(null, '', `#${key}`);
    setActiveSection(key);
    setTocOpen(false);
    sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Layout title="Guide — Document Processing Suite">
      <div className="py-8">
        {/* Page Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            User Guide
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Learn how to use the Document Processing Suite applications
          </p>
        </div>

        <div className="flex gap-8">
          {/* Sidebar TOC — Desktop */}
          <nav className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-8">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Contents
              </h2>
              <ul className="space-y-1">
                {visibleSections.map(section => (
                  <li key={section.key}>
                    <button
                      onClick={() => scrollToSection(section.key)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                        activeSection === section.key
                          ? 'bg-gray-900 text-white font-medium'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <span className="mr-2">{section.icon}</span>
                      {section.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          {/* Mobile TOC toggle */}
          <div className="lg:hidden fixed bottom-6 right-6 z-40">
            <button
              onClick={() => setTocOpen(!tocOpen)}
              className="w-12 h-12 bg-gray-900 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-800 transition-colors"
              aria-label="Table of contents"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
          </div>

          {/* Mobile TOC panel */}
          {tocOpen && (
            <>
              <div className="lg:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setTocOpen(false)} />
              <div className="lg:hidden fixed bottom-20 right-6 z-50 w-64 bg-white rounded-xl shadow-xl border border-gray-200 p-4 max-h-[60vh] overflow-y-auto">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Contents
                </h2>
                <ul className="space-y-1">
                  {visibleSections.map(section => (
                    <li key={section.key}>
                      <button
                        onClick={() => scrollToSection(section.key)}
                        className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                          activeSection === section.key
                            ? 'bg-gray-900 text-white font-medium'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <span className="mr-2">{section.icon}</span>
                        {section.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Main Content */}
          <div className="flex-1 min-w-0 space-y-10">
            {visibleSections.map(section => (
              <div
                key={section.key}
                id={section.key}
                ref={el => sectionRefs.current[section.key] = el}
                className="scroll-mt-8"
              >
                <Card hover={false}>
                  {/* Section Header */}
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                    <span className="text-3xl">{section.icon}</span>
                    <h2 className="text-2xl font-bold text-gray-900">{section.title}</h2>
                    {section.appKey && (
                      <a
                        href={`/${section.appKey}`}
                        className="ml-auto text-sm text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        Open App →
                      </a>
                    )}
                  </div>

                  {/* Section Content */}
                  <div className="space-y-6">
                    {section.sections.map((sub, i) => (
                      <div key={i}>
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">
                          {sub.heading}
                        </h3>
                        {sub.content && (
                          <p className="text-gray-600 leading-relaxed">{sub.content}</p>
                        )}
                        {sub.items && (
                          <ul className="list-disc list-inside text-gray-600 space-y-1.5 ml-1">
                            {sub.items.map((item, j) => (
                              <li key={j} className="leading-relaxed">{item}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ))}

            {/* Help footer */}
            <div className="text-center py-8 text-gray-500 text-sm">
              Need more help? Email{' '}
              <a href="mailto:jgallivan@wmkeck.org" className="text-indigo-600 hover:text-indigo-800 underline">
                jgallivan@wmkeck.org
              </a>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
