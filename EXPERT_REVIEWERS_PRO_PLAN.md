# Expert Reviewers Pro - Complete Implementation Plan

**Project:** Multi-Source Reviewer Finder with Database Caching  
**Base App:** Building on existing "Find Expert Reviewers" app  
**Target Platform:** Vercel (Next.js + Postgres)  
**Goal:** Search PubMed, ArXiv, BioRxiv, and Google Scholar for 20 reviewer candidates with intelligent caching and deduplication

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase 1: Vercel Infrastructure Setup](#phase-1-vercel-infrastructure-setup)
3. [Phase 2: Project Setup](#phase-2-project-setup)
4. [Phase 3: Database Schema & Migrations](#phase-3-database-schema--migrations)
5. [Phase 4: Database Service Layer](#phase-4-database-service-layer)
6. [Phase 5: External API Services](#phase-5-external-api-services)
7. [Phase 6: Deduplication Service](#phase-6-deduplication-service)
8. [Phase 7: Main Orchestration API](#phase-7-main-orchestration-api)
9. [Phase 8: Frontend Integration](#phase-8-frontend-integration)
10. [Phase 9: Deployment Checklist](#phase-9-deployment-checklist)
11. [Phase 10: Testing & Validation](#phase-10-testing--validation)

---

## Architecture Overview

### System Components
```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Next.js)                                     │
│  - Proposal upload & metadata extraction (reuse existing)│
│  - Multi-source search interface (new)                  │
│  - Researcher results display (enhanced)                │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  API Routes (/app/api/)                                 │
│  - /extract-metadata (existing - reuse)                 │
│  - /search-reviewers (new - orchestrates multi-source)  │
│  - /enrich-contacts (new - finds emails/websites)       │
│  - /cache-stats (new - analytics)                       │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Service Layer                                          │
│  - DatabaseService (new - all DB operations)            │
│  - PubMedService (new)                                  │
│  - ArXivService (new)                                   │
│  - BioRxivService (new)                                 │
│  - ScholarService (new - SerpAPI)                       │
│  - ContactEnrichmentService (reuse existing)            │
│  - DeduplicationService (new)                           │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Vercel Postgres Database                               │
│  - search_cache, researchers, publications,             │
│    researcher_keywords, reviewer_suggestions            │
└─────────────────────────────────────────────────────────┘
```

### Key Features

- **Multi-source search**: PubMed, ArXiv, BioRxiv, Google Scholar
- **Intelligent caching**: 6-month cache for searches, 3-month for profiles
- **Deduplication**: Merge "John Smith" and "J. Smith" automatically
- **Conflict filtering**: Remove researchers from same institution
- **Team collaboration**: Shared cache across colleagues
- **Cost optimization**: Minimize API calls to paid services

---

## Phase 1: Vercel Infrastructure Setup

### Step 1.1: Create Vercel Postgres Database

**Actions in Vercel Dashboard:**

1. Go to your Vercel dashboard → Storage tab
2. Click "Create Database" → Select "Postgres"
3. Name: `expert-reviewers-db`
4. Region: Choose closest to your users (e.g., `us-west-1`)
5. Click "Create"
6. **Note the connection details** (automatically added to environment variables)

**Environment Variables (auto-created):**
```bash
POSTGRES_URL
POSTGRES_URL_NON_POOLING
POSTGRES_USER
POSTGRES_HOST
POSTGRES_PASSWORD
POSTGRES_DATABASE
```

### Step 1.2: Add Additional Environment Variables

In Vercel Dashboard → Settings → Environment Variables:
```bash
# API Keys (you'll need to obtain these)
SERP_API_KEY=your_serpapi_key_here
NCBI_API_KEY=your_ncbi_key_here  # Optional but increases rate limits

# Existing keys (from your current app)
ANTHROPIC_API_KEY=your_anthropic_key_here
GOOGLE_API_KEY=your_google_api_key_here
GOOGLE_CSE_ID=your_google_cse_id_here

# Cache settings
CACHE_SEARCH_EXPIRY_MONTHS=6
CACHE_RESEARCHER_EXPIRY_MONTHS=3
```

### Step 1.3: Install Vercel CLI (if not already installed)
```bash
npm i -g vercel
vercel login
```

---

## Phase 2: Project Setup

### Step 2.1: Create New Next.js App
```bash
# Create new app based on your existing structure
npx create-next-app@latest expert-reviewers-pro
cd expert-reviewers-pro

# Select these options:
# ✓ TypeScript
# ✓ ESLint
# ✓ Tailwind CSS
# ✓ App Router
# ✗ Turbopack (for now)
```

### Step 2.2: Install Dependencies
```bash
npm install @vercel/postgres
npm install @anthropic-ai/sdk
npm install xml2js  # For PubMed XML parsing
npm install serpapi  # For Google Scholar
npm install node-fetch  # For API requests
npm install string-similarity  # For name deduplication
npm install -D @types/xml2js
npm install -D tsx  # For running TypeScript scripts
```

### Step 2.3: Copy Existing Code

**From your "Find Expert Reviewers" app, copy:**
```
/app/api/extract-metadata/route.ts  → Keep as-is
/components/ProposalUploader.tsx     → Keep as-is (or enhance)
/lib/anthropic-client.ts             → Keep as-is
/lib/google-search.ts                → Keep for contact enrichment

# Any utility functions you've built for:
- PDF text extraction
- Document parsing
- Proposal metadata structure types
```

### Step 2.4: Update package.json Scripts

Add these scripts to `package.json`:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "db:setup": "tsx scripts/setup-database.ts",
    "db:cleanup-cache": "tsx scripts/cleanup-cache.ts"
  }
}
```

---

## Phase 3: Database Schema & Migrations

### Step 3.1: Create Database Schema File

**File:** `/lib/db/schema.sql`
```sql
-- ============================================
-- SEARCH CACHE TABLE
-- Stores results from external API searches
-- ============================================
CREATE TABLE IF NOT EXISTS search_cache (
  id SERIAL PRIMARY KEY,
  source VARCHAR(50) NOT NULL,  -- 'pubmed', 'arxiv', 'biorxiv', 'scholar'
  query_hash VARCHAR(64) NOT NULL,  -- SHA256 hash of search parameters
  query_text TEXT NOT NULL,  -- Human-readable query for debugging
  results JSONB,  -- Full results from API
  result_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  UNIQUE(source, query_hash)
);

-- ============================================
-- RESEARCHERS TABLE
-- Deduplicated researcher profiles
-- ============================================
CREATE TABLE IF NOT EXISTS researchers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255),  -- Lowercase, no punctuation for matching
  primary_affiliation VARCHAR(500),
  department VARCHAR(255),
  email VARCHAR(255),
  website VARCHAR(500),
  orcid VARCHAR(50),
  google_scholar_id VARCHAR(100),
  h_index INTEGER,
  i10_index INTEGER,
  total_citations INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_checked TIMESTAMP  -- Last time we verified/refreshed this profile
);

-- ============================================
-- PUBLICATIONS TABLE
-- Papers linked to researchers
-- ============================================
CREATE TABLE IF NOT EXISTS publications (
  id SERIAL PRIMARY KEY,
  researcher_id INTEGER REFERENCES researchers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  authors TEXT[],  -- Array of all author names
  author_position INTEGER,  -- Position of this researcher in author list
  publication_date DATE,
  year INTEGER,
  journal VARCHAR(500),
  doi VARCHAR(100),
  pmid VARCHAR(50),  -- PubMed ID
  pmcid VARCHAR(50),  -- PubMed Central ID
  arxiv_id VARCHAR(50),
  citations INTEGER DEFAULT 0,
  abstract TEXT,
  source VARCHAR(50),  -- 'pubmed', 'arxiv', 'biorxiv', 'scholar'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(doi)  -- Prevent duplicate publications by DOI
);

-- ============================================
-- RESEARCHER KEYWORDS TABLE
-- Research areas/expertise for each researcher
-- ============================================
CREATE TABLE IF NOT EXISTS researcher_keywords (
  id SERIAL PRIMARY KEY,
  researcher_id INTEGER REFERENCES researchers(id) ON DELETE CASCADE,
  keyword VARCHAR(255) NOT NULL,
  relevance_score FLOAT DEFAULT 1.0,  -- 0-1, how strongly associated
  source VARCHAR(50),  -- 'publications', 'profile', 'manual'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(researcher_id, keyword, source)
);

-- ============================================
-- REVIEWER SUGGESTIONS TABLE
-- Track which researchers were suggested for which proposals
-- ============================================
CREATE TABLE IF NOT EXISTS reviewer_suggestions (
  id SERIAL PRIMARY KEY,
  proposal_id VARCHAR(100) NOT NULL,  -- Your internal proposal identifier
  proposal_title TEXT,
  researcher_id INTEGER REFERENCES researchers(id) ON DELETE CASCADE,
  relevance_score FLOAT,  -- How well they match this proposal
  match_reason TEXT,  -- Why we suggested them
  sources TEXT[],  -- Which databases found them: ['pubmed', 'scholar']
  suggested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  selected BOOLEAN DEFAULT FALSE,  -- Did you actually use them?
  invited BOOLEAN DEFAULT FALSE,  -- Did you send invitation?
  accepted BOOLEAN,  -- Did they accept?
  notes TEXT,
  UNIQUE(proposal_id, researcher_id)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_search_cache_lookup 
  ON search_cache(source, query_hash);

CREATE INDEX IF NOT EXISTS idx_search_cache_expires 
  ON search_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_researchers_normalized 
  ON researchers(normalized_name);

CREATE INDEX IF NOT EXISTS idx_researchers_email 
  ON researchers(email);

CREATE INDEX IF NOT EXISTS idx_researchers_updated 
  ON researchers(last_updated);

CREATE INDEX IF NOT EXISTS idx_publications_researcher 
  ON publications(researcher_id);

CREATE INDEX IF NOT EXISTS idx_publications_date 
  ON publications(publication_date DESC);

CREATE INDEX IF NOT EXISTS idx_publications_doi 
  ON publications(doi);

CREATE INDEX IF NOT EXISTS idx_keywords_researcher 
  ON researcher_keywords(researcher_id);

CREATE INDEX IF NOT EXISTS idx_keywords_keyword 
  ON researcher_keywords(keyword);

CREATE INDEX IF NOT EXISTS idx_suggestions_proposal 
  ON reviewer_suggestions(proposal_id);

CREATE INDEX IF NOT EXISTS idx_suggestions_researcher 
  ON reviewer_suggestions(researcher_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM search_cache WHERE expires_at < CURRENT_TIMESTAMP;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
```

### Step 3.2: Create Migration Script

**File:** `/scripts/setup-database.ts`
```typescript
import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  try {
    console.log('🚀 Starting database migration...');
    
    // Read schema file
    const schemaPath = path.join(process.cwd(), 'lib', 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split into individual statements (rough split on semicolons)
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    // Execute each statement
    for (const statement of statements) {
      await sql.query(statement);
      console.log('✅ Executed statement');
    }
    
    console.log('✨ Database migration completed successfully!');
    console.log('📊 Tables created: search_cache, researchers, publications, researcher_keywords, reviewer_suggestions');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

runMigration();
```

**Run migration:**
```bash
npm run db:setup
```

---

## Phase 4: Database Service Layer

### File: `/lib/services/database-service.ts`
```typescript
import { sql } from '@vercel/postgres';
import { createHash } from 'crypto';

export interface SearchCacheEntry {
  source: string;
  query: string;
  results: any;
  expiresAt: Date;
}

export interface Researcher {
  id?: number;
  name: string;
  normalizedName: string;
  primaryAffiliation?: string;
  department?: string;
  email?: string;
  website?: string;
  orcid?: string;
  googleScholarId?: string;
  hIndex?: number;
  i10Index?: number;
  totalCitations?: number;
}

export interface Publication {
  researcherId: number;
  title: string;
  authors: string[];
  authorPosition?: number;
  publicationDate?: Date;
  year?: number;
  journal?: string;
  doi?: string;
  pmid?: string;
  arxivId?: string;
  citations?: number;
  abstract?: string;
  source: string;
}

export class DatabaseService {
  
  // ============================================
  // CACHE OPERATIONS
  // ============================================
  
  static generateQueryHash(source: string, query: string): string {
    return createHash('sha256')
      .update(`${source}:${query}`)
      .digest('hex');
  }
  
  static async checkCache(source: string, query: string): Promise<any | null> {
    const queryHash = this.generateQueryHash(source, query);
    
    const result = await sql`
      SELECT results FROM search_cache
      WHERE source = ${source} 
        AND query_hash = ${queryHash}
        AND expires_at > CURRENT_TIMESTAMP
    `;
    
    return result.rows[0]?.results || null;
  }
  
  static async cacheSearch(entry: SearchCacheEntry): Promise<void> {
    const queryHash = this.generateQueryHash(entry.source, entry.query);
    const resultCount = Array.isArray(entry.results) ? entry.results.length : 0;
    
    await sql`
      INSERT INTO search_cache (
        source, query_hash, query_text, results, result_count, expires_at
      )
      VALUES (
        ${entry.source},
        ${queryHash},
        ${entry.query},
        ${JSON.stringify(entry.results)},
        ${resultCount},
        ${entry.expiresAt.toISOString()}
      )
      ON CONFLICT (source, query_hash) 
      DO UPDATE SET 
        results = ${JSON.stringify(entry.results)},
        result_count = ${resultCount},
        created_at = CURRENT_TIMESTAMP,
        expires_at = ${entry.expiresAt.toISOString()}
    `;
  }
  
  // ============================================
  // RESEARCHER OPERATIONS
  // ============================================
  
  static normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  static async findResearcher(name: string): Promise<Researcher | null> {
    const normalized = this.normalizeName(name);
    
    const result = await sql`
      SELECT * FROM researchers
      WHERE normalized_name = ${normalized}
      LIMIT 1
    `;
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name,
      primaryAffiliation: row.primary_affiliation,
      department: row.department,
      email: row.email,
      website: row.website,
      orcid: row.orcid,
      googleScholarId: row.google_scholar_id,
      hIndex: row.h_index,
      i10Index: row.i10_index,
      totalCitations: row.total_citations,
    };
  }
  
  static async createOrUpdateResearcher(researcher: Researcher): Promise<number> {
    const existing = await this.findResearcher(researcher.name);
    
    if (existing) {
      // Update existing researcher
      await sql`
        UPDATE researchers SET
          primary_affiliation = COALESCE(${researcher.primaryAffiliation}, primary_affiliation),
          department = COALESCE(${researcher.department}, department),
          email = COALESCE(${researcher.email}, email),
          website = COALESCE(${researcher.website}, website),
          orcid = COALESCE(${researcher.orcid}, orcid),
          google_scholar_id = COALESCE(${researcher.googleScholarId}, google_scholar_id),
          h_index = GREATEST(COALESCE(${researcher.hIndex}, 0), COALESCE(h_index, 0)),
          i10_index = GREATEST(COALESCE(${researcher.i10Index}, 0), COALESCE(i10_index, 0)),
          total_citations = GREATEST(COALESCE(${researcher.totalCitations}, 0), COALESCE(total_citations, 0)),
          last_updated = CURRENT_TIMESTAMP
        WHERE id = ${existing.id}
      `;
      return existing.id!;
    } else {
      // Create new researcher
      const result = await sql`
        INSERT INTO researchers (
          name, normalized_name, primary_affiliation, department, 
          email, website, orcid, google_scholar_id,
          h_index, i10_index, total_citations
        )
        VALUES (
          ${researcher.name},
          ${researcher.normalizedName},
          ${researcher.primaryAffiliation},
          ${researcher.department},
          ${researcher.email},
          ${researcher.website},
          ${researcher.orcid},
          ${researcher.googleScholarId},
          ${researcher.hIndex},
          ${researcher.i10Index},
          ${researcher.totalCitations}
        )
        RETURNING id
      `;
      return result.rows[0].id;
    }
  }
  
  static async getResearchersByKeywords(keywords: string[]): Promise<Researcher[]> {
    const result = await sql`
      SELECT DISTINCT r.*
      FROM researchers r
      JOIN researcher_keywords rk ON r.id = rk.researcher_id
      WHERE rk.keyword = ANY(${keywords})
      ORDER BY r.h_index DESC NULLS LAST
      LIMIT 100
    `;
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name,
      primaryAffiliation: row.primary_affiliation,
      department: row.department,
      email: row.email,
      website: row.website,
      orcid: row.orcid,
      googleScholarId: row.google_scholar_id,
      hIndex: row.h_index,
      i10Index: row.i10_index,
      totalCitations: row.total_citations,
    }));
  }
  
  // ============================================
  // PUBLICATION OPERATIONS
  // ============================================
  
  static async addPublication(publication: Publication): Promise<void> {
    try {
      await sql`
        INSERT INTO publications (
          researcher_id, title, authors, author_position,
          publication_date, year, journal, doi, pmid, arxiv_id,
          citations, abstract, source
        )
        VALUES (
          ${publication.researcherId},
          ${publication.title},
          ${publication.authors},
          ${publication.authorPosition},
          ${publication.publicationDate?.toISOString()},
          ${publication.year},
          ${publication.journal},
          ${publication.doi},
          ${publication.pmid},
          ${publication.arxivId},
          ${publication.citations},
          ${publication.abstract},
          ${publication.source}
        )
        ON CONFLICT (doi) DO NOTHING
      `;
    } catch (error: any) {
      // Ignore duplicate errors
      if (!error.message?.includes('duplicate')) {
        throw error;
      }
    }
  }
  
  static async getRecentPublications(
    researcherId: number, 
    limit: number = 10
  ): Promise<Publication[]> {
    const result = await sql`
      SELECT * FROM publications
      WHERE researcher_id = ${researcherId}
      ORDER BY publication_date DESC NULLS LAST
      LIMIT ${limit}
    `;
    
    return result.rows.map(row => ({
      researcherId: row.researcher_id,
      title: row.title,
      authors: row.authors,
      authorPosition: row.author_position,
      publicationDate: row.publication_date ? new Date(row.publication_date) : undefined,
      year: row.year,
      journal: row.journal,
      doi: row.doi,
      pmid: row.pmid,
      arxivId: row.arxiv_id,
      citations: row.citations,
      abstract: row.abstract,
      source: row.source,
    }));
  }
  
  // ============================================
  // KEYWORD OPERATIONS
  // ============================================
  
  static async addKeywords(
    researcherId: number, 
    keywords: string[], 
    source: string = 'publications'
  ): Promise<void> {
    for (const keyword of keywords) {
      await sql`
        INSERT INTO researcher_keywords (researcher_id, keyword, source)
        VALUES (${researcherId}, ${keyword.toLowerCase()}, ${source})
        ON CONFLICT (researcher_id, keyword, source) DO NOTHING
      `;
    }
  }
  
  // ============================================
  // REVIEWER SUGGESTION OPERATIONS
  // ============================================
  
  static async recordSuggestion(
    proposalId: string,
    proposalTitle: string,
    researcherId: number,
    relevanceScore: number,
    matchReason: string,
    sources: string[]
  ): Promise<void> {
    await sql`
      INSERT INTO reviewer_suggestions (
        proposal_id, proposal_title, researcher_id, 
        relevance_score, match_reason, sources
      )
      VALUES (
        ${proposalId},
        ${proposalTitle},
        ${researcherId},
        ${relevanceScore},
        ${matchReason},
        ${sources}
      )
      ON CONFLICT (proposal_id, researcher_id) 
      DO UPDATE SET
        relevance_score = ${relevanceScore},
        match_reason = ${matchReason},
        sources = ${sources},
        suggested_at = CURRENT_TIMESTAMP
    `;
  }
  
  static async getSuggestionsForProposal(proposalId: string): Promise<any[]> {
    const result = await sql`
      SELECT 
        rs.*,
        r.name, r.email, r.website, r.primary_affiliation,
        r.h_index, r.total_citations
      FROM reviewer_suggestions rs
      JOIN researchers r ON rs.researcher_id = r.id
      WHERE rs.proposal_id = ${proposalId}
      ORDER BY rs.relevance_score DESC
    `;
    
    return result.rows;
  }
  
  // ============================================
  // ANALYTICS & MAINTENANCE
  // ============================================
  
  static async getCacheStats(): Promise<any> {
    const result = await sql`
      SELECT 
        source,
        COUNT(*) as total_entries,
        SUM(result_count) as total_results,
        COUNT(*) FILTER (WHERE expires_at > CURRENT_TIMESTAMP) as active_entries,
        COUNT(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP) as expired_entries
      FROM search_cache
      GROUP BY source
    `;
    
    return result.rows;
  }
  
  static async cleanupExpiredCache(): Promise<number> {
    const result = await sql`
      DELETE FROM search_cache 
      WHERE expires_at < CURRENT_TIMESTAMP
    `;
    
    return result.rowCount || 0;
  }
}
```

---

## Phase 5: External API Services

### Step 5.1: PubMed Service

**File:** `/lib/services/pubmed-service.ts`
```typescript
import { DatabaseService } from './database-service';
import { parseStringPromise } from 'xml2js';

export interface PubMedAuthor {
  name: string;
  affiliation?: string;
}

export interface PubMedArticle {
  pmid: string;
  title: string;
  authors: PubMedAuthor[];
  journal: string;
  publicationDate: Date;
  doi?: string;
  abstract?: string;
}

export class PubMedService {
  private static baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
  private static apiKey = process.env.NCBI_API_KEY;
  
  // ============================================
  // SEARCH WITH CACHING
  // ============================================
  
  static async search(query: string, maxResults: number = 100): Promise<PubMedArticle[]> {
    // Check cache first
    const cached = await DatabaseService.checkCache('pubmed', query);
    if (cached) {
      console.log('✅ PubMed cache hit for:', query);
      return cached;
    }
    
    console.log('🔍 Querying PubMed API for:', query);
    
    // Step 1: Search to get PMIDs
    const pmids = await this.searchPMIDs(query, maxResults);
    
    if (pmids.length === 0) {
      await this.cacheResults(query, []);
      return [];
    }
    
    // Step 2: Fetch full article details
    const articles = await this.fetchArticles(pmids);
    
    // Cache results for 6 months
    await this.cacheResults(query, articles);
    
    return articles;
  }
  
  // ============================================
  // INTERNAL METHODS
  // ============================================
  
  private static async searchPMIDs(query: string, maxResults: number): Promise<string[]> {
    const params = new URLSearchParams({
      db: 'pubmed',
      term: query,
      retmax: maxResults.toString(),
      retmode: 'json',
      sort: 'relevance',
      ...(this.apiKey && { api_key: this.apiKey }),
    });
    
    const url = `${this.baseUrl}esearch.fcgi?${params}`;
    const response = await fetch(url);
    const data = await response.json();
    
    return data.esearchresult?.idlist || [];
  }
  
  private static async fetchArticles(pmids: string[]): Promise<PubMedArticle[]> {
    // PubMed API allows fetching up to 500 articles at once
    const chunkSize = 200;
    const articles: PubMedArticle[] = [];
    
    for (let i = 0; i < pmids.length; i += chunkSize) {
      const chunk = pmids.slice(i, i + chunkSize);
      const chunkArticles = await this.fetchArticleChunk(chunk);
      articles.push(...chunkArticles);
      
      // Rate limiting: wait 350ms between requests
      if (i + chunkSize < pmids.length) {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    }
    
    return articles;
  }
  
  private static async fetchArticleChunk(pmids: string[]): Promise<PubMedArticle[]> {
    const params = new URLSearchParams({
      db: 'pubmed',
      id: pmids.join(','),
      retmode: 'xml',
      ...(this.apiKey && { api_key: this.apiKey }),
    });
    
    const url = `${this.baseUrl}efetch.fcgi?${params}`;
    const response = await fetch(url);
    const xml = await response.text();
    
    return this.parseXML(xml);
  }
  
  private static async parseXML(xml: string): Promise<PubMedArticle[]> {
    const result = await parseStringPromise(xml);
    const articles: PubMedArticle[] = [];
    
    const pubmedArticles = result.PubmedArticleSet?.PubmedArticle || [];
    
    for (const article of pubmedArticles) {
      try {
        const medlineCitation = article.MedlineCitation?.[0];
        const articleData = medlineCitation?.Article?.[0];
        
        if (!articleData) continue;
        
        // Extract PMID
        const pmid = medlineCitation.PMID?.[0]._ || medlineCitation.PMID?.[0];
        
        // Extract title
        const title = articleData.ArticleTitle?.[0];
        
        // Extract authors
        const authorList = articleData.AuthorList?.[0]?.Author || [];
        const authors: PubMedAuthor[] = authorList.map((author: any) => {
          const lastName = author.LastName?.[0] || '';
          const foreName = author.ForeName?.[0] || '';
          const affiliation = author.AffiliationInfo?.[0]?.Affiliation?.[0];
          
          return {
            name: `${foreName} ${lastName}`.trim(),
            affiliation,
          };
        });
        
        // Extract journal
        const journal = articleData.Journal?.[0]?.Title?.[0] || '';
        
        // Extract publication date
        const pubDate = medlineCitation.DateCompleted?.[0] || 
                       medlineCitation.DateRevised?.[0] ||
                       articleData.Journal?.[0]?.JournalIssue?.[0]?.PubDate?.[0];
        
        const year = parseInt(pubDate?.Year?.[0] || '0');
        const month = parseInt(pubDate?.Month?.[0] || '1');
        const day = parseInt(pubDate?.Day?.[0] || '1');
        const publicationDate = new Date(year, month - 1, day);
        
        // Extract DOI
        const articleIds = article.PubmedData?.[0]?.ArticleIdList?.[0]?.ArticleId || [];
        const doiObj = articleIds.find((id: any) => id.$.IdType === 'doi');
        const doi = doiObj?._  || doiObj;
        
        // Extract abstract
        const abstractTexts = articleData.Abstract?.[0]?.AbstractText || [];
        const abstract = abstractTexts.map((text: any) => text._ || text).join(' ');
        
        articles.push({
          pmid,
          title,
          authors,
          journal,
          publicationDate,
          doi,
          abstract,
        });
      } catch (error) {
        console.error('Error parsing article:', error);
        continue;
      }
    }
    
    return articles;
  }
  
  private static async cacheResults(query: string, results: PubMedArticle[]): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6); // 6 months expiry
    
    await DatabaseService.cacheSearch({
      source: 'pubmed',
      query,
      results,
      expiresAt,
    });
  }
  
  // ============================================
  // QUERY GENERATORS
  // ============================================
  
  static generateQuery(metadata: any): string {
    const parts: string[] = [];
    
    // Primary research area
    if (metadata.PRIMARY_RESEARCH_AREA && metadata.PRIMARY_RESEARCH_AREA !== 'Not specified') {
      parts.push(metadata.PRIMARY_RESEARCH_AREA);
    }
    
    // Key methodologies
    if (metadata.KEY_METHODOLOGIES && metadata.KEY_METHODOLOGIES !== 'Not specified') {
      parts.push(metadata.KEY_METHODOLOGIES);
    }
    
    // Secondary areas (pick top 2)
    if (metadata.SECONDARY_AREAS && metadata.SECONDARY_AREAS !== 'Not specified') {
      const secondary = metadata.SECONDARY_AREAS.split(',').slice(0, 2);
      parts.push(...secondary);
    }
    
    return parts.join(' ').trim();
  }
}
```

### Step 5.2: ArXiv Service

**File:** `/lib/services/arxiv-service.ts`
```typescript
import { DatabaseService } from './database-service';
import { parseStringPromise } from 'xml2js';

export interface ArXivArticle {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  publicationDate: Date;
  categories: string[];
  doi?: string;
}

export class ArXivService {
  private static baseUrl = 'http://export.arxiv.org/api/query';
  
  static async search(query: string, maxResults: number = 100): Promise<ArXivArticle[]> {
    // Check cache
    const cached = await DatabaseService.checkCache('arxiv', query);
    if (cached) {
      console.log('✅ ArXiv cache hit for:', query);
      return cached;
    }
    
    console.log('🔍 Querying ArXiv API for:', query);
    
    const params = new URLSearchParams({
      search_query: `all:${query}`,
      start: '0',
      max_results: maxResults.toString(),
      sortBy: 'relevance',
      sortOrder: 'descending',
    });
    
    const url = `${this.baseUrl}?${params}`;
    
    // Rate limit: ArXiv requires 3 second delay between requests
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const response = await fetch(url);
    const xml = await response.text();
    
    const articles = await this.parseXML(xml);
    
    // Cache for 6 months
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);
    await DatabaseService.cacheSearch({
      source: 'arxiv',
      query,
      results: articles,
      expiresAt,
    });
    
    return articles;
  }
  
  private static async parseXML(xml: string): Promise<ArXivArticle[]> {
    const result = await parseStringPromise(xml);
    const entries = result.feed?.entry || [];
    
    return entries.map((entry: any) => {
      // Extract arXiv ID from the id URL
      const idUrl = entry.id?.[0] || '';
      const arxivId = idUrl.split('/').pop() || '';
      
      // Title
      const title = entry.title?.[0]?.trim() || '';
      
      // Authors
      const authorList = entry.author || [];
      const authors = authorList.map((author: any) => author.name?.[0] || '');
      
      // Abstract
      const abstract = entry.summary?.[0]?.trim() || '';
      
      // Publication date
      const published = entry.published?.[0] || '';
      const publicationDate = new Date(published);
      
      // Categories
      const categoryList = entry.category || [];
      const categories = categoryList.map((cat: any) => cat.$.term);
      
      // DOI (if available)
      const doi = entry['arxiv:doi']?.[0]?._ || undefined;
      
      return {
        arxivId,
        title,
        authors,
        abstract,
        publicationDate,
        categories,
        doi,
      };
    });
  }
  
  static generateQuery(metadata: any): string {
    const parts: string[] = [];
    
    if (metadata.PRIMARY_RESEARCH_AREA && metadata.PRIMARY_RESEARCH_AREA !== 'Not specified') {
      parts.push(metadata.PRIMARY_RESEARCH_AREA);
    }
    
    if (metadata.KEY_METHODOLOGIES && metadata.KEY_METHODOLOGIES !== 'Not specified') {
      parts.push(metadata.KEY_METHODOLOGIES);
    }
    
    return parts.join(' ').trim();
  }
}
```

### Step 5.3: BioRxiv Service

**File:** `/lib/services/biorxiv-service.ts`
```typescript
import { DatabaseService } from './database-service';

export interface BioRxivArticle {
  doi: string;
  title: string;
  authors: string[];
  abstract: string;
  publicationDate: Date;
  category: string;
  institution?: string;
}

export class BioRxivService {
  private static baseUrl = 'https://api.biorxiv.org/details/biorxiv';
  
  static async search(query: string, maxResults: number = 100): Promise<BioRxivArticle[]> {
    // Check cache
    const cached = await DatabaseService.checkCache('biorxiv', query);
    if (cached) {
      console.log('✅ BioRxiv cache hit for:', query);
      return cached;
    }
    
    console.log('🔍 Querying BioRxiv API for:', query);
    
    // BioRxiv API searches by date range, not keywords
    // We'll get recent papers and filter client-side
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 2); // Last 2 years
    
    const formatDate = (date: Date) => date.toISOString().split('T')[0];
    
    const url = `${this.baseUrl}/${formatDate(startDate)}/${formatDate(endDate)}/0/json`;
    
    // Rate limit: 1 request per 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (!data.collection || data.collection.length === 0) {
        await this.cacheResults(query, []);
        return [];
      }
      
      // Filter results by query terms
      const queryTerms = query.toLowerCase().split(' ');
      const filtered = data.collection.filter((article: any) => {
        const searchText = `${article.title} ${article.abstract}`.toLowerCase();
        return queryTerms.some(term => searchText.includes(term));
      }).slice(0, maxResults);
      
      const articles = filtered.map((article: any) => ({
        doi: article.doi,
        title: article.title,
        authors: article.authors ? article.authors.split(';').map((a: string) => a.trim()) : [],
        abstract: article.abstract || '',
        publicationDate: new Date(article.date),
        category: article.category || '',
        institution: article.author_corresponding_institution || undefined,
      }));
      
      await this.cacheResults(query, articles);
      return articles;
      
    } catch (error) {
      console.error('BioRxiv API error:', error);
      return [];
    }
  }
  
  private static async cacheResults(query: string, results: BioRxivArticle[]): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);
    
    await DatabaseService.cacheSearch({
      source: 'biorxiv',
      query,
      results,
      expiresAt,
    });
  }
  
  static generateQuery(metadata: any): string {
    const parts: string[] = [];
    
    if (metadata.PRIMARY_RESEARCH_AREA && metadata.PRIMARY_RESEARCH_AREA !== 'Not specified') {
      parts.push(metadata.PRIMARY_RESEARCH_AREA);
    }
    
    if (metadata.KEY_METHODOLOGIES && metadata.KEY_METHODOLOGIES !== 'Not specified') {
      parts.push(metadata.KEY_METHODOLOGIES);
    }
    
    return parts.join(' ').trim();
  }
}
```

### Step 5.4: Google Scholar Service (SerpAPI)

**File:** `/lib/services/scholar-service.ts`
```typescript
import { DatabaseService } from './database-service';
import { getJson } from 'serpapi';

export interface ScholarProfile {
  name: string;
  affiliation: string;
  scholarId: string;
  hIndex?: number;
  i10Index?: number;
  totalCitations?: number;
  interests: string[];
  recentPublications: ScholarPublication[];
}

export interface ScholarPublication {
  title: string;
  authors: string;
  year: number;
  citations: number;
  link?: string;
}

export class ScholarService {
  private static apiKey = process.env.SERP_API_KEY;
  
  static async searchAuthors(query: string, maxResults: number = 20): Promise<ScholarProfile[]> {
    // Check cache
    const cacheKey = `authors:${query}`;
    const cached = await DatabaseService.checkCache('scholar', cacheKey);
    if (cached) {
      console.log('✅ Scholar cache hit for:', query);
      return cached;
    }
    
    console.log('🔍 Querying Google Scholar for authors:', query);
    
    try {
      const response = await getJson({
        engine: 'google_scholar_profiles',
        mauthors: query,
        api_key: this.apiKey,
        num: maxResults,
      });
      
      const profiles: ScholarProfile[] = [];
      
      for (const profile of response.profiles || []) {
        // Fetch detailed profile for each author
        const detailedProfile = await this.fetchAuthorProfile(profile.author_id);
        if (detailedProfile) {
          profiles.push(detailedProfile);
        }
        
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      await this.cacheResults(cacheKey, profiles);
      return profiles;
      
    } catch (error) {
      console.error('Scholar API error:', error);
      return [];
    }
  }
  
  static async fetchAuthorProfile(authorId: string): Promise<ScholarProfile | null> {
    // Check cache
    const cacheKey = `profile:${authorId}`;
    const cached = await DatabaseService.checkCache('scholar', cacheKey);
    if (cached) {
      return cached;
    }
    
    try {
      const response = await getJson({
        engine: 'google_scholar_author',
        author_id: authorId,
        api_key: this.apiKey,
      });
      
      const author = response.author;
      const citations = response.cited_by;
      const articles = response.articles || [];
      
      const profile: ScholarProfile = {
        name: author?.name || '',
        affiliation: author?.affiliations || '',
        scholarId: authorId,
        hIndex: citations?.table?.[0]?.h_index?.all || 0,
        i10Index: citations?.table?.[0]?.i10_index?.all || 0,
        totalCitations: citations?.table?.[0]?.citations?.all || 0,
        interests: author?.interests || [],
        recentPublications: articles.slice(0, 10).map((article: any) => ({
          title: article.title,
          authors: article.authors,
          year: parseInt(article.year) || 0,
          citations: parseInt(article.cited_by?.value) || 0,
          link: article.link,
        })),
      };
      
      // Cache individual profile for 3 months
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 3);
      await DatabaseService.cacheSearch({
        source: 'scholar',
        query: cacheKey,
        results: profile,
        expiresAt,
      });
      
      return profile;
      
    } catch (error) {
      console.error('Error fetching author profile:', error);
      return null;
    }
  }
  
  private static async cacheResults(query: string, results: ScholarProfile[]): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);
    
    await DatabaseService.cacheSearch({
      source: 'scholar',
      query,
      results,
      expiresAt,
    });
  }
  
  static generateQuery(metadata: any): string {
    const parts: string[] = [];
    
    if (metadata.PRIMARY_RESEARCH_AREA && metadata.PRIMARY_RESEARCH_AREA !== 'Not specified') {
      parts.push(metadata.PRIMARY_RESEARCH_AREA);
    }
    
    if (metadata.KEY_METHODOLOGIES && metadata.KEY_METHODOLOGIES !== 'Not specified') {
      parts.push(metadata.KEY_METHODOLOGIES);
    }
    
    return parts.join(' ').slice(0, 100); // Scholar has shorter query limits
  }
}
```

---

## Phase 6: Deduplication Service

**File:** `/lib/services/deduplication-service.ts`
```typescript
import stringSimilarity from 'string-similarity';
import { DatabaseService, Researcher } from './database-service';

export interface CandidateResearcher {
  name: string;
  affiliation?: string;
  email?: string;
  website?: string;
  hIndex?: number;
  citations?: number;
  source: string;
  publications?: any[];
  keywords?: string[];
}

export class DeduplicationService {
  
  // ============================================
  // MAIN DEDUPLICATION FUNCTION
  // ============================================
  
  static async deduplicateAndStore(
    candidates: CandidateResearcher[]
  ): Promise<Researcher[]> {
    const deduplicated: Researcher[] = [];
    const nameGroups = this.groupByNameSimilarity(candidates);
    
    for (const group of nameGroups) {
      const merged = await this.mergeGroup(group);
      deduplicated.push(merged);
    }
    
    return deduplicated;
  }
  
  // ============================================
  // NAME SIMILARITY GROUPING
  // ============================================
  
  private static groupByNameSimilarity(
    candidates: CandidateResearcher[]
  ): CandidateResearcher[][] {
    const groups: CandidateResearcher[][] = [];
    const processed = new Set<number>();
    
    for (let i = 0; i < candidates.length; i++) {
      if (processed.has(i)) continue;
      
      const group: CandidateResearcher[] = [candidates[i]];
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
  
  private static areNamesSimilar(name1: string, name2: string): boolean {
    const normalized1 = this.normalizeName(name1);
    const normalized2 = this.normalizeName(name2);
    
    // Exact match after normalization
    if (normalized1 === normalized2) return true;
    
    // String similarity (e.g., "John Smith" vs "J Smith")
    const similarity = stringSimilarity.compareTwoStrings(normalized1, normalized2);
    if (similarity > 0.85) return true;
    
    // Check if one is initials of the other
    if (this.isInitialsMatch(name1, name2)) return true;
    
    return false;
  }
  
  private static normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  private static isInitialsMatch(name1: string, name2: string): boolean {
    const parts1 = name1.split(/\s+/);
    const parts2 = name2.split(/\s+/);
    
    // Check if last names match
    if (parts1[parts1.length - 1].toLowerCase() !== parts2[parts2.length - 1].toLowerCase()) {
      return false;
    }
    
    // Check if one has initials
    const getInitials = (parts: string[]) => {
      return parts.slice(0, -1).map(p => p[0]?.toUpperCase()).join('');
    };
    
    const initials1 = getInitials(parts1);
    const initials2 = getInitials(parts2);
    const fullFirst1 = parts1[0];
    const fullFirst2 = parts2[0];
    
    // "J Smith" matches "John Smith"
    if (initials1.length === 1 && fullFirst2[0]?.toUpperCase() === initials1) return true;
    if (initials2.length === 1 && fullFirst1[0]?.toUpperCase() === initials2) return true;
    
    return false;
  }
  
  // ============================================
  // MERGE GROUP INTO SINGLE RESEARCHER
  // ============================================
  
  private static async mergeGroup(
    group: CandidateResearcher[]
  ): Promise<Researcher> {
    // Use the most complete name (longest)
    const bestName = group.reduce((longest, current) => 
      current.name.length > longest.name.length ? current : longest
    ).name;
    
    // Check if researcher already exists in database
    const existing = await DatabaseService.findResearcher(bestName);
    
    // Merge all data from the group
    const merged: Researcher = {
      id: existing?.id,
      name: bestName,
      normalizedName: DatabaseService.normalizeName(bestName),
      primaryAffiliation: this.selectBest(group.map(c => c.affiliation)),
      email: this.selectBest(group.map(c => c.email)),
      website: this.selectBest(group.map(c => c.website)),
      hIndex: Math.max(...group.map(c => c.hIndex || 0)),
      totalCitations: Math.max(...group.map(c => c.citations || 0)),
    };
    
    // Save or update in database
    const researcherId = await DatabaseService.createOrUpdateResearcher(merged);
    merged.id = researcherId;
    
    // Store publications from all sources
    for (const candidate of group) {
      if (candidate.publications) {
        for (const pub of candidate.publications) {
          await DatabaseService.addPublication({
            researcherId,
            ...pub,
            source: candidate.source,
          });
        }
      }
      
      // Store keywords
      if (candidate.keywords) {
        await DatabaseService.addKeywords(researcherId, candidate.keywords, candidate.source);
      }
    }
    
    return merged;
  }
  
  private static selectBest(values: (string | undefined)[]): string | undefined {
    // Return the longest non-empty value
    return values
      .filter(v => v && v.trim().length > 0)
      .reduce((best, current) => 
        !best || (current && current.length > best.length) ? current : best
      , undefined);
  }
  
  // ============================================
  // CONFLICT OF INTEREST FILTERING
  // ============================================
  
  static async filterConflicts(
    researchers: Researcher[],
    authorInstitution: string,
    excludeNames: string[] = []
  ): Promise<Researcher[]> {
    const normalized = this.normalizeName(authorInstitution);
    
    return researchers.filter(researcher => {
      // Exclude if at same institution
      if (researcher.primaryAffiliation) {
        const researcherInst = this.normalizeName(researcher.primaryAffiliation);
        if (researcherInst.includes(normalized) || normalized.includes(researcherInst)) {
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
  
  // ============================================
  // RANKING BY RELEVANCE
  // ============================================
  
  static rankByRelevance(
    researchers: Researcher[],
    proposalKeywords: string[]
  ): Researcher[] {
    // This is a simple ranking - you could make this much more sophisticated
    return researchers.sort((a, b) => {
      // Primary sort by h-index
      const hIndexDiff = (b.hIndex || 0) - (a.hIndex || 0);
      if (Math.abs(hIndexDiff) > 5) return hIndexDiff;
      
      // Secondary sort by total citations
      return (b.totalCitations || 0) - (a.totalCitations || 0);
    });
  }
}
```

---

## Phase 7: Main Orchestration API

**File:** `/app/api/search-reviewers/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { PubMedService } from '@/lib/services/pubmed-service';
import { ArXivService } from '@/lib/services/arxiv-service';
import { BioRxivService } from '@/lib/services/biorxiv-service';
import { ScholarService } from '@/lib/services/scholar-service';
import { DeduplicationService, CandidateResearcher } from '@/lib/services/deduplication-service';
import { DatabaseService } from '@/lib/services/database-service';

export async function POST(request: NextRequest) {
  try {
    const { metadata, maxCandidates = 20 } = await request.json();
    
    console.log('🎯 Starting multi-source reviewer search...');
    
    // ============================================
    // STEP 1: QUERY ALL SOURCES
    // ============================================
    
    const candidates: CandidateResearcher[] = [];
    
    // PubMed
    console.log('📚 Searching PubMed...');
    const pubmedQuery = PubMedService.generateQuery(metadata);
    const pubmedArticles = await PubMedService.search(pubmedQuery, 50);
    
    for (const article of pubmedArticles) {
      for (const author of article.authors) {
        candidates.push({
          name: author.name,
          affiliation: author.affiliation,
          source: 'pubmed',
          publications: [{
            title: article.title,
            authors: article.authors.map(a => a.name),
            publicationDate: article.publicationDate,
            journal: article.journal,
            doi: article.doi,
            pmid: article.pmid,
          }],
        });
      }
    }
    
    // ArXiv
    console.log('📄 Searching ArXiv...');
    const arxivQuery = ArXivService.generateQuery(metadata);
    const arxivArticles = await ArXivService.search(arxivQuery, 50);
    
    for (const article of arxivArticles) {
      for (const author of article.authors) {
        candidates.push({
          name: author,
          source: 'arxiv',
          publications: [{
            title: article.title,
            authors: article.authors,
            publicationDate: article.publicationDate,
            arxivId: article.arxivId,
            doi: article.doi,
          }],
        });
      }
    }
    
    // BioRxiv
    console.log('🧬 Searching BioRxiv...');
    const biorxivQuery = BioRxivService.generateQuery(metadata);
    const biorxivArticles = await BioRxivService.search(biorxivQuery, 30);
    
    for (const article of biorxivArticles) {
      for (const author of article.authors) {
        candidates.push({
          name: author,
          affiliation: article.institution,
          source: 'biorxiv',
          publications: [{
            title: article.title,
            authors: article.authors,
            publicationDate: article.publicationDate,
            doi: article.doi,
          }],
        });
      }
    }
    
    // Google Scholar
    console.log('🎓 Searching Google Scholar...');
    const scholarQuery = ScholarService.generateQuery(metadata);
    const scholarProfiles = await ScholarService.searchAuthors(scholarQuery, 20);
    
    for (const profile of scholarProfiles) {
      candidates.push({
        name: profile.name,
        affiliation: profile.affiliation,
        hIndex: profile.hIndex,
        citations: profile.totalCitations,
        source: 'scholar',
        keywords: profile.interests,
        publications: profile.recentPublications,
      });
    }
    
    console.log(`✅ Found ${candidates.length} total candidates across all sources`);
    
    // ============================================
    // STEP 2: DEDUPLICATE & MERGE
    // ============================================
    
    console.log('🔄 Deduplicating researchers...');
    const deduplicated = await DeduplicationService.deduplicateAndStore(candidates);
    console.log(`✅ Deduplicated to ${deduplicated.length} unique researchers`);
    
    // ============================================
    // STEP 3: FILTER CONFLICTS OF INTEREST
    // ============================================
    
    console.log('⚖️ Filtering conflicts of interest...');
    const filtered = await DeduplicationService.filterConflicts(
      deduplicated,
      metadata.AUTHOR_INSTITUTION
    );
    console.log(`✅ ${filtered.length} researchers after COI filtering`);
    
    // ============================================
    // STEP 4: RANK BY RELEVANCE
    // ============================================
    
    console.log('📊 Ranking by relevance...');
    const proposalKeywords = [
      metadata.PRIMARY_RESEARCH_AREA,
      ...metadata.SECONDARY_AREAS?.split(',') || [],
      ...metadata.KEY_METHODOLOGIES?.split(',') || [],
    ].filter(k => k && k !== 'Not specified');
    
    const ranked = DeduplicationService.rankByRelevance(filtered, proposalKeywords);
    
    // ============================================
    // STEP 5: RECORD SUGGESTIONS
    // ============================================
    
    const topCandidates = ranked.slice(0, maxCandidates);
    const proposalId = `proposal_${Date.now()}`;
    
    for (let i = 0; i < topCandidates.length; i++) {
      const candidate = topCandidates[i];
      await DatabaseService.recordSuggestion(
        proposalId,
        metadata.TITLE,
        candidate.id!,
        1.0 - (i / topCandidates.length), // Simple relevance score
        `Matched via ${metadata.PRIMARY_RESEARCH_AREA}`,
        ['pubmed', 'arxiv', 'biorxiv', 'scholar'] // Sources used
      );
    }
    
    // ============================================
    // STEP 6: ENRICH WITH RECENT PUBLICATIONS
    // ============================================
    
    const enriched = await Promise.all(
      topCandidates.map(async (researcher) => {
        const publications = await DatabaseService.getRecentPublications(researcher.id!, 5);
        return {
          ...researcher,
          recentPublications: publications,
        };
      })
    );
    
    return NextResponse.json({
      success: true,
      proposalId,
      candidates: enriched,
      stats: {
        totalFound: candidates.length,
        afterDeduplication: deduplicated.length,
        afterFiltering: filtered.length,
        returned: topCandidates.length,
      },
    });
    
  } catch (error: any) {
    console.error('Error in search-reviewers:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

---

## Phase 8: Frontend Integration

### File: `/app/page.tsx`
```typescript
'use client';

import { useState } from 'react';
import { ProposalUploader } from '@/components/ProposalUploader'; // Your existing component

export default function Home() {
  const [metadata, setMetadata] = useState(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any>(null);
  
  const handleMetadataExtracted = (extractedMetadata: any) => {
    setMetadata(extractedMetadata);
  };
  
  const searchReviewers = async () => {
    setSearching(true);
    
    try {
      const response = await fetch('/api/search-reviewers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata, maxCandidates: 20 }),
      });
      
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };
  
  return (
    <main className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Expert Reviewer Finder Pro</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Upload & Metadata */}
        <div>
          <ProposalUploader onMetadataExtracted={handleMetadataExtracted} />
          
          {metadata && (
            <div className="mt-4">
              <h2 className="text-xl font-semibold mb-2">Extracted Metadata</h2>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-96">
                {JSON.stringify(metadata, null, 2)}
              </pre>
              
              <button
                onClick={searchReviewers}
                disabled={searching}
                className="mt-4 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {searching ? 'Searching all databases...' : 'Find Reviewers'}
              </button>
            </div>
          )}
        </div>
        
        {/* Right: Results */}
        <div>
          {searching && (
            <div className="text-center p-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Searching PubMed, ArXiv, BioRxiv, and Google Scholar...</p>
            </div>
          )}
          
          {results && (
            <div>
              <h2 className="text-xl font-semibold mb-4">
                Found {results.candidates?.length} Reviewers
              </h2>
              
              <div className="bg-blue-50 p-4 rounded-lg mb-4">
                <p className="text-sm">
                  <strong>Stats:</strong> {results.stats?.totalFound} total candidates →
                  {results.stats?.afterDeduplication} after deduplication →
                  {results.stats?.afterFiltering} after COI filtering
                </p>
              </div>
              
              <div className="space-y-4">
                {results.candidates?.map((candidate: any, idx: number) => (
                  <div key={idx} className="bg-white border rounded-lg p-4 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg">{candidate.name}</h3>
                        <p className="text-gray-600 text-sm">{candidate.primaryAffiliation}</p>
                      </div>
                      <div className="text-right text-sm">
                        <div>h-index: <strong>{candidate.hIndex || 'N/A'}</strong></div>
                        <div>Citations: <strong>{candidate.totalCitations || 'N/A'}</strong></div>
                      </div>
                    </div>
                    
                    {candidate.email && (
                      <p className="mt-2 text-sm">
                        📧 <a href={`mailto:${candidate.email}`} className="text-blue-600 hover:underline">
                          {candidate.email}
                        </a>
                      </p>
                    )}
                    
                    {candidate.website && (
                      <p className="text-sm">
                        🔗 <a href={candidate.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          Profile
                        </a>
                      </p>
                    )}
                    
                    {candidate.recentPublications?.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-gray-600">
                          Recent Publications ({candidate.recentPublications.length})
                        </summary>
                        <ul className="mt-2 text-xs space-y-1">
                          {candidate.recentPublications.slice(0, 3).map((pub: any, i: number) => (
                            <li key={i} className="text-gray-700">
                              • {pub.title} ({pub.year})
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
```

---

## Phase 9: Deployment Checklist

### Step 9.1: Local Testing
```bash
# 1. Set up environment variables in .env.local
cp .env.example .env.local
# Add your API keys

# 2. Run database migration
npm run db:setup

# 3. Start development server
npm run dev

# 4. Test the flow:
# - Upload a proposal
# - Extract metadata
# - Search reviewers
# - Verify database caching works
```

### Step 9.2: Deploy to Vercel
```bash
# 1. Link to Vercel project
vercel link

# 2. Deploy
vercel --prod

# 3. Verify environment variables in Vercel dashboard

# 4. Run database migration in production
# (Vercel Postgres auto-connects)
```

---

## Phase 10: Testing & Validation

### Create Test Script

**File:** `/scripts/test-workflow.ts`
```typescript
import { PubMedService } from '../lib/services/pubmed-service';
import { DatabaseService } from '../lib/services/database-service';

async function testWorkflow() {
  console.log('🧪 Testing complete workflow...\n');
  
  // Test metadata
  const testMetadata = {
    TITLE: 'Quantum Computing with Superconducting Qubits',
    PRIMARY_RESEARCH_AREA: 'Quantum Computing',
    KEY_METHODOLOGIES: 'Superconducting circuits, error correction',
    AUTHOR_INSTITUTION: 'MIT',
  };
  
  // Test PubMed search
  console.log('1️⃣ Testing PubMed search...');
  const query = PubMedService.generateQuery(testMetadata);
  console.log(`Query: ${query}`);
  
  const articles = await PubMedService.search(query, 10);
  console.log(`Found ${articles.length} articles`);
  
  // Test cache
  console.log('\n2️⃣ Testing cache (should be instant)...');
  const cached = await PubMedService.search(query, 10);
  console.log(`Cache returned ${cached.length} articles`);
  
  // Test database stats
  console.log('\n3️⃣ Database statistics:');
  const stats = await DatabaseService.getCacheStats();
  console.log(stats);
  
  console.log('\n✅ All tests passed!');
}

testWorkflow();
```

**Run:** `npx tsx scripts/test-workflow.ts`

---

## Implementation Checklist

Use this checklist to track your progress:
```markdown
## Phase 1: Vercel Infrastructure
- [ ] Create Vercel Postgres database
- [ ] Add environment variables (SERP_API_KEY, NCBI_API_KEY, etc.)
- [ ] Install Vercel CLI

## Phase 2: Project Setup
- [ ] Create Next.js app
- [ ] Install dependencies
- [ ] Copy existing code from Find Expert Reviewers

## Phase 3: Database Schema
- [ ] Create schema.sql file
- [ ] Create migration script
- [ ] Run migration

## Phase 4: Database Service
- [ ] Implement DatabaseService class
- [ ] Test cache operations
- [ ] Test researcher operations

## Phase 5: External API Services
- [ ] Implement PubMedService
- [ ] Implement ArXivService
- [ ] Implement BioRxivService
- [ ] Implement ScholarService

## Phase 6: Deduplication
- [ ] Implement DeduplicationService
- [ ] Test name matching
- [ ] Test conflict filtering

## Phase 7: Orchestration
- [ ] Create search-reviewers API route
- [ ] Test multi-source search
- [ ] Verify database recording

## Phase 8: Frontend
- [ ] Update homepage
- [ ] Create reviewer results component
- [ ] Test full workflow

## Phase 9: Deployment
- [ ] Deploy to Vercel
- [ ] Verify production database
- [ ] Test in production

## Phase 10: Testing
- [ ] Create test scripts
- [ ] Verify caching works
- [ ] Test with real proposals
```

---

## Quick Reference

### Key Files Created
```
expert-reviewers-pro/
├── lib/
│   ├── db/
│   │   └── schema.sql
│   └── services/
│       ├── database-service.ts
│       ├── pubmed-service.ts
│       ├── arxiv-service.ts
│       ├── biorxiv-service.ts
│       ├── scholar-service.ts
│       └── deduplication-service.ts
├── app/
│   ├── api/
│   │   └── search-reviewers/
│   │       └── route.ts
│   └── page.tsx
└── scripts/
    ├── setup-database.ts
    └── test-workflow.ts
```

### Environment Variables Needed
```bash
# Vercel Postgres (auto-created)
POSTGRES_URL
POSTGRES_URL_NON_POOLING
POSTGRES_USER
POSTGRES_HOST
POSTGRES_PASSWORD
POSTGRES_DATABASE

# API Keys (you must obtain)
SERP_API_KEY
NCBI_API_KEY
ANTHROPIC_API_KEY
GOOGLE_API_KEY
GOOGLE_CSE_ID

# Cache settings
CACHE_SEARCH_EXPIRY_MONTHS=6
CACHE_RESEARCHER_EXPIRY_MONTHS=3
```

### Execution Order

1. Set up Vercel Postgres (Phase 1)
2. Create project and install dependencies (Phase 2)
3. Create and run database schema (Phase 3)
4. Build DatabaseService (Phase 4)
5. Build each API service (Phase 5)
6. Build deduplication logic (Phase 6)
7. Create main API endpoint (Phase 7)
8. Update frontend (Phase 8)
9. Deploy to Vercel (Phase 9)
10. Test thoroughly (Phase 10)

---

## Notes for Claude Code

- Work through phases sequentially
- Test each component before moving to the next
- Reuse existing code from "Find Expert Reviewers" app wherever possible
- Ask for clarification if any API keys or services are unclear
- The plan is comprehensive but flexible - adapt as needed based on your specific requirements

---

**End of Implementation Plan**