/**
 * IntegrityMatchingService - Name matching for integrity screening
 *
 * Provides multi-tier name matching with confidence scoring.
 * Builds on patterns from DeduplicationService but optimized for
 * finding potential matches in the Retraction Watch database.
 */

const stringSimilarity = require('string-similarity');

// Common names that require extra scrutiny (high false positive risk)
const COMMON_NAMES = new Set([
  // Common Western names
  'john smith', 'james johnson', 'robert williams', 'michael brown', 'david jones',
  'william davis', 'richard miller', 'joseph wilson', 'thomas moore', 'charles taylor',
  'mary johnson', 'patricia williams', 'jennifer brown', 'elizabeth jones', 'linda davis',
  // Common Chinese names (romanized)
  'wei wang', 'jing zhang', 'li wang', 'wei zhang', 'lei wang', 'jian liu',
  'wei liu', 'yang li', 'fang chen', 'min li', 'xin wang', 'yu wang',
  'bin wang', 'hai zhang', 'lei zhang', 'yong wang', 'lin chen', 'jun liu',
  // Common Korean names
  'kim lee', 'lee kim', 'park kim', 'jin park',
  // Common Indian names
  'amit kumar', 'raj kumar', 'sanjay sharma', 'priya sharma',
  // Common Japanese names
  'takashi yamamoto', 'yuki tanaka', 'hiroshi suzuki',
]);

class IntegrityMatchingService {

  // ============================================
  // NAME NORMALIZATION
  // ============================================

  /**
   * Normalize a name for comparison
   * Handles various formats and removes noise
   */
  static normalizeName(name) {
    if (!name) return '';

    return name
      .toLowerCase()
      // Remove accents
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Handle "Last, First" format - convert to "First Last"
      .replace(/^([^,]+),\s*(.+)$/, '$2 $1')
      // Remove honorifics
      .replace(/\b(dr|prof|professor|mr|mrs|ms|sir|phd|md)\b\.?/gi, '')
      // Remove special characters except spaces
      .replace(/[^a-z\s]/g, '')
      // Clean whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract name parts (first, middle, last)
   */
  static extractNameParts(name) {
    const normalized = this.normalizeName(name);
    const parts = normalized.split(/\s+/).filter(p => p.length > 0);

    if (parts.length === 0) {
      return { first: '', middle: '', last: '', full: '' };
    }

    if (parts.length === 1) {
      return { first: '', middle: '', last: parts[0], full: normalized };
    }

    if (parts.length === 2) {
      return { first: parts[0], middle: '', last: parts[1], full: normalized };
    }

    return {
      first: parts[0],
      middle: parts.slice(1, -1).join(' '),
      last: parts[parts.length - 1],
      full: normalized,
    };
  }

  // ============================================
  // COMMON NAME DETECTION
  // ============================================

  /**
   * Check if a name is common (high false positive risk)
   */
  static isCommonName(name) {
    const normalized = this.normalizeName(name);
    const parts = this.extractNameParts(name);

    // Check full name
    if (COMMON_NAMES.has(normalized)) {
      return true;
    }

    // Check first + last only (without middle name)
    if (parts.first && parts.last) {
      const firstLast = `${parts.first} ${parts.last}`;
      if (COMMON_NAMES.has(firstLast)) {
        return true;
      }
    }

    return false;
  }

  // ============================================
  // MULTI-TIER NAME MATCHING
  // ============================================

  /**
   * Calculate match confidence between two names
   * Returns { matches: boolean, confidence: number, matchType: string }
   */
  static calculateNameMatch(searchName, candidateName) {
    const search = this.extractNameParts(searchName);
    const candidate = this.extractNameParts(candidateName);

    // Tier 1: Exact match after normalization (100%)
    if (search.full === candidate.full) {
      return { matches: true, confidence: 100, matchType: 'exact' };
    }

    // Tier 2: Last name + first name exact match (95%)
    if (search.last === candidate.last && search.first === candidate.first) {
      return { matches: true, confidence: 95, matchType: 'first_last_exact' };
    }

    // Tier 3: Last name exact + first initial match (85%)
    if (search.last === candidate.last && search.first && candidate.first) {
      const searchFirstInitial = search.first[0];
      const candidateFirstInitial = candidate.first[0];

      if (searchFirstInitial === candidateFirstInitial) {
        // Check if one is full name and other is initial
        if (search.first.length === 1 || candidate.first.length === 1) {
          return { matches: true, confidence: 85, matchType: 'last_first_initial' };
        }
        // Both have full first names but different - could be different person
        // with same initial (e.g., John vs James)
      }
    }

    // Tier 4: High string similarity (>0.9) with same last name (80%)
    if (search.last === candidate.last) {
      const similarity = stringSimilarity.compareTwoStrings(search.full, candidate.full);
      if (similarity > 0.9) {
        return { matches: true, confidence: 80, matchType: 'high_similarity' };
      }
    }

    // Tier 5: String similarity check on full names (75% threshold for match)
    const fullSimilarity = stringSimilarity.compareTwoStrings(search.full, candidate.full);
    if (fullSimilarity > 0.9) {
      return { matches: true, confidence: 75, matchType: 'full_similarity' };
    }

    // Tier 6: Partial match - last name + partial first (60%)
    if (search.last === candidate.last && search.first && candidate.first) {
      if (search.first.startsWith(candidate.first) || candidate.first.startsWith(search.first)) {
        return { matches: true, confidence: 60, matchType: 'partial_first' };
      }
    }

    // Tier 7: Last name only match with very similar length names (50%)
    if (search.last === candidate.last) {
      // Only if names are similar length (to avoid "John Smith" matching "Jonathan Smith-Jones")
      if (Math.abs(search.full.length - candidate.full.length) <= 3) {
        return { matches: true, confidence: 50, matchType: 'last_name_only' };
      }
    }

    return { matches: false, confidence: 0, matchType: 'no_match' };
  }

  /**
   * Adjust confidence based on institution match
   * Adds confidence if institutions match
   */
  static adjustConfidenceForInstitution(baseConfidence, searchInstitution, candidateInstitution) {
    if (!searchInstitution || !candidateInstitution) {
      return baseConfidence;
    }

    const normalizeInst = (inst) => inst.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const searchNorm = normalizeInst(searchInstitution);
    const candidateNorm = normalizeInst(candidateInstitution);

    // Exact match
    if (searchNorm === candidateNorm) {
      return Math.min(100, baseConfidence + 15);
    }

    // Partial match (one contains the other)
    if (searchNorm.includes(candidateNorm) || candidateNorm.includes(searchNorm)) {
      return Math.min(100, baseConfidence + 10);
    }

    // Word overlap check
    const searchWords = new Set(searchNorm.split(/\s+/));
    const candidateWords = new Set(candidateNorm.split(/\s+/));
    const stopWords = new Set(['of', 'the', 'and', 'at', 'in', 'for', 'university', 'college', 'institute']);

    const searchSignificant = [...searchWords].filter(w => !stopWords.has(w) && w.length > 2);
    const candidateSignificant = [...candidateWords].filter(w => !stopWords.has(w) && w.length > 2);

    const overlap = searchSignificant.filter(w => candidateSignificant.includes(w));
    if (overlap.length >= 2) {
      return Math.min(100, baseConfidence + 10);
    }

    return baseConfidence;
  }

  // ============================================
  // SEARCH METHODS
  // ============================================

  /**
   * Search for matches in a list of authors (from retraction records)
   * Returns all matches above minimum confidence threshold
   */
  static findMatchesInAuthors(searchName, searchInstitution, authorsList, minConfidence = 50) {
    const matches = [];

    for (const author of authorsList) {
      const { matches: isMatch, confidence, matchType } = this.calculateNameMatch(searchName, author);

      if (isMatch && confidence >= minConfidence) {
        const adjustedConfidence = this.adjustConfidenceForInstitution(
          confidence,
          searchInstitution,
          null // Retraction records may not have per-author institution
        );

        if (adjustedConfidence >= minConfidence) {
          matches.push({
            matchedName: author,
            confidence: adjustedConfidence,
            matchType,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Build search query for database
   * Returns PostgreSQL array contains query parts
   */
  static buildDatabaseSearchTerms(name) {
    const parts = this.extractNameParts(name);
    const terms = [];

    // Full normalized name
    terms.push(parts.full);

    // Last name (always include)
    if (parts.last) {
      terms.push(parts.last);
    }

    // First + Last combination
    if (parts.first && parts.last) {
      terms.push(`${parts.first} ${parts.last}`);
    }

    // First initial + Last
    if (parts.first && parts.last) {
      terms.push(`${parts.first[0]} ${parts.last}`);
    }

    // Last + First (for "Smith, John" format in database)
    if (parts.first && parts.last) {
      terms.push(`${parts.last} ${parts.first}`);
    }

    return [...new Set(terms)];
  }

  // ============================================
  // CONFIDENCE LEVEL HELPERS
  // ============================================

  /**
   * Get confidence level category
   */
  static getConfidenceLevel(confidence) {
    if (confidence >= 90) return 'high';
    if (confidence >= 70) return 'medium';
    if (confidence >= 50) return 'low';
    return 'insufficient';
  }

  /**
   * Get confidence display info
   */
  static getConfidenceDisplay(confidence) {
    if (confidence >= 90) {
      return { level: 'high', color: 'red', icon: '🔴', label: 'High' };
    }
    if (confidence >= 70) {
      return { level: 'medium', color: 'yellow', icon: '🟡', label: 'Medium' };
    }
    if (confidence >= 50) {
      return { level: 'low', color: 'orange', icon: '🟠', label: 'Low' };
    }
    return { level: 'insufficient', color: 'gray', icon: '⚪', label: 'Insufficient' };
  }
}

module.exports = { IntegrityMatchingService };
