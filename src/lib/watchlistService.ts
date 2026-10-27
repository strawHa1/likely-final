import { WatchlistEntry, CompanyProfile } from '../types';

const PINNED_KEY = 'bs-pinned-tickers';
const WATCHLIST_LOCAL_KEY = 'bs-user-watchlist';

let watchlistCache: WatchlistEntry[] | null = null;

export async function fetchWatchlist(query = ''): Promise<WatchlistEntry[]> {
  const url = query
    ? `/api/watchlist?q=${encodeURIComponent(query)}&limit=25`
    : '/api/watchlist';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (!query) watchlistCache = data.entries;
      return data.entries;
    }
  } catch {
    /* fallback to local storage */
  }

  // Local storage fallback
  try {
    const raw = localStorage.getItem(WATCHLIST_LOCAL_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as WatchlistEntry[];
      return filterWatchlistLocal(query, stored);
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function filterWatchlistLocal(query: string, entries: WatchlistEntry[]): WatchlistEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.slice(0, 15);
  return entries
    .filter(
      (e) =>
        e.ticker.toLowerCase().includes(q) ||
        e.companyName.toLowerCase().includes(q) ||
        e.sector.toLowerCase().includes(q) ||
        (e.country && e.country.toLowerCase().includes(q))
    )
    .slice(0, 15);
}

export async function getAllWatchlist(): Promise<WatchlistEntry[]> {
  if (watchlistCache) return watchlistCache;
  return fetchWatchlist();
}

export function getPinnedTickers(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* ignore */
  }
  return [];
}

export function setPinnedTickers(tickers: string[]): void {
  localStorage.setItem(PINNED_KEY, JSON.stringify(tickers));
}

export function togglePin(ticker: string): string[] {
  const pinned = getPinnedTickers();
  const upper = ticker.toUpperCase();
  const next = pinned.includes(upper) ? pinned.filter((t) => t !== upper) : [...pinned, upper];
  setPinnedTickers(next);
  return next;
}

export function isPinned(ticker: string): boolean {
  return getPinnedTickers().includes(ticker.toUpperCase());
}

export async function addWatchlistItem(entry: WatchlistEntry): Promise<void> {
  const upper = entry.ticker.toUpperCase();
  // Pin locally
  const pinned = getPinnedTickers();
  if (!pinned.includes(upper)) {
    setPinnedTickers([...pinned, upper]);
  }

  // Update local watchlist cache
  try {
    const raw = localStorage.getItem(WATCHLIST_LOCAL_KEY);
    const list: WatchlistEntry[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((e) => e.ticker.toUpperCase() !== upper);
    filtered.push({ ...entry, ticker: upper });
    localStorage.setItem(WATCHLIST_LOCAL_KEY, JSON.stringify(filtered));
  } catch {
    /* ignore */
  }

  // Sync to server
  try {
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
  } catch {
    /* ignore */
  }

  window.dispatchEvent(new CustomEvent('bs-watchlist-updated'));
}

export async function removeWatchlistItem(ticker: string): Promise<void> {
  const upper = ticker.toUpperCase();
  // Unpin locally
  const pinned = getPinnedTickers();
  setPinnedTickers(pinned.filter((t) => t !== upper));

  try {
    const raw = localStorage.getItem(WATCHLIST_LOCAL_KEY);
    if (raw) {
      const list: WatchlistEntry[] = JSON.parse(raw);
      localStorage.setItem(WATCHLIST_LOCAL_KEY, JSON.stringify(list.filter((e) => e.ticker.toUpperCase() !== upper)));
    }
  } catch {
    /* ignore */
  }

  try {
    await fetch(`/api/watchlist/${encodeURIComponent(upper)}`, {
      method: 'DELETE'
    });
  } catch {
    /* ignore */
  }

  window.dispatchEvent(new CustomEvent('bs-watchlist-updated'));
}

export async function fetchCompanyProfile(ticker: string): Promise<CompanyProfile | null> {
  const res = await fetch(`/api/companies/${encodeURIComponent(ticker.toUpperCase())}`, {
    cache: 'no-store'
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load company profile');
  const data = await res.json();
  return {
    ticker: data.ticker,
    name: data.name,
    sector: data.sector,
    country: data.country,
    marketCap: data.marketCap,
    riskScore: data.riskScore,
    sentimentScore: data.sentimentScore,
    sentimentLabel: data.sentimentLabel,
    description: data.description,
    keyRisks: data.keyRisks,
    aiSummary: data.aiSummary,
    recentNews: [],
    riskTrend: data.riskTrend,
    exchange: data.exchange,
    region: data.region,
    quote: data.quote,
    activeImpactCount: data.activeImpactCount,
    inWatchlist: data.inWatchlist,
    action: data.action,
    countryIso: data.countryIso,
    countryFlag: data.countryFlag
  };
}
