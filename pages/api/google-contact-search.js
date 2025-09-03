import { nextRateLimiter } from '../../shared/api/middleware/rateLimiter';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// Create rate limiter for Google API (10 requests per second max)
const rateLimiter = nextRateLimiter({
  windowMs: 1000, // 1 second
  max: 10, // Google's limit
});

class ProfessorContactSearcher {
  constructor(apiKey, cseId) {
    this.apiKey = apiKey;
    this.cseId = cseId;
    this.baseUrl = 'https://www.googleapis.com/customsearch/v1';
    // Email pattern - matches most email formats
    this.emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  }

  async searchProfessorContact(professorName, institution) {
    const expectedDomain = this.getDomain(institution);
    
    // Multiple search strategies
    const queries = [
      `"${professorName}" ${institution} email`,
      `"${professorName}" ${institution} contact`,
      `"${professorName}" ${institution} faculty`,
      `${professorName} ${institution} @`,
      `site:${expectedDomain} "${professorName}"`
    ];

    const allResults = [];

    for (const query of queries) {
      try {
        const results = await this.makeSearchRequest(query);
        if (results) {
          allResults.push(...results);
        }
        // Rate limiting - be respectful
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (error) {
        console.error(`Error searching for ${professorName}:`, error);
        continue;
      }
    }

    // Process results
    const contactInfo = this.processSearchResults(allResults, professorName, expectedDomain);

    // Deep search if needed (fetch actual pages)
    if (contactInfo.emails.length < 2) {
      await this.deepSearchFromUrls(contactInfo, professorName, expectedDomain);
    }

    return contactInfo;
  }

  async makeSearchRequest(query) {
    const params = new URLSearchParams({
      key: this.apiKey,
      cx: this.cseId,
      q: query,
      num: '10' // Get up to 10 results per query
    });

    try {
      const response = await fetch(`${this.baseUrl}?${params}`);
      
      if (response.status === 200) {
        const data = await response.json();
        return data.items || [];
      } else if (response.status === 429) {
        console.log('Rate limit hit, waiting...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        return null;
      } else {
        console.error(`Search failed with status: ${response.status}`);
        return null;
      }
    } catch (error) {
      console.error('Search request error:', error);
      return null;
    }
  }

  processSearchResults(results, professorName, expectedDomain) {
    const emailCandidates = [];
    const websiteCandidates = [];
    const relevantUrls = [];

    console.log(`Processing ${results.length} search results...`);

    for (const item of results) {
      const title = item.title || '';
      const snippet = item.snippet || '';
      const url = item.link || '';

      // Extract emails from title and snippet
      const textToSearch = title + ' ' + snippet;
      const emailsFound = textToSearch.match(this.emailPattern) || [];

      for (const email of emailsFound) {
        if (email && email.includes('@')) {
          const score = this.scoreEmail(email, professorName, url, expectedDomain);
          if (score > 0) {
            emailCandidates.push({
              email,
              score,
              source_url: url,
              context: title + ' ' + snippet
            });
          }
        }
      }

      // Collect potentially relevant URLs for deeper search
      const keywords = ['faculty', 'directory', 'profile', 'cv', 'curriculum', 'contact', 'staff', 'people'];
      if (keywords.some(keyword => textToSearch.toLowerCase().includes(keyword))) {
        const priority = this.getUrlPriority(url, textToSearch, professorName);
        relevantUrls.push({
          url,
          title,
          snippet,
          priority
        });
      }

      // Check if URL looks like a faculty page
      if (this.isFacultyUrl(url, professorName)) {
        const score = this.scoreWebsite(url, professorName);
        if (score > 0) {
          websiteCandidates.push({
            url,
            score,
            title
          });
        }
      }
    }

    // Sort by priority/score
    relevantUrls.sort((a, b) => b.priority - a.priority);
    emailCandidates.sort((a, b) => b.score - a.score);
    websiteCandidates.sort((a, b) => b.score - a.score);

    // Remove duplicates
    const seenEmails = new Set();
    const uniqueEmails = [];
    for (const candidate of emailCandidates) {
      if (!seenEmails.has(candidate.email)) {
        seenEmails.add(candidate.email);
        uniqueEmails.push(candidate);
      }
    }

    const seenWebsites = new Set();
    const uniqueWebsites = [];
    for (const candidate of websiteCandidates) {
      if (!seenWebsites.has(candidate.url)) {
        seenWebsites.add(candidate.url);
        uniqueWebsites.push(candidate);
      }
    }

    return {
      emails: uniqueEmails,
      websites: uniqueWebsites,
      relevant_urls: relevantUrls
    };
  }

  async deepSearchFromUrls(contactInfo, professorName, expectedDomain) {
    console.log(`Deep searching from ${contactInfo.relevant_urls.length} URLs...`);

    // Try top 3 most promising URLs
    for (const urlInfo of contactInfo.relevant_urls.slice(0, 3)) {
      try {
        console.log(`Fetching: ${urlInfo.url}`);

        const response = await fetch(urlInfo.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          },
          timeout: 10000
        });

        if (!response.ok) continue;

        const content = await response.text();
        const pageEmails = content.match(this.emailPattern) || [];

        for (const email of pageEmails) {
          if (email && email.includes('@')) {
            const existingEmails = contactInfo.emails.map(e => e.email);
            if (!existingEmails.includes(email)) {
              const score = this.scoreEmail(email, professorName, urlInfo.url, expectedDomain);
              if (score > 0) {
                contactInfo.emails.push({
                  email,
                  score,
                  source_url: urlInfo.url,
                  context: 'Full page content'
                });
                console.log(`Added new email: ${email} (score: ${score})`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching ${urlInfo.url}:`, error);
        continue;
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Re-sort emails after adding new ones
    contactInfo.emails.sort((a, b) => b.score - a.score);
  }

  getUrlPriority(url, text, professorName) {
    let score = 0;
    const urlLower = url.toLowerCase();
    const textLower = text.toLowerCase();
    const nameParts = professorName.toLowerCase().split(' ');

    // Academic domains get higher priority
    if (urlLower.includes('.edu')) score += 50;
    else if (['.ac.uk', '.ac.in', '.ac.jp', '.dtu.dk'].some(tld => urlLower.includes(tld))) score += 40;

    // Faculty/profile pages
    if (['faculty', 'profile', 'people', 'staff'].some(keyword => urlLower.includes(keyword))) score += 30;

    // Name matching in URL
    if (nameParts.some(part => part.length > 2 && urlLower.includes(part))) score += 20;

    // Contact-related content
    if (['email', 'contact', '@'].some(keyword => textLower.includes(keyword))) score += 15;

    return score;
  }

  scoreEmail(email, professorName, sourceUrl, expectedDomain = null) {
    try {
      let score = 0;
      const emailLower = email.toLowerCase();

      if (!email.includes('@')) return 0;

      const domain = email.split('@')[1].toLowerCase();
      const nameParts = professorName.toLowerCase().split(' ').filter(part => part);

      // Institution domain matching (highest priority)
      if (expectedDomain && domain === expectedDomain.toLowerCase()) {
        score += 150; // Big bonus for correct institution domain
      } else if (expectedDomain && domain.endsWith('.edu') && expectedDomain.endsWith('.edu')) {
        // Penalty for wrong .edu domain
        score -= 75;
      }

      // Domain scoring
      if (domain.endsWith('.edu')) score += 100;
      else if (['.ac.uk', '.ac.in', '.ac.jp', '.ac.kr', '.edu.au', '.dtu.dk'].some(tld => domain.includes(tld))) score += 90;
      else if (['university', 'college', 'institute', 'univ', 'gatech', 'mit', 'harvard'].some(keyword => domain.includes(keyword))) score += 70;
      else if (domain.endsWith('.org') || domain.endsWith('.gov')) score += 50;
      else if (domain.endsWith('.com') || domain.endsWith('.net')) score += 20;

      // Name matching
      const emailName = email.split('@')[0].toLowerCase();
      for (const namePart of nameParts) {
        if (namePart.length > 2 && emailName.includes(namePart)) {
          score += 30;
        }
        // First letter + last name pattern
        if (nameParts.length >= 2 && emailName.startsWith(namePart[0])) {
          score += 15;
        }
      }

      // Academic email patterns
      if (['prof', 'dr', 'faculty'].some(pattern => emailName.includes(pattern))) score += 10;

      // Source URL context
      if (sourceUrl) {
        const urlLower = sourceUrl.toLowerCase();
        if (['faculty', 'staff', 'directory', 'people'].some(keyword => urlLower.includes(keyword))) score += 15;
        if (nameParts.some(part => part.length > 2 && urlLower.includes(part))) score += 20;
      }

      // Apply minimum score threshold
      const minScore = 50; // Reject obviously wrong emails
      return score >= minScore ? score : 0;
    } catch (error) {
      console.error(`Error scoring email ${email}:`, error);
      return 0;
    }
  }

  scoreWebsite(url, professorName) {
    try {
      let score = 0;
      const urlLower = url.toLowerCase();
      const nameParts = professorName.toLowerCase().split(' ').filter(part => part);

      // Domain scoring
      if (urlLower.includes('.edu')) score += 50;
      else if (['.ac.uk', '.ac.in', '.ac.jp', '.ac.kr', '.edu.au', '.dtu.dk'].some(tld => urlLower.includes(tld))) score += 45;
      else if (['university', 'college', 'institute'].some(keyword => urlLower.includes(keyword))) score += 35;

      // URL path scoring
      if (['faculty', 'staff', 'people', 'directory'].some(keyword => urlLower.includes(keyword))) score += 20;
      if (['profile', 'bio', 'cv', 'resume'].some(keyword => urlLower.includes(keyword))) score += 15;

      // Name matching
      for (const namePart of nameParts) {
        if (namePart.length > 2 && urlLower.includes(namePart)) score += 25;
      }

      return Math.max(0, score);
    } catch (error) {
      console.error(`Error scoring website ${url}:`, error);
      return 0;
    }
  }

  getDomain(institution) {
    const clean = institution.toLowerCase().trim();

    // Common university domain mappings
    const domainMap = {
      'mit': 'mit.edu',
      'harvard': 'harvard.edu',
      'harvard university': 'harvard.edu',
      'stanford': 'stanford.edu',
      'stanford university': 'stanford.edu',
      'technical university of denmark': 'dtu.dk',
      'georgia institute of technology': 'gatech.edu',
      'georgia tech': 'gatech.edu',
      'uc santa barbara': 'ucsb.edu',
      'university of california santa barbara': 'ucsb.edu',
      'university of california, santa barbara': 'ucsb.edu',
      'rice university': 'rice.edu',
      'university of wisconsin-madison': 'wisc.edu',
      'university of wisconsin madison': 'wisc.edu',
      'uc riverside': 'ucr.edu',
      'university of california riverside': 'ucr.edu',
      'university of california, riverside': 'ucr.edu',
      'university of michigan': 'umich.edu',
      'university of minnesota': 'umn.edu',
      'new york university': 'nyu.edu',
      'nyu': 'nyu.edu',
      'caltech': 'caltech.edu',
      'california institute of technology': 'caltech.edu',
      // Additional major universities
      'northwestern university': 'northwestern.edu',
      'northwestern': 'northwestern.edu',
      'brandeis university': 'brandeis.edu',
      'brandeis': 'brandeis.edu',
      'university of pennsylvania': 'upenn.edu',
      'upenn': 'upenn.edu',
      'penn': 'upenn.edu',
      'uc san diego': 'ucsd.edu',
      'university of california san diego': 'ucsd.edu',
      'university of california, san diego': 'ucsd.edu',
      'ucsd': 'ucsd.edu',
      'uc berkeley': 'berkeley.edu',
      'university of california berkeley': 'berkeley.edu',
      'university of california, berkeley': 'berkeley.edu',
      'berkeley': 'berkeley.edu',
      'uc davis': 'ucdavis.edu',
      'university of california davis': 'ucdavis.edu',
      'university of california, davis': 'ucdavis.edu',
      'uc los angeles': 'ucla.edu',
      'university of california los angeles': 'ucla.edu',
      'university of california, los angeles': 'ucla.edu',
      'ucla': 'ucla.edu',
      'university of chicago': 'uchicago.edu',
      'yale university': 'yale.edu',
      'yale': 'yale.edu',
      'princeton university': 'princeton.edu',
      'princeton': 'princeton.edu',
      'columbia university': 'columbia.edu',
      'columbia': 'columbia.edu',
      'cornell university': 'cornell.edu',
      'cornell': 'cornell.edu',
      'brown university': 'brown.edu',
      'brown': 'brown.edu',
      'dartmouth college': 'dartmouth.edu',
      'dartmouth': 'dartmouth.edu',
      'duke university': 'duke.edu',
      'duke': 'duke.edu',
      'johns hopkins university': 'jhu.edu',
      'johns hopkins': 'jhu.edu',
      'carnegie mellon university': 'cmu.edu',
      'carnegie mellon': 'cmu.edu',
      'cmu': 'cmu.edu',
      'washington university in st. louis': 'wustl.edu',
      'washington university': 'wustl.edu',
      'wustl': 'wustl.edu',
      'university of washington': 'uw.edu',
      'uw': 'uw.edu',
      'vanderbilt university': 'vanderbilt.edu',
      'vanderbilt': 'vanderbilt.edu',
      'emory university': 'emory.edu',
      'emory': 'emory.edu',
      'north carolina state university': 'ncsu.edu',
      'nc state': 'ncsu.edu',
      'ncsu': 'ncsu.edu',
      'university of north carolina': 'unc.edu',
      'unc': 'unc.edu',
      'ohio state university': 'osu.edu',
      'osu': 'osu.edu',
      'university of illinois': 'illinois.edu',
      'uiuc': 'illinois.edu',
      'university of texas at austin': 'utexas.edu',
      'ut austin': 'utexas.edu',
      'university of southern california': 'usc.edu',
      'usc': 'usc.edu',
      'university of florida': 'ufl.edu',
      'university of wisconsin': 'wisc.edu',
      'wisc': 'wisc.edu',
      'purdue university': 'purdue.edu',
      'purdue': 'purdue.edu',
      'penn state university': 'psu.edu',
      'penn state': 'psu.edu',
      'psu': 'psu.edu',
      'michigan state university': 'msu.edu',
      'msu': 'msu.edu',
      'university of virginia': 'virginia.edu',
      'uva': 'virginia.edu',
      'virginia tech': 'vt.edu',
      'vt': 'vt.edu',
      'icahn school of medicine at mount sinai': 'mssm.edu',
      'mount sinai': 'mssm.edu',
      'university of oregon': 'uoregon.edu'
    };

    // Check for exact matches
    for (const [key, domain] of Object.entries(domainMap)) {
      if (clean.includes(key)) {
        return domain;
      }
    }

    // Generic approach
    const words = clean.replace(/[,]/g, '').split(' ');
    const filtered = words.filter(w => !['university', 'of', 'the', 'institute', 'technology', 'department'].includes(w));

    if (filtered.length > 0) {
      return filtered[0] + '.edu';
    }

    return 'university.edu';
  }

  isFacultyUrl(url, professorName) {
    const urlLower = url.toLowerCase();
    const nameParts = professorName.toLowerCase().split(' ');

    const academicIndicators = ['edu', 'ac.', 'faculty', 'profile', 'people', 'university', 'college'];
    
    return (
      academicIndicators.some(indicator => urlLower.includes(indicator)) &&
      nameParts.some(part => part.length > 2 && urlLower.includes(part))
    );
  }
}

export default async function handler(req, res) {
  console.log('Google Contact Search API called:', new Date().toISOString());

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting
  const rateLimitResult = await rateLimiter(req, res);
  if (!rateLimitResult) {
    console.log('Rate limit exceeded');
    return; // Response already sent by rate limiter
  }

  try {
    const { reviewers, apiKey, cseId } = req.body;

    if (!apiKey || !cseId) {
      return res.status(400).json({ error: 'API key and CSE ID are required' });
    }

    if (!reviewers || !Array.isArray(reviewers) || reviewers.length === 0) {
      return res.status(400).json({ error: 'No reviewers provided' });
    }

    console.log(`Processing ${reviewers.length} reviewers for contact search...`);

    const searcher = new ProfessorContactSearcher(apiKey, cseId);
    const results = [];

    // Process each reviewer
    for (let i = 0; i < reviewers.length; i++) {
      const reviewer = reviewers[i];
      const { name, institution } = reviewer;

      if (!name || !institution) {
        console.log(`Skipping incomplete reviewer: ${JSON.stringify(reviewer)}`);
        continue;
      }

      console.log(`Searching for ${name} at ${institution} (${i + 1}/${reviewers.length})`);

      try {
        const contactInfo = await searcher.searchProfessorContact(name, institution);

        const result = {
          name,
          institution,
          primary_email: contactInfo.emails[0]?.email || '',
          primary_email_score: contactInfo.emails[0]?.score || 0,
          all_emails: contactInfo.emails.slice(0, 5).map(e => `${e.email} (score: ${e.score})`).join(' | '),
          primary_website: contactInfo.websites[0]?.url || '',
          all_websites: contactInfo.websites.slice(0, 3).map(w => w.url).join(' | '),
          relevant_urls_count: contactInfo.relevant_urls.length,
          search_successful: contactInfo.emails.length > 0 || contactInfo.websites.length > 0
        };

        results.push(result);

        console.log(`✅ Found: ${contactInfo.emails.length} emails, ${contactInfo.websites.length} websites`);
        if (contactInfo.emails.length > 0) {
          console.log(`Primary email: ${contactInfo.emails[0].email} (score: ${contactInfo.emails[0].score})`);
        }

        // Send progress update (optional - for real-time updates)
        // You could implement SSE or WebSocket here for progress

      } catch (error) {
        console.error(`❌ Error processing ${name}:`, error);
        results.push({
          name,
          institution,
          primary_email: '',
          primary_email_score: 0,
          all_emails: '',
          primary_website: '',
          all_websites: '',
          relevant_urls_count: 0,
          search_successful: false,
          error: error.message
        });
      }

      // Be respectful with API calls
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Calculate summary statistics
    const successfulSearches = results.filter(r => r.search_successful).length;
    const totalEmailsFound = results.reduce((sum, r) => sum + (r.all_emails ? r.all_emails.split(' | ').length : 0), 0);
    const highConfidenceEmails = results.filter(r => r.primary_email_score >= 100).length;

    const summary = {
      professors_processed: results.length,
      successful_searches: successfulSearches,
      total_emails_found: totalEmailsFound,
      high_confidence_emails: highConfidenceEmails,
      success_rate: results.length > 0 ? (successfulSearches / results.length * 100).toFixed(1) + '%' : '0%'
    };

    console.log('Search Summary:', summary);

    return res.status(200).json({
      success: true,
      results,
      summary,
      csvData: generateCSV(results),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in google-contact-search API:', error);
    return res.status(500).json({
      error: 'Failed to search for contacts',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

function generateCSV(results) {
  const headers = ['name', 'institution', 'primary_email', 'primary_email_score', 'all_emails', 'primary_website', 'search_successful'];
  const rows = results.map(r => [
    r.name,
    r.institution,
    r.primary_email,
    r.primary_email_score,
    r.all_emails,
    r.primary_website,
    r.search_successful
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(field => {
      // Escape fields with commas or quotes
      const str = String(field);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(','))
  ].join('\n');

  return csvContent;
}