/**
 * searchService.ts
 *
 * Upgraded market symbol search service powered by high-performance SearchEngine.
 * Covers 25,000+ sharded symbols across 40+ global exchanges.
 * Features:
 *   - Fast in-memory token & prefix inverted indexing (sub-10ms)
 *   - Accurate ranking: exact ticker > ticker prefix > suffix-less ticker > name prefix > name word > alias > contains > fuzzy
 *   - Live search fallback with 4s timeout, rate limiting & 24h caching
 *   - Dynamic symbol discovery and custom symbol registration with quote verification
 *   - Multi-listing grouping (e.g. TATASTEEL.NS & TATASTEEL.BO grouped with badges)
 */

import fs from 'fs';
import path from 'path';
import { fetchQuotesBatch, getWatchlist, getStoredPortfolioHoldings } from './marketDataService.js';
import { fetchYahooSearch, fetchYahooQuote, normalizeExchangeCode, type YahooSearchMatch } from './yahooFinance.js';
import { resolveCountryEntry } from './countryUniverse.js';
import type { CachedQuote } from './quoteCache.js';
import { loadAllSymbols, type MarketSymbolEntry } from './data/symbols/loader.js';
import { globalSearchEngine, type SearchResultItem, type SearchFilters, type SearchListingBadge } from './src/lib/searchEngine.js';

export type { SearchResultItem, SearchFilters, SearchListingBadge };

const SEARCH_CACHE_TTL = 30_000;
const LOOKUP_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const DISCOVERED_PATH = path.join(process.cwd(), 'data', 'symbols-discovered.json');
const ALIASES_PATH = path.join(process.cwd(), 'data', 'symbol-aliases.json');

const searchCache = new Map<string, { data: SearchResultItem[]; total: number; timestamp: number }>();
const liveLookupCache = new Map<string, { data: SearchResultItem[]; timestamp: number }>();
const logoCache = new Map<string, string | null>();

// Rate limiter: IP/Key -> timestamps[]
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_MAX = 30; // max 30 lookups per minute
const RATE_LIMIT_WINDOW = 60_000; // 1 minute

let universeLoadedAt = 0;
let isInitializing = false;

function isRateLimited(clientKey = 'default'): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  const history = (rateLimitMap.get(clientKey) || []).filter((t) => t > windowStart);
  if (history.length >= RATE_LIMIT_MAX) {
    return true;
  }
  history.push(now);
  rateLimitMap.set(clientKey, history);
  return false;
}

export function loadDiscoveredSymbols(): MarketSymbolEntry[] {
  try {
    if (fs.existsSync(DISCOVERED_PATH)) {
      const data = JSON.parse(fs.readFileSync(DISCOVERED_PATH, 'utf-8'));
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.error('[Search] Failed to load discovered symbols:', err);
  }
  return [];
}

export function saveDiscoveredSymbol(entry: MarketSymbolEntry): void {
  try {
    const list = loadDiscoveredSymbols();
    const upperSym = entry.symbol.toUpperCase().trim();
    if (!list.some((item) => item.symbol.toUpperCase().trim() === upperSym)) {
      list.push(entry);
      fs.writeFileSync(DISCOVERED_PATH, JSON.stringify(list, null, 2), 'utf-8');
      console.log(`[Search] Persisted newly discovered symbol: ${upperSym}`);
    }
  } catch (err) {
    console.error('[Search] Failed to save discovered symbol:', err);
  }
}

export async function ensureSearchEngineInitialized(): Promise<void> {
  if (universeLoadedAt > 0) return;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise((r) => setTimeout(r, 50));
    }
    return;
  }

  isInitializing = true;
  try {
    // 1. Load sharded symbol universe
    const all = loadAllSymbols();

    // 2. Load aliases
    if (fs.existsSync(ALIASES_PATH)) {
      try {
        const aliases = JSON.parse(fs.readFileSync(ALIASES_PATH, 'utf-8'));
        globalSearchEngine.loadAliases(aliases);
      } catch (e: any) {
        console.warn('[Search] Could not load aliases:', e.message);
      }
    }

    // 3. Build inverted search index
    globalSearchEngine.buildIndex(all);
    universeLoadedAt = Date.now();
  } catch (err: any) {
    console.error('[Search] Failed to initialize SearchEngine:', err);
  } finally {
    isInitializing = false;
  }
}

async function fetchLogo(symbol: string): Promise<string | undefined> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return undefined;
  const base = symbol.toUpperCase().split('.')[0];
  if (logoCache.has(base)) {
    return logoCache.get(base) || undefined;
  }
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(base)}&token=${key}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const data: any = await res.json();
      const logo = data?.logo || null;
      logoCache.set(base, logo);
      if (logo) return logo;
      if (data?.weburl) {
        try {
          const domain = new URL(
            data.weburl.startsWith('http') ? data.weburl : `https://${data.weburl}`
          ).hostname;
          return `https://logo.clearbit.com/${domain}`;
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  logoCache.set(base, null);
  return undefined;
}

async function enrichPage(pageItems: SearchResultItem[]): Promise<SearchResultItem[]> {
  if (pageItems.length === 0) return [];
  const symbols = pageItems.map((i) => i.displaySymbol.toUpperCase());
  const quotes = await fetchQuotesBatch([...new Set(symbols)]);

  return Promise.all(
    pageItems.map(async (item) => {
      const full = item.displaySymbol.toUpperCase();
      const base = full.split('.')[0];
      const logoUrl = await fetchLogo(base);
      return {
        ...item,
        logoUrl,
        quote: quotes[full] || quotes[base] || quotes[item.symbol.toUpperCase()] || null
      };
    })
  );
}

/**
 * Fast local search using in-memory SearchEngine
 */
export async function searchMarketSymbols(
  query: string,
  page = 1,
  limit = 20,
  filters?: SearchFilters
): Promise<{ results: SearchResultItem[]; total: number; page: number; hasMore: boolean; durationMs?: number; error?: string }> {
  await ensureSearchEngineInitialized();
  const q = (query || '').trim();

  const cacheKey = `${q.toLowerCase()}_${JSON.stringify(filters || {})}`;
  let searchResult: { results: SearchResultItem[]; total: number; durationMs: number };

  if (q.length > 0 && searchCache.has(cacheKey) && Date.now() - searchCache.get(cacheKey)!.timestamp < SEARCH_CACHE_TTL) {
    const cached = searchCache.get(cacheKey)!;
    const start = (page - 1) * limit;
    const pageItems = cached.data.slice(start, start + limit);
    const enriched = await enrichPage(pageItems);
    return {
      results: enriched,
      total: cached.total,
      page,
      hasMore: start + limit < cached.total
    };
  }

  const offset = (page - 1) * limit;
  searchResult = globalSearchEngine.search(q, filters, limit, offset);

  // If page 1, cache first 60 results
  if (q.length > 0 && page === 1) {
    const fullSearch = globalSearchEngine.search(q, filters, 60, 0);
    searchCache.set(cacheKey, {
      data: fullSearch.results,
      total: fullSearch.total,
      timestamp: Date.now()
    });
  }

  const enriched = await enrichPage(searchResult.results);

  return {
    results: enriched,
    total: searchResult.total,
    page,
    hasMore: offset + limit < searchResult.total,
    durationMs: searchResult.durationMs
  };
}

export async function browseMarketSymbols(
  page = 1,
  limit = 20,
  filters?: SearchFilters
): Promise<{ results: SearchResultItem[]; total: number; page: number; hasMore: boolean; error?: string }> {
  return searchMarketSymbols('', page, limit, filters);
}

/**
 * Section 4: Live fallback lookup via Yahoo Finance & Finnhub
 *   - Timeout 4 seconds
 *   - Rate limited
 *   - Cached for 24 hours
 *   - Failures never break local results
 *   - Merges & dedupes with local results
 *   - Validates quote before persisting
 */
export async function lookupMarketSymbolLive(
  query: string,
  clientIp = 'default'
): Promise<{ results: SearchResultItem[]; fromLiveCount: number; isRateLimited?: boolean }> {
  await ensureSearchEngineInitialized();
  const q = (query || '').trim();
  if (!q) return { results: [], fromLiveCount: 0 };

  // 1. Run local search first
  const local = globalSearchEngine.search(q, undefined, 10, 0);
  const seenSymbols = new Set(local.results.map((r) => r.symbol.toUpperCase()));

  // Check 24h lookup cache
  const cacheKey = q.toLowerCase();
  const cachedLookup = liveLookupCache.get(cacheKey);
  if (cachedLookup && Date.now() - cachedLookup.timestamp < LOOKUP_CACHE_TTL) {
    const merged = [...local.results];
    let added = 0;
    for (const item of cachedLookup.data) {
      if (!seenSymbols.has(item.symbol.toUpperCase())) {
        seenSymbols.add(item.symbol.toUpperCase());
        merged.push(item);
        added++;
      }
    }
    const enriched = await enrichPage(merged);
    return { results: enriched, fromLiveCount: added };
  }

  // Rate limit check
  if (isRateLimited(clientIp)) {
    console.warn(`[Search Lookup] Rate limit reached for client: ${clientIp}`);
    const enriched = await enrichPage(local.results);
    return { results: enriched, fromLiveCount: 0, isRateLimited: true };
  }

  // Live fetch with 4s timeout
  const liveResults: SearchResultItem[] = [];
  try {
    const rawMatches = await fetchYahooSearch(q);

    for (const m of rawMatches) {
      const sym = m.symbol.toUpperCase().trim();
      const resolved = resolveCountryEntry(undefined, sym, m.exchange);

      const liveItem: SearchResultItem = {
        symbol: sym,
        displaySymbol: sym,
        name: m.name,
        exchange: m.exchange || normalizeExchangeCode('', '', sym),
        type: m.type || 'Common Stock',
        country: resolved.name,
        region: resolved.region,
        sector: m.sector || m.industry || 'Diversified',
        industry: m.industry,
        marketStatus: 'LIVE',
        isLiveSearch: true,
        quote: null
      };

      liveResults.push(liveItem);

      // Asynchronously validate with real quote and save discovered symbol
      validateAndSaveLiveSymbol(sym, liveItem).catch(() => {});
    }

    liveLookupCache.set(cacheKey, { data: liveResults, timestamp: Date.now() });
  } catch (err: any) {
    console.warn(`[Search Lookup] Live lookup timed out or failed: ${err.message}`);
    // Failures must never break local results
  }

  // Merge & dedupe
  const merged: SearchResultItem[] = [...local.results];
  let fromLiveCount = 0;

  for (const item of liveResults) {
    if (!seenSymbols.has(item.symbol.toUpperCase())) {
      seenSymbols.add(item.symbol.toUpperCase());
      merged.push(item);
      fromLiveCount++;
    }
  }

  const enriched = await enrichPage(merged);
  return { results: enriched, fromLiveCount };
}

/**
 * Validates a live symbol with a real quote before saving to runtime store
 */
async function validateAndSaveLiveSymbol(symbol: string, item: SearchResultItem): Promise<boolean> {
  try {
    const quote = await fetchYahooQuote(symbol);
    if (quote && quote.price > 0) {
      const entry: MarketSymbolEntry = {
        symbol: item.symbol,
        name: item.name,
        exchange: item.exchange,
        type: item.type,
        country: item.country,
        currency: item.currency,
        sector: item.sector,
        industry: item.industry
      };
      saveDiscoveredSymbol(entry);

      // Re-index into memory search engine immediately
      const all = loadAllSymbols(true);
      globalSearchEngine.buildIndex(all);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Adds and validates a custom user-submitted symbol
 */
export async function addCustomSymbol(input: {
  symbol: string;
  name: string;
  exchange: string;
  currency?: string;
  country?: string;
  type?: string;
  sector?: string;
}): Promise<{ ok: boolean; symbol?: MarketSymbolEntry; error?: string }> {
  const sym = input.symbol.toUpperCase().trim();
  if (!sym || !input.name.trim() || !input.exchange.trim()) {
    return { ok: false, error: 'Symbol, Company Name, and Exchange are required.' };
  }

  // Validate with a real quote fetch
  const quote = await fetchYahooQuote(sym);
  if (!quote || quote.price <= 0) {
    return {
      ok: false,
      error: `Could not verify ticker "${sym}" with a live market quote. Please check the ticker symbol and exchange suffix (e.g. .NS for NSE, .BO for BSE, .L for LSE, .T for Tokyo).`
    };
  }

  const newEntry: MarketSymbolEntry = {
    symbol: sym,
    name: input.name.trim(),
    exchange: normalizeExchangeCode(input.exchange, '', sym),
    type: input.type || 'Common Stock',
    country: input.country || 'Global',
    currency: input.currency || 'USD',
    sector: input.sector || 'Diversified'
  };

  saveDiscoveredSymbol(newEntry);

  // Reload and reindex
  const all = loadAllSymbols(true);
  globalSearchEngine.buildIndex(all);

  return { ok: true, symbol: newEntry };
}

export async function refreshSearchQuotes(symbols: string[]): Promise<Record<string, CachedQuote>> {
  const clean = [...new Set(symbols.map((s) => s.toUpperCase().trim()))];
  return fetchQuotesBatch(clean);
}

export function initSearchUniverse(): void {
  ensureSearchEngineInitialized().catch((err) => {
    console.error('[Search] Failed to init search engine:', err);
  });
}
