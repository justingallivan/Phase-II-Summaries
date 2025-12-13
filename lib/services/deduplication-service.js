/**
 * DeduplicationService - Handle researcher name matching and deduplication
 *
 * Features:
 * - Name similarity matching (John Smith vs J. Smith)
 * - Merge duplicate researcher records
 * - Conflict of interest filtering
 * - Relevance ranking
 */

const stringSimilarity = require('string-similarity');
const { DatabaseService } = require('./database-service');

class DeduplicationService {

  // ============================================
  // MAIN DEDUPLICATION FUNCTION
  // ============================================

  /**
   * Deduplicate candidates and store unique researchers
   */
  static async deduplicateAndStore(candidates) {
    const deduplicated = [];
    const nameGroups = this.groupByNameSimilarity(candidates);

    for (const group of nameGroups) {
      const merged = await this.mergeGroup(group);
      if (merged) {
        deduplicated.push(merged);
      }
    }

    return deduplicated;
  }

  // ============================================
  // NAME SIMILARITY GROUPING
  // ============================================

  /**
   * Group candidates by name similarity
   */
  static groupByNameSimilarity(candidates) {
    const groups = [];
    const processed = new Set();

    for (let i = 0; i < candidates.length; i++) {
      if (processed.has(i)) continue;

      const group = [candidates[i]];
      processed.add(i);

      // Find similar names
      for (let j = i + 1; j < candidates.length; j++) {
        if (processed.has(j)) continue;

        if (this.areNamesSimilar(candidates[i].name, candidates[j].name)) {
          group.push(candidates[j]);
          processed.add(j);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Check if two names are similar enough to be the same person
   */
  static areNamesSimilar(name1, name2) {
    if (!name1 || !name2) return false;

    const normalized1 = this.normalizeName(name1);
    const normalized2 = this.normalizeName(name2);

    // Exact match after normalization
    if (normalized1 === normalized2) return true;

    // String similarity threshold
    const similarity = stringSimilarity.compareTwoStrings(normalized1, normalized2);
    if (similarity > 0.85) return true;

    // Check if one is initials of the other
    if (this.isInitialsMatch(name1, name2)) return true;

    // Check last name match with partial first name
    if (this.isPartialMatch(name1, name2)) return true;

    return false;
  }

  /**
   * Normalize a name for comparison
   */
  static normalizeName(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if names match with initials (J. Smith vs John Smith)
   */
  static isInitialsMatch(name1, name2) {
    const parts1 = name1.trim().split(/\s+/);
    const parts2 = name2.trim().split(/\s+/);

    // Need at least 2 parts (first + last)
    if (parts1.length < 2 || parts2.length < 2) return false;

    // Check if last names match
    const lastName1 = parts1[parts1.length - 1].toLowerCase();
    const lastName2 = parts2[parts2.length - 1].toLowerCase();

    if (lastName1 !== lastName2) return false;

    // Check first name/initials
    const first1 = parts1[0].toLowerCase().replace(/\./g, '');
    const first2 = parts2[0].toLowerCase().replace(/\./g, '');

    // One is initial of the other
    if (first1.length === 1 && first2.startsWith(first1)) return true;
    if (first2.length === 1 && first1.startsWith(first2)) return true;

    return false;
  }

  /**
   * Check for partial first name match with same last name
   */
  static isPartialMatch(name1, name2) {
    const parts1 = name1.trim().split(/\s+/);
    const parts2 = name2.trim().split(/\s+/);

    if (parts1.length < 2 || parts2.length < 2) return false;

    const lastName1 = parts1[parts1.length - 1].toLowerCase();
    const lastName2 = parts2[parts2.length - 1].toLowerCase();

    if (lastName1 !== lastName2) return false;

    const first1 = parts1[0].toLowerCase();
    const first2 = parts2[0].toLowerCase();

    // One first name starts with or contains the other
    if (first1.includes(first2) || first2.includes(first1)) return true;

    return false;
  }

  // ============================================
  // MERGE GROUP INTO SINGLE RESEARCHER
  // ============================================

  /**
   * Merge a group of similar candidates into one researcher
   */
  static async mergeGroup(group) {
    if (!group || group.length === 0) return null;

    // Use the most complete name (longest)
    const bestName = group.reduce((longest, current) =>
      (current.name?.length || 0) > (longest.name?.length || 0) ? current : longest
    ).name;

    if (!bestName) return null;

    // Check if researcher already exists in database
    const existing = await DatabaseService.findResearcher(bestName);

    // Collect all publications from the group
    const allPublications = group.flatMap(c => c.publications || []);

    // Merge all data from the group
    const merged = {
      id: existing?.id,
      name: bestName,
      normalizedName: DatabaseService.normalizeName(bestName),
      primaryAffiliation: this.selectBest(group.map(c => c.affiliation)),
      email: this.selectBest(group.map(c => c.email)),
      website: this.selectBest(group.map(c => c.website)),
      hIndex: Math.max(...group.map(c => c.hIndex || 0)),
      totalCitations: Math.max(...group.map(c => c.citations || 0)),
      sources: [...new Set(group.map(c => c.source).filter(Boolean))],
      // Include publications from all candidates in the group
      publications: allPublications,
      // Preserve Claude's reason for suggesting this reviewer
      claudeReason: this.selectBest(group.map(c => c.claudeReason)),
      // Flag if this was a Claude-suggested reviewer
      claudeSuggested: group.some(c => c.source === 'claude'),
    };

    // Save or update in database
    try {
      const researcherId = await DatabaseService.createOrUpdateResearcher(merged);
      merged.id = researcherId;

      // Store publications from all sources
      for (const candidate of group) {
        if (candidate.publications && researcherId) {
          for (const pub of candidate.publications) {
            await DatabaseService.addPublication({
              researcherId,
              title: pub.title,
              authors: pub.authors || [],
              publicationDate: pub.publicationDate,
              year: pub.year,
              journal: pub.journal,
              doi: pub.doi,
              pmid: pub.pmid,
              arxivId: pub.arxivId,
              citations: pub.citations || 0,
              abstract: pub.abstract,
              source: candidate.source,
            });
          }
        }

        // Store keywords
        if (candidate.keywords && researcherId) {
          await DatabaseService.addKeywords(researcherId, candidate.keywords, candidate.source);
        }
      }
    } catch (error) {
      console.error('Error saving researcher:', error.message);
    }

    return merged;
  }

  /**
   * Select the best (longest non-empty) value from a list
   */
  static selectBest(values) {
    return values
      .filter(v => v && v.trim?.().length > 0)
      .reduce((best, current) =>
        !best || (current && current.length > best.length) ? current : best
      , undefined);
  }

  // ============================================
  // CONFLICT OF INTEREST FILTERING
  // ============================================

  /**
   * Filter out researchers with conflicts of interest
   */
  static filterConflicts(researchers, authorInstitution, excludeNames = []) {
    if (!authorInstitution) return researchers;

    const normalizedInstitution = this.normalizeInstitution(authorInstitution);

    return researchers.filter(researcher => {
      // Exclude if at same institution
      // Check both 'affiliation' and 'primaryAffiliation' fields
      const researcherAffiliation = researcher.affiliation || researcher.primaryAffiliation;
      if (researcherAffiliation) {
        const researcherInst = this.normalizeInstitution(researcherAffiliation);
        if (this.institutionsMatch(normalizedInstitution, researcherInst)) {
          return false;
        }
      }

      // Exclude if name is in exclude list
      const researcherName = this.normalizeName(researcher.name);
      if (excludeNames.some(name => this.normalizeName(name) === researcherName)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Normalize institution name for comparison
   * Preserves key identifying words while removing noise
   */
  static normalizeInstitution(institution) {
    if (!institution) return '';

    let normalized = institution.toLowerCase();

    // Remove department/school prefixes but keep the institution
    normalized = normalized.replace(/^(department|dept|school|division|center|centre)\s+(of|for)\s+[^,]+,?\s*/i, '');

    // Remove common suffixes
    normalized = normalized.replace(/,?\s*(usa|united states|u\.?s\.?a?\.?)$/i, '');

    // Remove special characters but keep spaces
    normalized = normalized.replace(/[^a-z\s]/g, '');

    // Clean up whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
  }

  /**
   * Check if two institutions are the same
   */
  static institutionsMatch(inst1, inst2) {
    if (!inst1 || !inst2) return false;

    // Direct match
    if (inst1 === inst2) return true;

    // One string contains the other entirely (for cases like "University of Michigan, Ann Arbor")
    if (inst1.includes(inst2) || inst2.includes(inst1)) return true;

    // Extract key identifying words (excluding common words)
    const stopWords = ['of', 'the', 'and', 'at', 'in', 'for'];
    // Keep short words that are significant identifiers (like "am" from "A&M")
    const significantShortWords = ['am'];
    const getKeyWords = (str) => str.split(/\s+/).filter(w =>
      (w.length > 2 || significantShortWords.includes(w)) && !stopWords.includes(w)
    );

    const words1 = getKeyWords(inst1);
    const words2 = getKeyWords(inst2);

    // For "University of Michigan" vs "Michigan State University":
    // words1 = ['university', 'michigan']
    // words2 = ['michigan', 'state', 'university']
    // These share words but are different institutions

    // Require EXACT same key words (order doesn't matter) for a match
    // This is strict but avoids false positives
    if (words1.length === words2.length) {
      const sorted1 = [...words1].sort().join(' ');
      const sorted2 = [...words2].sort().join(' ');
      if (sorted1 === sorted2) return true;
    }

    // Also allow subset matching ONLY if the shorter is a proper subset
    // and the longer doesn't have conflicting words like "state"
    const conflictingWords = ['state', 'tech', 'polytechnic', 'community', 'medical', 'health', 'am'];
    const shorter = words1.length <= words2.length ? words1 : words2;
    const longer = words1.length <= words2.length ? words2 : words1;

    // Check if longer has any conflicting words that aren't in shorter
    const longerHasConflict = longer.some(w => conflictingWords.includes(w) && !shorter.includes(w));
    if (longerHasConflict) return false;

    // Check if all shorter words appear in longer
    const allInLonger = shorter.every(w => longer.includes(w));
    if (allInLonger && shorter.length >= 2) return true;

    // String similarity as final fallback (high threshold)
    const similarity = stringSimilarity.compareTwoStrings(inst1, inst2);
    return similarity > 0.9;
  }

  // ============================================
  // RANKING BY RELEVANCE
  // ============================================

  /**
   * Rank researchers by relevance to proposal
   */
  static rankByRelevance(researchers, proposalKeywords = []) {
    // Score each researcher
    const scored = researchers.map(researcher => {
      let score = 0;

      // Claude-suggested bonus (25 points) - explicitly identified from references
      // This is a strong signal because Claude analyzed the proposal and identified
      // these researchers as relevant based on cited work
      if (researcher.claudeSuggested) {
        score += 25;
      }

      // Publication count (0-20 points) - rewards active researchers
      const pubCount = researcher.publications?.length || 0;
      score += Math.min(pubCount * 5, 20);

      // h-index contribution (0-20 points) - if available from Google Scholar
      score += Math.min(researcher.hIndex || 0, 20);

      // Citation contribution (0-15 points, log scale)
      const citations = researcher.totalCitations || 0;
      score += citations > 0 ? Math.min(Math.log10(citations) * 5, 15) : 0;

      // Has affiliation bonus (10 points) - indicates identified researcher
      if (researcher.primaryAffiliation) {
        score += 10;
      }

      // Multiple sources bonus (0-10 points) - corroborates identity
      const sourceCount = researcher.sources?.length || 1;
      score += Math.min(sourceCount * 5, 10);

      // Keyword match bonus (0-10 points)
      if (proposalKeywords.length > 0 && researcher.keywords) {
        const matchingKeywords = proposalKeywords.filter(kw =>
          researcher.keywords.some(rk =>
            rk.toLowerCase().includes(kw.toLowerCase()) ||
            kw.toLowerCase().includes(rk.toLowerCase())
          )
        );
        score += Math.min(matchingKeywords.length * 3, 10);
      }

      return { ...researcher, relevanceScore: score };
    });

    // Sort by score descending
    return scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Filter by minimum h-index (to ensure qualified reviewers)
   */
  static filterByMinimumQualifications(researchers, minHIndex = 5) {
    return researchers.filter(r => (r.hIndex || 0) >= minHIndex);
  }
}

module.exports = { DeduplicationService };
