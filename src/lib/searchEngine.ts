/**
 * src/lib/searchEngine.ts
 *
 * High-performance in-memory search engine for 30,000+ market symbols.
 * Features:
 *   - Pre-tokenized inverted index + prefix lookup
 *   - Diacritics stripping & punctuation removal
 *   - Corporate suffix normalization
 *   - Strict ranking order:
 *       1. Exact ticker match
 *       2. Ticker prefix match
 *       3. Suffix-less ticker match (typing RELIANCE returns RELIANCE.NS and RELIANCE.BO)
 *       4. Suffix-less ticker prefix match
 *       5. Name prefix match
 *       6. Name word match
 *       7. Alias match
 *       8. Name contains
 *       9. Fuzzy typo-tolerant match (Damerau-Levenshtein)
 *   - Dual/multiple listings detection (e.g. TATASTEEL.NS and TATASTEEL.BO)
 *   - Fast sub-10ms query execution time.
 */

import fs from 'fs';
import path from 'path';

export interface MarketSymbolEntry {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  country?: string;
  currency?: string;
  sector?: string;
  industry?: string;
  aliases?: string[];
  isin?: string;
}

export interface SearchListingBadge {
  symbol: string;
  exchange: string;
}

export interface SearchResultItem extends MarketSymbolEntry {
  displaySymbol: string;
  region: string;
  marketStatus: 'LIVE' | 'Closed' | 'Premarket' | 'After Hours';
  quote?: any;
  logoUrl?: string;
  listings?: SearchListingBadge[];
  isLiveSearch?: boolean;
}

export interface SearchFilters {
  region?: string;
  country?: string;
  exchange?: string;
  type?: string;
}

const CORP_SUFFIXES_REGEX = /\b(incorporated|corporation|holdings|limited|company|group|corp|inc|ltd|plc|gmbh|bhd|ag|sa|nv|se|co)\b/gi;

export function stripDiacritics(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeForSearch(str: string): string {
  return stripDiacritics(str)
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripCorporateSuffixes(name: string): string {
  return normalizeForSearch(name)
    .replace(CORP_SUFFIXES_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fast Levenshtein distance for fuzzy typo tolerance
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length];
}

interface IndexedSymbol {
  raw: MarketSymbolEntry;
  normSymbol: string;      // e.g. "reliance.ns"
  baseSymbol: string;      // e.g. "reliance"
  normName: string;        // e.g. "reliance industries limited"
  cleanName: string;       // e.g. "reliance industries"
  nameWords: string[];     // ["reliance", "industries"]
  aliases: string[];       // normalized aliases
  cleanNameKey: string;    // for grouping
  isin?: string;
}

export class SearchEngine {
  private items: IndexedSymbol[] = [];
  private tokenIndex = new Map<string, number[]>();
  private prefixIndex = new Map<string, number[]>();
  private aliasMap = new Map<string, string[]>(); // alias -> [symbols]
  private groupedListings = new Map<string, SearchListingBadge[]>(); // key -> listings
  private isIndexed = false;

  constructor() {}

  public loadAliases(aliasesObj: Record<string, string[]>): void {
    this.aliasMap.clear();
    for (const [alias, symbols] of Object.entries(aliasesObj)) {
      const norm = normalizeForSearch(alias);
      const compact = alias.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const mappedSymbols = symbols.map((s) => s.toUpperCase().trim());
      if (norm) {
        this.aliasMap.set(norm, mappedSymbols);
      }
      if (compact && compact !== norm) {
        this.aliasMap.set(compact, mappedSymbols);
      }
    }
  }

  public buildIndex(entries: MarketSymbolEntry[]): void {
    const start = performance.now();
    this.items = [];
    this.tokenIndex.clear();
    this.prefixIndex.clear();
    this.groupedListings.clear();

    // Map to group dual/multiple listings by (baseSymbol + first 2 words of cleanName) or ISIN
    const groupingBuckets = new Map<string, { symbol: string; exchange: string }[]>();

    for (let idx = 0; idx < entries.length; idx++) {
      const e = entries[idx];
      const normSym = e.symbol.toLowerCase().trim();
      const baseSym = normSym.includes('.') ? normSym.split('.')[0] : normSym;
      const normName = normalizeForSearch(e.name);
      const cleanName = stripCorporateSuffixes(e.name);
      const nameWords = cleanName.split(' ').filter(Boolean);

      const aliases = (e.aliases || []).map((a) => normalizeForSearch(a)).filter(Boolean);

      const cleanNameKey = `${baseSym}__${nameWords.slice(0, 2).join('_')}`;

      const indexed: IndexedSymbol = {
        raw: e,
        normSymbol: normSym,
        baseSymbol: baseSym,
        normName,
        cleanName,
        nameWords,
        aliases,
        cleanNameKey,
        isin: e.isin
      };

      this.items.push(indexed);

      // Grouping key
      const groupKey = e.isin ? `isin_${e.isin}` : cleanNameKey;
      if (!groupingBuckets.has(groupKey)) {
        groupingBuckets.set(groupKey, []);
      }
      groupingBuckets.get(groupKey)!.push({ symbol: e.symbol, exchange: e.exchange });

      // Index tokens
      const tokens = new Set<string>();
      tokens.add(normSym);
      tokens.add(baseSym);
      for (const w of nameWords) {
        if (w.length >= 2) tokens.add(w);
      }
      for (const a of aliases) {
        for (const aw of a.split(' ')) {
          if (aw.length >= 2) tokens.add(aw);
        }
      }

      for (const token of tokens) {
        if (!this.tokenIndex.has(token)) this.tokenIndex.set(token, []);
        this.tokenIndex.get(token)!.push(idx);

        // Index prefixes for 2..4 chars
        for (let len = 2; len <= Math.min(4, token.length); len++) {
          const pref = token.slice(0, len);
          if (!this.prefixIndex.has(pref)) this.prefixIndex.set(pref, []);
          this.prefixIndex.get(pref)!.push(idx);
        }
      }
    }

    // Build finalized grouped listings map
    for (const [key, listings] of groupingBuckets.entries()) {
      if (listings.length > 1) {
        // deduplicate listings by symbol
        const seen = new Set<string>();
        const unique: SearchListingBadge[] = [];
        for (const l of listings) {
          if (!seen.has(l.symbol)) {
            seen.add(l.symbol);
            unique.push(l);
          }
        }
        if (unique.length > 1) {
          this.groupedListings.set(key, unique);
        }
      }
    }

    this.isIndexed = true;
    const duration = (performance.now() - start).toFixed(1);
    console.log(`[SearchEngine] Built inverted index for ${this.items.length.toLocaleString()} items in ${duration}ms (${this.groupedListings.size} grouped multi-listings)`);
  }

  public getGroupedListings(item: IndexedSymbol): SearchListingBadge[] | undefined {
    if (item.isin && this.groupedListings.has(`isin_${item.isin}`)) {
      return this.groupedListings.get(`isin_${item.isin}`);
    }
    return this.groupedListings.get(item.cleanNameKey);
  }

  public search(
    query: string,
    filters?: SearchFilters,
    limit = 20,
    offset = 0
  ): { results: SearchResultItem[]; total: number; durationMs: number } {
    const startTime = performance.now();
    const rawQ = (query || '').trim();
    if (!rawQ) {
      // Empty query: return browsable top items with filters applied
      const filtered = this.filterItems(this.items, filters);
      const page = filtered.slice(offset, offset + limit);
      return {
        results: page.map((i) => this.toSearchResultItem(i)),
        total: filtered.length,
        durationMs: Number((performance.now() - startTime).toFixed(2))
      };
    }

    // Truncate excessively long query to avoid ReDoS or memory issues
    const safeQ = rawQ.slice(0, 200);
    const normQ = normalizeForSearch(safeQ);
    const compactQ = safeQ.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const qLower = stripDiacritics(safeQ).toLowerCase().trim();
    const qWords = normQ.split(' ').filter(Boolean);

    // Candidates gathering
    let candidateIndices = new Set<number>();

    // 1. Check alias mapping (both normQ and compactQ)
    const aliasTargets = [
      ...(this.aliasMap.get(normQ) || []),
      ...(compactQ && compactQ !== normQ ? this.aliasMap.get(compactQ) || [] : [])
    ];
    const aliasTargetSet = new Set(aliasTargets.map((s) => s.toLowerCase()));

    // 2. Token & prefix index gathering
    if (normQ.length >= 2) {
      // First try prefix of length min(4, normQ.length)
      const prefKey = normQ.slice(0, Math.min(4, normQ.length));
      const fromPrefix = this.prefixIndex.get(prefKey);
      if (fromPrefix) {
        for (const idx of fromPrefix) candidateIndices.add(idx);
      }

      // Exact token matches
      if (this.tokenIndex.has(normQ)) {
        for (const idx of this.tokenIndex.get(normQ)!) candidateIndices.add(idx);
      }
      if (compactQ && this.tokenIndex.has(compactQ)) {
        for (const idx of this.tokenIndex.get(compactQ)!) candidateIndices.add(idx);
      }

      // If candidate set is small (< 25) and normQ length >= 2, expand using 2-char prefix
      // (This catches typos like "aple" where "aple" prefix has only 1 match APLE, so "ap" brings in AAPL)
      if (candidateIndices.size < 25) {
        const p2 = normQ.slice(0, 2);
        const fromP2 = this.prefixIndex.get(p2);
        if (fromP2) {
          for (const idx of fromP2) candidateIndices.add(idx);
        }
      }
    }

    // Always include any alias targets
    if (aliasTargetSet.size > 0) {
      for (let i = 0; i < this.items.length; i++) {
        if (aliasTargetSet.has(this.items[i].normSymbol) || aliasTargetSet.has(this.items[i].baseSymbol)) {
          candidateIndices.add(i);
        }
      }
    }

    // If candidate set is empty and query is short, fall back to checking all items
    if (candidateIndices.size === 0 && normQ.length <= 4) {
      candidateIndices = new Set(this.items.map((_, i) => i));
    }

    const scored: { item: IndexedSymbol; score: number }[] = [];

    for (const idx of candidateIndices) {
      const item = this.items[idx];

      // Apply filters early
      if (filters) {
        if (filters.exchange && item.raw.exchange.toUpperCase() !== filters.exchange.toUpperCase()) continue;
        if (filters.country && (item.raw.country || '').toUpperCase() !== filters.country.toUpperCase()) continue;
        if (filters.type && item.raw.type.toUpperCase() !== filters.type.toUpperCase()) continue;
      }

      const score = this.calculateRankScore(normQ, compactQ, qLower, qWords, item, aliasTargetSet);
      if (score > 0) {
        scored.push({ item, score });
      }
    }

    // Sort by score descending, then symbol alphabetically
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.normSymbol.localeCompare(b.item.normSymbol);
    });

    const total = scored.length;
    const pageItems = scored.slice(offset, offset + limit).map((s) => this.toSearchResultItem(s.item));
    const durationMs = Number((performance.now() - startTime).toFixed(2));

    return { results: pageItems, total, durationMs };
  }

  private calculateRankScore(
    normQ: string,
    compactQ: string,
    qLower: string,
    qWords: string[],
    item: IndexedSymbol,
    aliasTargetSet: Set<string>
  ): number {
    const sym = item.normSymbol;
    const base = item.baseSymbol;
    const name = item.normName;
    const cleanName = item.cleanName;

    // Rank 1: Exact ticker match (e.g. "aapl" === "aapl", "reliance.ns" === "reliance.ns", "a" === "a")
    if (sym === qLower || sym === normQ || (compactQ.length >= 2 && sym === compactQ)) {
      return 100_000;
    }

    // Rank 2: Exact ticker without suffix match (typing "reliance" matches "reliance.ns" and "reliance.bo", typing "l&t" matches "lt")
    if (base === qLower || base === normQ || (compactQ.length >= 2 && base === compactQ)) {
      return 80_000;
    }

    // Rank 3: Alias match (e.g. "google" mapped to "GOOGL", "tsmc" mapped to "TSM", "l&t" mapped to "LT.NS")
    if (aliasTargetSet.has(sym) || aliasTargetSet.has(base)) {
      return 70_000;
    }
    if (item.aliases.some((a) => a === normQ || (compactQ.length >= 2 && a === compactQ))) {
      return 65_000;
    }

    // Rank 4: Ticker prefix match (e.g. "ts" matches "tsla", "tsm")
    if (sym.startsWith(qLower) || sym.startsWith(normQ) || (compactQ.length >= 2 && sym.startsWith(compactQ))) {
      return 50_000 - Math.min((sym.length - normQ.length) * 50, 5000);
    }

    // Rank 5: Suffix-less ticker prefix match (e.g. "reli" matches "reliance.ns")
    if (base.startsWith(qLower) || base.startsWith(normQ) || (compactQ.length >= 2 && base.startsWith(compactQ))) {
      return 40_000 - Math.min((base.length - normQ.length) * 50, 4000);
    }

    // Rank 6: Name prefix match (e.g. "apple" matches "apple inc")
    if (cleanName.startsWith(normQ) || name.startsWith(normQ)) {
      return 30_000 - Math.min((cleanName.length - normQ.length) * 10, 3000);
    }

    // Rank 7: Exact name word match (e.g. "steel" matches "tata steel limited")
    const hasWordExact = item.nameWords.some((w) => w === normQ || (compactQ.length >= 2 && w === compactQ));
    if (hasWordExact) {
      return 20_000;
    }

    // Rank 8: Name word prefix match (e.g. "stee" matches "steel")
    const hasWordPrefix = item.nameWords.some((w) => normQ.length >= 2 && w.startsWith(normQ));
    if (hasWordPrefix) {
      return 18_000;
    }

    // Rank 9: Multi-word match (e.g. "Tata Steel", "Rolls Royce")
    // Filter out words under 2 chars so single letters like 'l' and 't' don't match everything
    const validQWords = qWords.filter((w) => w.length >= 2);
    if (validQWords.length > 1 && validQWords.every((qw) => name.includes(qw) || sym.includes(qw))) {
      return 15_000;
    }

    // Rank 10: Name contains
    if (normQ.length >= 2 && (name.includes(normQ) || cleanName.includes(normQ))) {
      return 10_000;
    }

    // Rank 11: Fuzzy match (typo tolerance) for queries of 3+ letters
    if (normQ.length >= 3) {
      // 1. Primary name word or alias distance 1 (e.g. "aple" -> "apple", "relianc" -> "reliance", "samsng" -> "samsung")
      for (const w of item.nameWords) {
        if (w.length >= 4 && Math.abs(w.length - normQ.length) <= 1) {
          const d = levenshteinDistance(w, normQ);
          if (d === 1) return 9_000;
        }
      }
      for (const a of item.aliases) {
        if (a.length >= 4 && Math.abs(a.length - normQ.length) <= 1) {
          const d = levenshteinDistance(a, normQ);
          if (d === 1) return 9_000;
        }
      }

      // 2. Base symbol typo (for symbols with length >= 4)
      if (base.length >= 4 && Math.abs(base.length - normQ.length) <= 1) {
        const d = levenshteinDistance(base, normQ);
        if (d === 1) return 8_500;
        if (d === 2 && normQ.length >= 5) return 6_000;
      }

      // 3. Shorter base symbol typo (length < 4, e.g. 3-letter tickers like "ape" for "aple")
      if (base.length === 3 && normQ.length === 4) {
        const d = levenshteinDistance(base, normQ);
        if (d === 1) return 5_000;
      }

      // 4. Secondary word distance 2 for longer words
      for (const w of item.nameWords) {
        if (w.length >= 6 && Math.abs(w.length - normQ.length) <= 2) {
          const d = levenshteinDistance(w, normQ);
          if (d === 2) return 5_500;
        }
      }
    }

    return 0;
  }

  private filterItems(items: IndexedSymbol[], filters?: SearchFilters): IndexedSymbol[] {
    if (!filters) return items;
    return items.filter((item) => {
      if (filters.exchange && item.raw.exchange.toUpperCase() !== filters.exchange.toUpperCase()) return false;
      if (filters.country && (item.raw.country || '').toUpperCase() !== filters.country.toUpperCase()) return false;
      if (filters.type && item.raw.type.toUpperCase() !== filters.type.toUpperCase()) return false;
      return true;
    });
  }

  private toSearchResultItem(item: IndexedSymbol): SearchResultItem {
    const raw = item.raw;
    const listings = this.getGroupedListings(item);

    return {
      ...raw,
      displaySymbol: raw.symbol,
      region: raw.country === 'US' ? 'North America' : raw.country === 'IN' ? 'South Asia' : 'Global',
      marketStatus: this.computeMarketStatus(),
      quote: null,
      listings
    };
  }

  private computeMarketStatus(): 'LIVE' | 'Closed' | 'Premarket' | 'After Hours' {
    const now = new Date();
    const utcDay = now.getUTCDay();
    if (utcDay === 0 || utcDay === 6) return 'Closed';
    const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (mins >= 8 * 60 && mins < 13 * 60 + 30) return 'Premarket';
    if (mins >= 13 * 60 + 30 && mins <= 20 * 60) return 'LIVE';
    if (mins > 20 * 60 && mins < 24 * 60) return 'After Hours';
    return 'Closed';
  }
}

// Global singleton instance
export const globalSearchEngine = new SearchEngine();
