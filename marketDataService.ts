import fs from 'fs';
import path from 'path';
import { getCachedQuote, setCachedQuote, CachedQuote } from './quoteCache.js';
import { getImpactState, refreshImpactData } from './impactService.js';
import { fetchHeadlines } from './newsApi.js';
import { getCountryHistory } from './dashboardTrendService.js';
import { fetchYahooQuote, fetchYahooCompanyMeta, normalizeExchangeCode } from './yahooFinance.js';
import {
  getAllCountriesUniverse,
  resolveCountryEntry,
  matchesCountryKeyword,
  CountryBaseEntry
} from './countryUniverse.js';

export interface WatchlistEntry {
  ticker: string;
  companyName: string;
  sector: string;
  exchange: string;
  country: string;
  region: string;
}

export type RecommendedAction = 'Safe' | 'Monitor' | 'Review' | 'Hedge' | 'Reduce';

export interface CompanyProfileResponse {
  ticker: string;
  name: string;
  sector: string;
  country: string;
  region: string;
  exchange: string;
  marketCap: string;
  description: string;
  riskScore: number;
  sentimentScore: number;
  sentimentLabel: string;
  keyRisks: string[];
  aiSummary: string;
  riskTrend: { date: string; score: number }[];
  quote: CachedQuote | null;
  activeImpactCount: number;
  inWatchlist: boolean;
  action: RecommendedAction;
  countryIso?: string;
  countryFlag?: string;
}

const SECTOR_BASE_RISK: Record<string, number> = {
  Semiconductors: 78,
  Technology: 48,
  Energy: 72,
  Defense: 58,
  Aerospace: 54,
  Financials: 52,
  'Financial Services': 52,
  Logistics: 65,
  Automotive: 58,
  Mining: 62,
  'Basic Materials': 60,
  Healthcare: 40,
  Industrials: 50,
  'Consumer Defensive': 36,
  'Consumer Cyclical': 46,
  Utilities: 38,
  'Real Estate': 45,
  Communication: 42,
  Diversified: 50
};

const HIGH_EXPOSURE_COUNTRIES = new Set([
  'Taiwan', 'China', 'Israel', 'Ukraine', 'Iran', 'Russia', 'Saudi Arabia'
]);

const CACHE_DIR = path.join(process.cwd(), '.cache');
const USER_WATCHLIST_FILE = path.join(CACHE_DIR, 'user-watchlist.json');
const USER_PORTFOLIO_FILE = path.join(CACHE_DIR, 'user-portfolio.json');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    } catch {
      /* ignore */
    }
  }
}

function loadJson<T>(filename: string): T {
  const p = path.join(process.cwd(), 'data', filename);
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
}

let watchlistCache: WatchlistEntry[] | null = null;

function loadUserWatchlist(): WatchlistEntry[] {
  ensureCacheDir();
  try {
    if (fs.existsSync(USER_WATCHLIST_FILE)) {
      return JSON.parse(fs.readFileSync(USER_WATCHLIST_FILE, 'utf-8')) as WatchlistEntry[];
    }
  } catch {
    /* ignore */
  }
  return [];
}

function saveUserWatchlist(entries: WatchlistEntry[]): void {
  ensureCacheDir();
  try {
    fs.writeFileSync(USER_WATCHLIST_FILE, JSON.stringify(entries, null, 2), 'utf-8');
  } catch {
    /* ignore */
  }
}

export function getWatchlist(): WatchlistEntry[] {
  if (!watchlistCache) {
    const seed: WatchlistEntry[] = loadJson('watchlist.json');
    const user = loadUserWatchlist();
    const map = new Map<string, WatchlistEntry>();
    for (const w of seed) map.set(w.ticker.toUpperCase(), w);
    for (const u of user) map.set(u.ticker.toUpperCase(), u);
    watchlistCache = Array.from(map.values());
  }
  return watchlistCache;
}

export function addWatchlistEntry(entry: WatchlistEntry): WatchlistEntry {
  const all = getWatchlist();
  const upper = entry.ticker.toUpperCase();
  const updatedEntry = { ...entry, ticker: upper };
  const user = loadUserWatchlist().filter((e) => e.ticker.toUpperCase() !== upper);
  user.push(updatedEntry);
  saveUserWatchlist(user);

  const map = new Map<string, WatchlistEntry>();
  for (const w of all) map.set(w.ticker.toUpperCase(), w);
  map.set(upper, updatedEntry);
  watchlistCache = Array.from(map.values());
  return updatedEntry;
}

export function removeWatchlistEntry(ticker: string): boolean {
  const upper = ticker.toUpperCase();
  const user = loadUserWatchlist().filter((e) => e.ticker.toUpperCase() !== upper);
  saveUserWatchlist(user);

  if (watchlistCache) {
    watchlistCache = watchlistCache.filter((e) => e.ticker.toUpperCase() !== upper);
  }
  return true;
}

export function searchWatchlist(query: string, limit = 12): WatchlistEntry[] {
  const q = query.trim().toLowerCase();
  const list = getWatchlist();
  if (!q) return list.slice(0, limit);
  return list
    .filter(
      (e) =>
        e.ticker.toLowerCase().includes(q) ||
        e.companyName.toLowerCase().includes(q) ||
        e.sector.toLowerCase().includes(q) ||
        (e.country && e.country.toLowerCase().includes(q))
    )
    .slice(0, limit);
}

export function getWatchlistEntry(ticker: string): WatchlistEntry | undefined {
  const upper = ticker.toUpperCase().trim();
  const base = upper.split('.')[0];
  return (
    getWatchlist().find((e) => e.ticker.toUpperCase() === upper) ||
    getWatchlist().find((e) => e.ticker.toUpperCase() === base)
  );
}

// User portfolio persistence on server
export function getStoredPortfolioHoldings(): any[] {
  ensureCacheDir();
  try {
    if (fs.existsSync(USER_PORTFOLIO_FILE)) {
      return JSON.parse(fs.readFileSync(USER_PORTFOLIO_FILE, 'utf-8'));
    }
  } catch {
    /* ignore */
  }
  try {
    return loadJson('portfolio.json');
  } catch {
    return [];
  }
}

export function saveStoredPortfolioHoldings(holdings: any[]): void {
  ensureCacheDir();
  try {
    fs.writeFileSync(USER_PORTFOLIO_FILE, JSON.stringify(holdings, null, 2), 'utf-8');
  } catch {
    /* ignore */
  }
}

function isUSMarketOpen(): boolean {
  const now = new Date();
  const utcDay = now.getUTCDay();
  if (utcDay === 0 || utcDay === 6) return false;
  const totalUtcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return totalUtcMins >= 13 * 60 + 30 && totalUtcMins <= 20 * 60;
}

function formatTimestamp(): string {
  return (
    new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }) + ' UTC'
  );
}

const STOCK_BASELINES: Record<string, { price: number; prevClose: number }> = {
  NVDA: { price: 124.5, prevClose: 121.2 },
  AAPL: { price: 224.3, prevClose: 225.1 },
  TSM: { price: 172.8, prevClose: 176.4 },
  MSFT: { price: 442.1, prevClose: 440.5 },
  AMZN: { price: 186.2, prevClose: 184.9 },
  GOOGL: { price: 179.4, prevClose: 180.1 },
  XOM: { price: 118.7, prevClose: 115.3 },
  LMT: { price: 478.2, prevClose: 472 },
  JPM: { price: 208.5, prevClose: 207.1 },
  ASML: { price: 845, prevClose: 860.2 },
  AMD: { price: 154.2, prevClose: 151.8 },
  META: { price: 520, prevClose: 515 },
  TSLA: { price: 245, prevClose: 250 },
  'TATASTEEL.NS': { price: 158.4, prevClose: 156.8 },
  '005930.KS': { price: 68500, prevClose: 69200 },
  'NESN.SW': { price: 84.6, prevClose: 85.1 }
};

function simulatedQuote(symbol: string): CachedQuote {
  const baseline = STOCK_BASELINES[symbol] || { price: 150, prevClose: 148.5 };
  const seed = (symbol.charCodeAt(0) * 13 + Math.floor(Date.now() / 15000)) % 100;
  const jitter = (seed - 50) / 1000;
  const price = Number((baseline.price * (1 + jitter)).toFixed(2));
  const change = Number((price - baseline.prevClose).toFixed(2));
  const pct = Number(((change / baseline.prevClose) * 100).toFixed(2));
  return setCachedQuote(symbol, {
    symbol,
    price,
    change,
    percentChange: pct,
    high: Number((Math.max(price, baseline.prevClose) * 1.01).toFixed(2)),
    low: Number((Math.min(price, baseline.prevClose) * 0.99).toFixed(2)),
    previousClose: baseline.prevClose,
    volume: 15000000 + seed * 80000,
    lastUpdated: formatTimestamp(),
    isMarketOpen: isUSMarketOpen()
  });
}

export async function fetchQuote(symbol: string): Promise<CachedQuote | null> {
  const sym = symbol.toUpperCase().trim();
  const cached = getCachedQuote(sym);
  if (cached) return cached;

  const finnhubKey = process.env.FINNHUB_API_KEY;
  if (finnhubKey) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) {
        const data: any = await res.json();
        if (data?.c > 0) {
          const prev = data.pc || data.c;
          const change = data.c - prev;
          return setCachedQuote(sym, {
            symbol: sym,
            price: Number(data.c.toFixed(2)),
            change: Number(change.toFixed(2)),
            percentChange: Number(((change / prev) * 100).toFixed(2)),
            high: Number((data.h || data.c).toFixed(2)),
            low: Number((data.l || data.c).toFixed(2)),
            previousClose: Number(prev.toFixed(2)),
            volume: data.v || 0,
            lastUpdated: formatTimestamp(),
            isMarketOpen: isUSMarketOpen()
          });
        }
      }
    } catch {
      /* try yahoo */
    }
  }

  const yahoo = await fetchYahooQuote(sym);
  if (yahoo) return yahoo;

  return simulatedQuote(sym);
}

export async function fetchQuotesBatch(symbols: string[]): Promise<Record<string, CachedQuote>> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const results: Record<string, CachedQuote> = {};
  await Promise.all(
    unique.map(async (sym) => {
      const q = await fetchQuote(sym);
      if (q) results[sym] = q;
    })
  );
  return results;
}

async function fetchFinnhubProfile(ticker: string): Promise<{
  name: string;
  marketCap: number;
  finnhubIndustry: string;
  country: string;
  exchange: string;
  logo?: string;
  weburl?: string;
} | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    if (!data?.name && !data?.ticker) return null;
    return {
      name: data.name || ticker,
      marketCap: data.marketCapitalization ? data.marketCapitalization * 1_000_000 : 0,
      finnhubIndustry: data.finnhubIndustry || data.industry || 'Unknown',
      country: data.country || 'Unknown',
      exchange: data.exchange || 'US',
      logo: data.logo,
      weburl: data.weburl
    };
  } catch {
    return null;
  }
}

export function computeRecommendedAction(riskScore: number): RecommendedAction {
  if (riskScore >= 80) return 'Reduce';
  if (riskScore >= 70) return 'Hedge';
  if (riskScore >= 55) return 'Review';
  if (riskScore >= 40) return 'Monitor';
  return 'Safe';
}

export function computeRiskScoreForMeta(
  meta: { sector: string; country: string; ticker: string },
  quote: CachedQuote | null,
  impactCount: number
): number {
  let score = SECTOR_BASE_RISK[meta.sector] ?? 50;
  if (HIGH_EXPOSURE_COUNTRIES.has(meta.country)) score += 12;

  // Factor in country risk from live country risk store if available
  const countryEntry = resolveCountryEntry(meta.country, meta.ticker);
  if (countryRiskCache) {
    const liveCountry = countryRiskCache.countries.find((c) => c.isoCode === countryEntry.isoCode);
    if (liveCountry && liveCountry.riskScore >= 70) score += 8;
    else if (liveCountry && liveCountry.riskScore <= 30) score -= 5;
  }

  if (quote) score += Math.min(15, Math.abs(quote.percentChange) * 2);
  score += Math.min(12, impactCount * 3);

  if (meta.sector.toLowerCase().includes('semiconductor') && meta.country === 'Taiwan') score += 8;
  return Math.min(100, Math.max(10, Math.round(score)));
}

function buildKeyRisksForMeta(meta: { sector: string; country: string }, impactCount: number): string[] {
  const risks: string[] = [];
  if (meta.country === 'Taiwan' || meta.country.includes('TW')) {
    risks.push('Taiwan Strait geopolitical and maritime disruption exposure');
  }
  if (meta.country === 'Israel' || meta.country === 'Iran' || meta.country === 'Saudi Arabia') {
    risks.push('Middle East regional conflict & oil transit chokepoint exposure');
  }
  if (meta.country === 'Ukraine' || meta.country === 'Russia') {
    risks.push('Eastern European conflict, sanctions, and Black Sea corridor risk');
  }
  if (meta.sector.toLowerCase().includes('semiconductor')) {
    risks.push('Advanced chip export control and supply chain concentration');
  }
  if (meta.sector.toLowerCase().includes('energy') || meta.sector.toLowerCase().includes('oil')) {
    risks.push('Oil transit chokepoint risk (Hormuz, Red Sea, Suez)');
  }
  if (meta.sector.toLowerCase().includes('defense') || meta.sector.toLowerCase().includes('aerospace')) {
    risks.push('Government defense budget cycles & critical component supply lead times');
  }
  if (meta.sector.toLowerCase().includes('financial') || meta.sector.toLowerCase().includes('bank')) {
    risks.push('Sovereign interest rate path & foreign capital flow sensitivity');
  }
  if (meta.sector.toLowerCase().includes('basic materials') || meta.sector.toLowerCase().includes('mining')) {
    risks.push('Global commodity price cycles & cross-border export tariffs');
  }
  if (impactCount > 0) {
    risks.push(`${impactCount} active news impact signal(s) detected in last 24h`);
  }
  if (risks.length === 0) {
    risks.push(`Macroeconomic and regional risk factors (${meta.country || 'Global'})`);
  }
  return risks.slice(0, 4);
}

function formatMarketCap(val: number): string {
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  return 'N/A';
}

function sentimentFromQuote(pct: number): { score: number; label: string } {
  if (pct <= -3) return { score: 25, label: 'Very Bearish' };
  if (pct <= -1) return { score: 38, label: 'Bearish' };
  if (pct >= 3) return { score: 78, label: 'Bullish' };
  if (pct >= 1) return { score: 62, label: 'Neutral' };
  return { score: 50, label: 'Neutral' };
}

export function computeRiskScore(
  entry: WatchlistEntry,
  quote: CachedQuote | null,
  impactCount: number
): number {
  return computeRiskScoreForMeta(
    { sector: entry.sector, country: entry.country, ticker: entry.ticker },
    quote,
    impactCount
  );
}

function buildRiskTrend(baseScore: number): { date: string; score: number }[] {
  const days = ['Jul 1', 'Jul 5', 'Jul 10', 'Jul 15', 'Jul 20', 'Jul 25'];
  return days.map((date, i) => ({
    date,
    score: Math.min(100, Math.max(10, baseScore - 8 + i * 2 + (i % 2) * 3))
  }));
}

export async function getCompanyProfile(ticker: string): Promise<CompanyProfileResponse | null> {
  const sym = ticker.toUpperCase().trim();
  const baseSym = sym.split('.')[0];
  const watchEntry = getWatchlistEntry(sym) || getWatchlistEntry(baseSym);

  const [quote, finnhub, yahooMeta] = await Promise.all([
    fetchQuote(sym),
    fetchFinnhubProfile(sym),
    fetchYahooCompanyMeta(sym)
  ]);

  if (!finnhub && !quote && !watchEntry && !yahooMeta) return null;

  const rawName = finnhub?.name || yahooMeta?.name || watchEntry?.companyName || sym;
  const name = rawName.replace(/\s+(Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Co\.,?\s*Ltd\.?)$/i, '').trim() || rawName;
  const sector = finnhub?.finnhubIndustry || yahooMeta?.sector || yahooMeta?.industry || watchEntry?.sector || 'Diversified';
  const exchange =
    finnhub?.exchange ||
    yahooMeta?.exchange ||
    watchEntry?.exchange ||
    normalizeExchangeCode('', '', sym);

  // Canonical country & region resolution across all ~250 countries & territories
  const resolvedCountry = resolveCountryEntry(
    finnhub?.country || watchEntry?.country,
    sym,
    exchange
  );
  const country = resolvedCountry.name;
  const region = resolvedCountry.region;

  const impacts = getImpactState().impactedCompanies.filter(
    (r) => r.ticker === baseSym || r.ticker === sym
  );
  const meta = { sector, country, ticker: sym };
  const riskScore = computeRiskScoreForMeta(meta, quote, impacts.length);
  const action = computeRecommendedAction(riskScore);
  const sentiment = sentimentFromQuote(quote?.percentChange ?? 0);

  return {
    ticker: sym,
    name,
    sector,
    country,
    region,
    exchange,
    marketCap: finnhub?.marketCap ? formatMarketCap(finnhub.marketCap) : 'N/A',
    description: `${name} (${sym}) — ${sector} sector, listed on ${exchange} (${country}, ${region}). Quantitative tail-risk scoring: ${riskScore}/100.`,
    riskScore,
    sentimentScore: sentiment.score,
    sentimentLabel: sentiment.label,
    keyRisks: buildKeyRisksForMeta(meta, impacts.length),
    aiSummary: `${name} (${sym}) composite risk score: ${riskScore}/100 [Action: ${action}]. Sector: ${sector}, region: ${region}. Factoring live volatility and ${impacts.length} news impact signal(s).`,
    riskTrend: buildRiskTrend(riskScore),
    quote,
    activeImpactCount: impacts.length,
    inWatchlist: !!watchEntry,
    action,
    countryIso: resolvedCountry.isoCode,
    countryFlag: resolvedCountry.flag
  };
}

export function getCountriesBase(): CountryBaseEntry[] {
  return getAllCountriesUniverse();
}

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 12,
  high: 8,
  medium: 4,
  low: 2
};

const SENTIMENT_WEIGHT: Record<string, number> = {
  negative: 8,
  neutral: 4,
  positive: 2
};

const REGION_ISO_MAP: Record<string, string> = {
  india: 'IN'
};

interface CountryRiskHeadline {
  title: string;
  description: string;
  region: 'india' | 'world';
  sentiment: 'negative' | 'neutral' | 'positive';
}

export function computeLiveCountryRisk(
  liveHeadlines: CountryRiskHeadline[] = [],
  options: { includeImpact?: boolean } = {}
): {
  countries: Array<{
    id: string;
    name: string;
    isoCode: string;
    flag: string;
    region: string;
    subregion?: string;
    riskScore: number;
    riskLevel: string;
    eventsCount: number;
    keyRisks: string[];
    scoreChanged: boolean;
    previousScore?: number;
    isCurated?: boolean;
    isHotspot?: boolean;
  }>;
  lastUpdated: string;
} {
  const includeImpact = options.includeImpact !== false;
  const base = getAllCountriesUniverse();
  const impactState = includeImpact
    ? getImpactState()
    : { impactedCompanies: [] as { headline: string; description: string; severity: string }[] };

  const previousScores = countryRiskCache
    ? Object.fromEntries(countryRiskCache.countries.map((c) => [c.id, c.riskScore]))
    : {};

  const countries = base.map((c) => {
    let eventsCount = 0;
    let severitySum = 0;
    const vectors: string[] = [];
    const seenEvents = new Set<string>();

    const addEvent = (headline: string, weight: number) => {
      const key = headline.slice(0, 80);
      if (seenEvents.has(key)) return;
      seenEvents.add(key);
      eventsCount++;
      severitySum += weight;
      if (vectors.length < 5) vectors.push(headline.slice(0, 80));
    };

    for (const record of impactState.impactedCompanies) {
      const text = `${record.headline} ${record.description}`.toLowerCase();
      if (c.keywords.some((k) => matchesCountryKeyword(text, k))) {
        addEvent(record.headline, SEVERITY_WEIGHT[record.severity] || 4);
      }
    }

    for (const article of liveHeadlines) {
      const text = `${article.title} ${article.description}`.toLowerCase();
      const regionMatch = REGION_ISO_MAP[article.region] === c.isoCode;
      const keywordMatch = c.keywords.some((k) => matchesCountryKeyword(text, k));
      if (regionMatch || keywordMatch) {
        addEvent(article.title, SENTIMENT_WEIGHT[article.sentiment] || 4);
      }
    }

    let riskScore = 20 + eventsCount * 5 + severitySum;
    if (eventsCount === 0) {
      const structuralBaseline: Record<string, number> = {
        TW: 45,
        UA: 50,
        OM: 40,
        IR: 40,
        IL: 45,
        RU: 45,
        CN: 38
      };
      if (structuralBaseline[c.isoCode]) {
        riskScore = Math.max(riskScore, structuralBaseline[c.isoCode]);
      }
    }
    riskScore = Math.min(100, Math.max(15, Math.round(riskScore)));

    const riskLevel =
      riskScore >= 80 ? 'Critical' : riskScore >= 65 ? 'High' : riskScore >= 45 ? 'Medium' : 'Low';

    const defaultRisks: Record<string, string[]> = {
      TW: ['Semiconductor supply chain concentration', 'Taiwan Strait maritime risk'],
      UA: ['Black Sea corridor disruption', 'Energy infrastructure risk'],
      IL: ['Regional missile threats', 'Port transit delays'],
      OM: ['Oil tanker transit risk', 'Maritime war insurance spikes'],
      US: ['Fiscal policy shifts', 'Critical infrastructure cyber risk'],
      IN: ['Currency volatility', 'Foreign capital flow sensitivity'],
      JP: ['Yen exchange rate pressure', 'Export sector exposure'],
      RU: ['Sanctions regime impact', 'Logistics friction in sovereign trade'],
      CN: ['Trade tariffs & maritime supply chain friction', 'Property & manufacturing cycle']
    };

    const prevScore = previousScores[c.id];

    return {
      id: c.id,
      name: c.name,
      isoCode: c.isoCode,
      flag: c.flag,
      region: c.region,
      subregion: c.subregion,
      riskScore,
      riskLevel,
      eventsCount,
      keyRisks:
        vectors.length > 0
          ? vectors
          : defaultRisks[c.isoCode] || [
              `No active geopolitical shock alerts in 24h`,
              `Baseline macroeconomic monitoring (${c.region})`
            ],
      scoreChanged: prevScore != null && prevScore !== riskScore,
      previousScore: prevScore != null && prevScore !== riskScore ? prevScore : undefined,
      isCurated: c.isCurated,
      isHotspot: c.isHotspot
    };
  });

  countries.sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    return a.name.localeCompare(b.name);
  });

  return { countries, lastUpdated: new Date().toISOString() };
}

let countryRiskCache: ReturnType<typeof computeLiveCountryRisk> | null = null;
let countryRiskCacheTime = 0;
const COUNTRY_CACHE_MS = 5 * 60 * 1000;

function withCountryHistory(data: NonNullable<typeof countryRiskCache>) {
  const history = getCountryHistory(30);
  const countries = data.countries.map((c) => {
    const sparkline = history.map((day) => day.scores[c.id] ?? null);
    const recorded = sparkline.filter((s): s is number => s != null);
    const monthDelta =
      recorded.length >= 2 ? recorded[recorded.length - 1] - recorded[0] : null;
    return { ...c, sparkline, monthDelta };
  });
  return { countries, lastUpdated: data.lastUpdated };
}

export async function getLiveCountryRisk(force = false) {
  if (!force && countryRiskCache && Date.now() - countryRiskCacheTime < COUNTRY_CACHE_MS) {
    return withCountryHistory(countryRiskCache);
  }

  if (force) {
    await refreshImpactData(true);
  }

  const { articles } = await fetchHeadlines('all', 30);
  const headlines: CountryRiskHeadline[] = articles.map((a) => ({
    title: a.title,
    description: a.description,
    region: a.region,
    sentiment: a.sentiment
  }));

  countryRiskCache = computeLiveCountryRisk(headlines);
  countryRiskCacheTime = Date.now();
  return withCountryHistory(countryRiskCache);
}

/** @deprecated use getLiveCountryRisk */
export function getLiveCountryRiskCached(force = false) {
  if (!force && countryRiskCache && Date.now() - countryRiskCacheTime < COUNTRY_CACHE_MS) {
    return countryRiskCache;
  }
  return computeLiveCountryRisk();
}
