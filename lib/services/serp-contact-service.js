/**
 * SerpContactService - Google Search for Contact Information
 *
 * Uses SerpAPI's Google Search (not Google Scholar) to find:
 * - Email addresses from faculty pages and search snippets
 * - Faculty page URLs
 * - Personal website URLs
 *
 * This is Tier 4 in the contact enrichment system.
 */

const { ContactParser } = require('../utils/contact-parser');

class SerpContactService {
  static apiKey = process.env.SERP_API_KEY;
  static baseUrl = 'https://serpapi.com/search.json';

  /**
   * Find contact information for a candidate using Google Search
   *
   * @param {Object} candidate - Candidate with name and affiliation
   * @param {string} apiKey - SerpAPI key (optional, uses env var if not provided)
   * @returns {Promise<Object|null>} { email, facultyPageUrl, website } or null
   */
  static async findContact(candidate, apiKey = null) {
    const key = apiKey || this.apiKey;
    if (!key) {
      console.log('SerpContactService: No SERP_API_KEY configured, skipping Google Search');
      return null;
    }

    // Extract just institution name for cleaner search
    const institution = candidate.affiliation
      ? candidate.affiliation.split(',')[0].trim()
      : '';

    // Primary query: "FirstName LastName" institution email
    const query = institution
      ? `"${candidate.name}" ${institution} email`
      : `"${candidate.name}" email`;

    console.log('Google Search query:', query);

    try {
      const params = new URLSearchParams({
        engine: 'google',
        q: query,
        num: '10', // Get 10 results
        api_key: key,
      });

      const url = `${this.baseUrl}?${params}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('SerpAPI error:', response.status, response.statusText);
        console.error('SerpAPI error details:', errorText.substring(0, 500));
        return null;
      }

      const data = await response.json();
      const organicResults = data.organic_results || [];

      // Extract contact information from results
      const result = {
        email: null,
        facultyPageUrl: null,
        website: null,
      };

      // First pass: look for emails in snippets and links
      for (const item of organicResults) {
        // Extract email from snippet
        if (!result.email && item.snippet) {
          const email = this.extractEmailFromText(item.snippet);
          if (email) {
            result.email = email;
          }
        }

        // Check if this is a useful faculty page URL
        if (!result.facultyPageUrl && item.link) {
          if (this.isFacultyPageUrl(item.link, candidate.name)) {
            result.facultyPageUrl = item.link;
          } else if (!result.website && ContactParser.isUsefulWebsiteUrl(item.link)) {
            // If not a faculty page but is a useful URL, save as website
            result.website = item.link;
          }
        }
      }

      // If no results found, try a fallback query without "email"
      if (!result.email && !result.facultyPageUrl && !result.website) {
        const fallbackQuery = institution
          ? `"${candidate.name}" ${institution} faculty`
          : `"${candidate.name}" faculty page`;

        console.log('Google Search fallback query:', fallbackQuery);

        const fallbackParams = new URLSearchParams({
          engine: 'google',
          q: fallbackQuery,
          num: '10',
          api_key: key,
        });

        const fallbackResponse = await fetch(`${this.baseUrl}?${fallbackParams}`);
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          const fallbackResults = fallbackData.organic_results || [];

          for (const item of fallbackResults) {
            // Check for faculty page URLs
            if (!result.facultyPageUrl && item.link) {
              if (this.isFacultyPageUrl(item.link, candidate.name)) {
                result.facultyPageUrl = item.link;
                break;
              }
            }
          }
        }
      }

      // Return null if we found nothing
      if (!result.email && !result.facultyPageUrl && !result.website) {
        return null;
      }

      console.log('Google Search results:', {
        email: result.email ? 'found' : 'not found',
        facultyPageUrl: result.facultyPageUrl ? 'found' : 'not found',
        website: result.website ? 'found' : 'not found',
      });

      return result;

    } catch (error) {
      console.error('Google Search error:', error.message);
      return null;
    }
  }

  /**
   * Extract email address from text using regex
   * Filters out generic emails like info@, contact@, support@
   */
  static extractEmailFromText(text) {
    if (!text) return null;

    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
    const matches = text.match(emailPattern);

    if (!matches || matches.length === 0) {
      return null;
    }

    // Filter out generic emails
    const validEmails = matches.filter(email => {
      const lowerEmail = email.toLowerCase();
      return !lowerEmail.includes('example') &&
             !lowerEmail.startsWith('info@') &&
             !lowerEmail.startsWith('contact@') &&
             !lowerEmail.startsWith('support@') &&
             !lowerEmail.startsWith('help@') &&
             !lowerEmail.startsWith('webmaster@') &&
             !lowerEmail.startsWith('admin@') &&
             !lowerEmail.startsWith('no-reply@') &&
             !lowerEmail.startsWith('noreply@');
    });

    return validEmails.length > 0 ? validEmails[0] : null;
  }

  /**
   * Check if a URL looks like a faculty page
   * Faculty pages typically include the person's name or have /faculty/, /people/, /profile/ patterns
   */
  static isFacultyPageUrl(url, candidateName) {
    if (!url) return false;

    const lowerUrl = url.toLowerCase();
    const lowerName = candidateName.toLowerCase();

    // Extract last name (assume Western name order: First Last)
    const nameParts = lowerName.split(' ').filter(p => p.length > 0);
    const lastName = nameParts.length > 0 ? nameParts[nameParts.length - 1] : '';

    // Check if URL contains the last name
    const hasName = lastName.length > 2 && lowerUrl.includes(lastName);

    // Check for faculty page patterns
    const facultyPatterns = [
      '/faculty/',
      '/people/',
      '/profile/',
      '/staff/',
      '/directory/',
      '/bio/',
      '/~',
    ];

    const hasFacultyPattern = facultyPatterns.some(pattern => lowerUrl.includes(pattern));

    // A good faculty page has both the name and a faculty pattern
    // Or has the name and is from an educational domain
    const isEduDomain = lowerUrl.includes('.edu') || lowerUrl.includes('.ac.');

    return (hasName && hasFacultyPattern) || (hasName && isEduDomain && !this.isGenericDirectoryUrl(url));
  }

  /**
   * Check if URL is a generic directory page (not useful)
   */
  static isGenericDirectoryUrl(url) {
    if (!url) return false;

    const lowerUrl = url.toLowerCase();

    const genericPatterns = [
      /[?&]p=people/,
      /\/people\/?$/,
      /\/directory\/?$/,
      /\/faculty\/?$/,
      /\/staff\/?$/,
      /\/members\/?$/,
      /\/team\/?$/,
    ];

    return genericPatterns.some(pattern => pattern.test(lowerUrl));
  }

  /**
   * Check if SerpAPI is configured
   */
  static isConfigured() {
    return !!this.apiKey;
  }
}

module.exports = { SerpContactService };
