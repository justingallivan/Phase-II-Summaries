/**
 * IntegrityMatchingService - Name matching for integrity screening
 *
 * Provides multi-tier name matching with confidence scoring.
 * Builds on patterns from DeduplicationService but optimized for
 * finding potential matches in the Retraction Watch database.
 */

const stringSimilarity = require('string-similarity');

// Name variant mapping - maps nicknames to formal names and vice versa
// Key: normalized name, Value: array of variants
const NAME_VARIANTS = {
  // Common English name variants
  'robert': ['bob', 'rob', 'robbie', 'bobby', 'bert'],
  'william': ['bill', 'will', 'billy', 'willy', 'liam'],
  'richard': ['rick', 'dick', 'rich', 'ricky'],
  'james': ['jim', 'jimmy', 'jamie'],
  'john': ['jack', 'johnny', 'jon'],
  'michael': ['mike', 'mick', 'mickey', 'mikey'],
  'joseph': ['joe', 'joey'],
  'thomas': ['tom', 'tommy'],
  'charles': ['charlie', 'chuck', 'chas'],
  'david': ['dave', 'davy'],
  'daniel': ['dan', 'danny'],
  'edward': ['ed', 'eddie', 'ted', 'teddy', 'ned'],
  'steven': ['steve', 'stevie'],
  'stephen': ['steve', 'stevie'],
  'christopher': ['chris', 'kit'],
  'matthew': ['matt', 'matty'],
  'anthony': ['tony', 'ant'],
  'andrew': ['andy', 'drew'],
  'nicholas': ['nick', 'nicky'],
  'benjamin': ['ben', 'benny', 'benji'],
  'samuel': ['sam', 'sammy'],
  'alexander': ['alex', 'al', 'xander'],
  'jonathan': ['jon', 'jonny', 'nathan'],
  'timothy': ['tim', 'timmy'],
  'gregory': ['greg', 'gregg'],
  'patrick': ['pat', 'paddy'],
  'raymond': ['ray'],
  'lawrence': ['larry', 'laurie'],
  'gerald': ['gerry', 'jerry'],
  'kenneth': ['ken', 'kenny'],
  'ronald': ['ron', 'ronny'],
  'donald': ['don', 'donny'],
  'phillip': ['phil'],
  'philip': ['phil'],
  'eugene': ['gene'],
  'walter': ['walt', 'wally'],
  'frederick': ['fred', 'freddy', 'freddie'],
  'albert': ['al', 'bert', 'bertie'],
  'arthur': ['art', 'artie'],
  'henry': ['hank', 'harry', 'hal'],
  'harold': ['harry', 'hal'],
  'peter': ['pete'],
  'douglas': ['doug', 'dougie'],
  'leonard': ['leo', 'len', 'lenny'],
  'theodore': ['ted', 'teddy', 'theo'],
  'francis': ['frank', 'frankie', 'fran'],
  'bernard': ['bernie', 'barney'],
  'louis': ['lou', 'louie'],
  'vincent': ['vince', 'vinny', 'vin'],
  'nathaniel': ['nate', 'nat', 'nathan'],
  'elizabeth': ['liz', 'lizzy', 'beth', 'betty', 'betsy', 'eliza', 'lisa'],
  'margaret': ['maggie', 'meg', 'peggy', 'marge', 'margie'],
  'catherine': ['cathy', 'kate', 'katie', 'cat'],
  'katherine': ['kathy', 'kate', 'katie', 'kat'],
  'patricia': ['pat', 'patty', 'tricia', 'trish'],
  'jennifer': ['jen', 'jenny', 'jenn'],
  'rebecca': ['becky', 'becca'],
  'deborah': ['deb', 'debbie'],
  'susan': ['sue', 'susie', 'suzy'],
  'dorothy': ['dot', 'dotty', 'dottie'],
  'victoria': ['vicky', 'vicki', 'tori'],
  'christine': ['chris', 'chrissy', 'tina'],
  'christina': ['chris', 'chrissy', 'tina'],
  'alexandra': ['alex', 'lexi', 'sandra'],
  'samantha': ['sam', 'sammy'],
  'jessica': ['jess', 'jessie'],
  'stephanie': ['steph', 'stephie'],
  'melissa': ['mel', 'missy', 'lissa'],
  'jacqueline': ['jackie', 'jacqui'],
  'carolyn': ['carol', 'carrie', 'lyn'],
  'caroline': ['carol', 'carrie', 'line'],
  'abigail': ['abby', 'gail'],
  'madeleine': ['maddie', 'maddy'],
  'madeline': ['maddie', 'maddy'],
  'josephine': ['jo', 'josie'],
  'gabrielle': ['gabby', 'gabi', 'elle'],
  'gabriella': ['gabby', 'gabi', 'ella'],
  'natalie': ['nat', 'natty'],
  'alexander': ['sasha'], // Russian variant
  // International variants
  'mikhail': ['misha', 'michael'],
  'aleksandr': ['sasha', 'alex', 'alexander'],
  'yevgeny': ['eugene', 'zhenya'],
  'dmitri': ['dima', 'dmitry'],
  'nikolai': ['kolya', 'nicholas'],
  'sergei': ['seryozha'],
  'vladimir': ['volodya', 'vlad'],
  'giuseppe': ['joe', 'joseph'],
  'giovanni': ['john', 'gianni'],
  'francesco': ['frank', 'francis'],
  'antonio': ['tony', 'anthony'],
  'johannes': ['john', 'hans', 'johan'],
  'wilhelm': ['william', 'willi'],
  'friedrich': ['frederick', 'fritz'],
  'heinrich': ['henry', 'heinz'],
  'karl': ['charles', 'carl'],
};

// Build reverse mapping for quick lookup
const NAME_VARIANT_REVERSE = {};
for (const [formal, variants] of Object.entries(NAME_VARIANTS)) {
  for (const variant of variants) {
    if (!NAME_VARIANT_REVERSE[variant]) {
      NAME_VARIANT_REVERSE[variant] = [];
    }
    NAME_VARIANT_REVERSE[variant].push(formal);
  }
}

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
  // NAME VARIANTS
  // ============================================

  /**
   * Get all known variants of a first name
   * Returns array including the original name
   */
  static getNameVariants(firstName) {
    if (!firstName) return [];

    const normalized = firstName.toLowerCase().trim();
    const variants = new Set([normalized]);

    // Check if this is a formal name with known nicknames
    if (NAME_VARIANTS[normalized]) {
      NAME_VARIANTS[normalized].forEach(v => variants.add(v));
    }

    // Check if this is a nickname with known formal names
    if (NAME_VARIANT_REVERSE[normalized]) {
      NAME_VARIANT_REVERSE[normalized].forEach(formal => {
        variants.add(formal);
        // Also add other nicknames of the formal name
        if (NAME_VARIANTS[formal]) {
          NAME_VARIANTS[formal].forEach(v => variants.add(v));
        }
      });
    }

    return [...variants];
  }

  /**
   * Check if two first names are variants of each other
   */
  static areNameVariants(name1, name2) {
    if (!name1 || !name2) return false;

    const n1 = name1.toLowerCase().trim();
    const n2 = name2.toLowerCase().trim();

    if (n1 === n2) return true;

    const variants1 = this.getNameVariants(n1);
    return variants1.includes(n2);
  }

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

    // Tier 2.5: Last name + first name variant match (90%)
    // e.g., "Robert Smith" matches "Bob Smith"
    if (search.last === candidate.last && search.first && candidate.first) {
      if (this.areNameVariants(search.first, candidate.first)) {
        return { matches: true, confidence: 90, matchType: 'name_variant' };
      }
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

    // Tier 3.5: Name order swap match for Asian names (85%)
    // e.g., "Wei Zhang" matches "Zhang Wei"
    if (search.first && search.last && candidate.first && candidate.last) {
      if (search.first === candidate.last && search.last === candidate.first) {
        return { matches: true, confidence: 85, matchType: 'name_order_swap' };
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

    // Tier 5.5: Name order swap with variants (75%)
    // e.g., "Bob Zhang" matches "Zhang Robert"
    if (search.first && search.last && candidate.first && candidate.last) {
      if (search.last === candidate.first &&
          this.areNameVariants(search.first, candidate.last)) {
        return { matches: true, confidence: 75, matchType: 'name_order_swap_variant' };
      }
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

    // Last + First (for "Smith, John" format in database and Asian name order)
    if (parts.first && parts.last) {
      terms.push(`${parts.last} ${parts.first}`);
    }

    // Name variants (e.g., Bob/Robert, Bill/William)
    if (parts.first && parts.last) {
      const variants = this.getNameVariants(parts.first);
      for (const variant of variants) {
        if (variant !== parts.first) {
          // Variant + Last
          terms.push(`${variant} ${parts.last}`);
          // Last + Variant (for reversed order)
          terms.push(`${parts.last} ${variant}`);
          // Variant initial + Last
          terms.push(`${variant[0]} ${parts.last}`);
        }
      }
    }

    return [...new Set(terms)];
  }

  /**
   * Build LIKE patterns for text-based fallback search
   * Used when array matching doesn't find results
   */
  static buildTextSearchPatterns(name) {
    const parts = this.extractNameParts(name);
    const patterns = [];

    if (!parts.first || !parts.last) {
      // Single name - just search for it
      if (parts.last) {
        patterns.push(`%${parts.last}%`);
      }
      return patterns;
    }

    // Pattern: "first% last" - handles middle names
    patterns.push(`%${parts.first}%${parts.last}%`);

    // Pattern: "last% first" - handles reversed order and middle names
    patterns.push(`%${parts.last}%${parts.first}%`);

    // Name variants
    const variants = this.getNameVariants(parts.first);
    for (const variant of variants) {
      if (variant !== parts.first) {
        patterns.push(`%${variant}%${parts.last}%`);
        patterns.push(`%${parts.last}%${variant}%`);
      }
    }

    return [...new Set(patterns)];
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
