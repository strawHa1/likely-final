import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Pin,
  PinOff,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Clock,
  Globe,
  PlusCircle,
  Filter,
  CheckCircle,
  WifiOff,
  X,
  ExternalLink
} from 'lucide-react';
import { SearchResultItem, SearchFilters, SearchListingBadge } from '../../types';
import { getPinnedTickers, togglePin } from '../../lib/watchlistService';

const RECENT_KEY = 'bs-recent-searches';
const MAX_RECENT = 10;
const DEBOUNCE_MS = 250;
const QUOTE_POLL_MS = 8000;
const RETRY_MS = 4000;

export function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

export function addRecentSearch(ticker: string, name?: string): string[] {
  const upper = ticker.toUpperCase();
  const stored: { ticker: string; name?: string }[] = (() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY + '-meta') || '[]');
    } catch {
      return [];
    }
  })();
  const filtered = stored.filter((s) => s.ticker !== upper);
  const next = [{ ticker: upper, name }, ...filtered].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY + '-meta', JSON.stringify(next));
  localStorage.setItem(RECENT_KEY, JSON.stringify(next.map((n) => n.ticker)));
  window.dispatchEvent(new CustomEvent('bs-recent-updated'));
  return next.map((n) => n.ticker);
}

export function getRecentSearchMeta(): { ticker: string; name?: string }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY + '-meta') || '[]');
  } catch {
    return getRecentSearches().map((t) => ({ ticker: t }));
  }
}

export function getQuickAccessChips(max = 10): { ticker: string; name?: string }[] {
  const seen = new Set<string>();
  const out: { ticker: string; name?: string }[] = [];
  for (const t of getPinnedTickers()) {
    const upper = t.toUpperCase();
    if (!seen.has(upper)) {
      seen.add(upper);
      out.push({ ticker: upper });
    }
  }
  for (const r of getRecentSearchMeta()) {
    if (!seen.has(r.ticker)) {
      seen.add(r.ticker);
      out.push(r);
    }
  }
  return out.slice(0, max);
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/**
 * Highlight query match inside text
 */
function renderHighlighted(text: string, query: string): React.ReactNode {
  if (!query.trim() || !text) return text;
  const q = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${q})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <mark key={i} className="bg-amber-400/30 text-amber-300 dark:text-amber-200 rounded px-0.5 font-bold">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function exchangeBadgeColor(exchange: string): string {
  switch ((exchange || '').toUpperCase()) {
    case 'NSE':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'BSE':
      return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    case 'NASDAQ':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    case 'NYSE':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    case 'LSE':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    case 'EURONEXT':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'TSE':
      return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'KRX':
      return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
    case 'ASX':
      return 'bg-teal-500/15 text-teal-400 border-teal-500/30';
    case 'XETRA':
      return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
    case 'SIX':
      return 'bg-red-600/15 text-red-300 border-red-600/30';
    default:
      return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  }
}

async function fetchSearch(
  q: string,
  page: number,
  filters?: SearchFilters,
  signal?: AbortSignal
): Promise<{
  results: SearchResultItem[];
  hasMore: boolean;
  total?: number;
  durationMs?: number;
  error?: string;
}> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('page', String(page));
  params.set('limit', '20');
  if (filters?.exchange) params.set('exchange', filters.exchange);
  if (filters?.country) params.set('country', filters.country);
  if (filters?.type) params.set('type', filters.type);

  const res = await fetch(`/api/symbols/search?${params.toString()}`, {
    cache: 'no-store',
    signal
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Search failed');
  return {
    results: data.results || [],
    hasMore: data.hasMore,
    total: data.total,
    durationMs: data.durationMs,
    error: data.error
  };
}

async function fetchLiveLookup(
  q: string,
  signal?: AbortSignal
): Promise<{ results: SearchResultItem[]; fromLiveCount: number }> {
  const res = await fetch(`/api/symbols/lookup?q=${encodeURIComponent(q)}`, {
    cache: 'no-store',
    signal
  });
  if (!res.ok) return { results: [], fromLiveCount: 0 };
  return res.json();
}

async function refreshQuotes(symbols: string[]): Promise<Record<string, SearchResultItem['quote']>> {
  if (symbols.length === 0) return {};
  const res = await fetch(`/api/search/quotes?symbols=${encodeURIComponent(symbols.join(','))}`, {
    cache: 'no-store'
  });
  if (!res.ok) return {};
  return res.json();
}

interface MarketSearchProps {
  onSelect: (ticker: string, name?: string) => void;
  onAddToPortfolio?: (item: SearchResultItem) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  wide?: boolean;
}

export const MarketSearch: React.FC<MarketSearchProps> = ({
  onSelect,
  onAddToPortfolio,
  placeholder = 'Search any company — Tata Steel, Samsung, Nestle, Apple, TSLA...',
  className = '',
  inputClassName = '',
  wide = false
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isLiveLookingUp, setIsLiveLookingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [pinned, setPinned] = useState<string[]>(getPinnedTickers());
  const [browseMode, setBrowseMode] = useState(false);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Filters state
  const [selectedExchange, setSelectedExchange] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Custom symbol modal state
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customSymbol, setCustomSymbol] = useState('');
  const [customName, setCustomName] = useState('');
  const [customExchange, setCustomExchange] = useState('US');
  const [customCurrency, setCustomCurrency] = useState('USD');
  const [customSubmitting, setCustomSubmitting] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchSeqRef = useRef(0);
  const symbolsKey = results.map((r) => r.displaySymbol).join(',');

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const currentFilters: SearchFilters = {
    exchange: selectedExchange || undefined,
    type: selectedType || undefined,
    country: selectedCountry || undefined
  };

  const loadBrowse = useCallback(
    async (p = 1, append = false) => {
      setBrowseMode(true);
      setLoading(true);
      setError(null);
      try {
        const data = await fetchSearch('', p, currentFilters);
        if (data.error) setError(data.error);
        setResults((prev) => (append ? [...prev, ...data.results] : data.results));
        setHasMore(data.hasMore);
        setBrowseTotal(data.total ?? 0);
        setHighlightIdx(!append && data.results.length > 0 ? 0 : -1);
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          setError(e?.message || 'Unable to fetch market data. Please try again.');
          if (!append) setResults([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [selectedExchange, selectedType, selectedCountry]
  );

  const loadSearch = useCallback(
    async (q: string, p: number, append = false) => {
      if (!q.trim()) {
        loadBrowse(p, append);
        return;
      }
      setBrowseMode(false);
      setLoading(true);
      setError(null);

      // Increment sequence to discard out-of-order responses
      const thisSeq = ++searchSeqRef.current;

      // Abort previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const data = await fetchSearch(q, p, currentFilters, controller.signal);
        if (thisSeq !== searchSeqRef.current) return; // Ignore stale response

        if (data.error) setError(data.error);
        if (data.durationMs != null) setLatencyMs(data.durationMs);

        const currentResults = append ? [...results, ...data.results] : data.results;
        setResults(currentResults);
        setHasMore(data.hasMore);
        if (data.total != null) setBrowseTotal(data.total);
        setHighlightIdx(!append && currentResults.length > 0 ? 0 : -1);

        // If page 1 and results are sparse, trigger live lookup fallback asynchronously
        if (p === 1 && currentResults.length < 5 && !isOffline) {
          setIsLiveLookingUp(true);
          fetchLiveLookup(q, controller.signal)
            .then((live) => {
              if (thisSeq !== searchSeqRef.current) return;
              if (live.results.length > 0) {
                const seen = new Set(currentResults.map((r) => r.displaySymbol.toUpperCase()));
                const merged = [...currentResults];
                for (const item of live.results) {
                  if (!seen.has(item.displaySymbol.toUpperCase())) {
                    seen.add(item.displaySymbol.toUpperCase());
                    merged.push(item);
                  }
                }
                setResults(merged);
              }
            })
            .catch(() => {})
            .finally(() => {
              if (thisSeq === searchSeqRef.current) setIsLiveLookingUp(false);
            });
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          if (thisSeq === searchSeqRef.current) {
            setError(e?.message || 'Unable to fetch market data. Please try again.');
            if (!append) setResults([]);
            if (retryTimer.current) clearTimeout(retryTimer.current);
            retryTimer.current = setTimeout(() => loadSearch(q, p, append), RETRY_MS);
          }
        }
      } finally {
        if (thisSeq === searchSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [loadBrowse, selectedExchange, selectedType, selectedCountry, isOffline]
  );

  // Debounced search (250ms)
  useEffect(() => {
    const timer = setTimeout(
      () => {
        setPage(1);
        if (open) {
          if (query.trim()) loadSearch(query, 1, false);
          else loadBrowse(1, false);
        }
      },
      query.trim() ? DEBOUNCE_MS : 0
    );
    return () => clearTimeout(timer);
  }, [query, open, selectedExchange, selectedType, selectedCountry, loadSearch, loadBrowse]);

  // Periodic quote refresh
  useEffect(() => {
    if (!open || results.length === 0) return;
    const symbols = results.map((r) => r.displaySymbol);
    const poll = async () => {
      const quotes = await refreshQuotes(symbols);
      setResults((prev) =>
        prev.map((item) => {
          const full = item.displaySymbol.toUpperCase();
          const base = full.split('.')[0];
          const q = quotes[full] || quotes[base] || quotes[item.symbol.toUpperCase()];
          return q ? { ...item, quote: q as SearchResultItem['quote'] } : item;
        })
      );
    };
    poll();
    const timer = setInterval(poll, QUOTE_POLL_MS);
    return () => clearInterval(timer);
  }, [open, symbolsKey, results.length]);

  // Outside click to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();
  }, []);

  const handleSelect = (item: SearchResultItem | SearchListingBadge) => {
    const ticker = item.symbol.toUpperCase();
    const name = (item as SearchResultItem).name || ticker;
    addRecentSearch(ticker, name);
    onSelect(ticker, name);
    setQuery('');
    setOpen(false);
    setHighlightIdx(-1);
  };

  const handleTogglePin = (item: SearchResultItem) => {
    const ticker = item.displaySymbol.toUpperCase();
    const nextPinned = togglePin(ticker);
    setPinned(nextPinned);

    if (nextPinned.includes(ticker)) {
      fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          companyName: item.name,
          sector: item.sector,
          exchange: item.exchange,
          country: item.country,
          region: item.region
        })
      }).catch(() => {});
    } else {
      fetch(`/api/watchlist/${encodeURIComponent(ticker)}`, {
        method: 'DELETE'
      }).catch(() => {});
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0 && results[highlightIdx]) {
      e.preventDefault();
      handleSelect(results[highlightIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleScroll = () => {
    const el = listRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      const next = page + 1;
      setPage(next);
      if (browseMode || !query.trim()) loadBrowse(next, true);
      else loadSearch(query, next, true);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomSubmitting(true);
    setCustomError(null);
    try {
      const res = await fetch('/api/symbols/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: customSymbol.trim().toUpperCase(),
          name: customName.trim(),
          exchange: customExchange,
          currency: customCurrency
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to verify and add custom symbol');
      }
      setShowCustomModal(false);
      setCustomSymbol('');
      setCustomName('');
      onSelect(data.symbol.symbol, data.symbol.name);
    } catch (err: any) {
      setCustomError(err.message || 'Verification error');
    } finally {
      setCustomSubmitting(false);
    }
  };

  const showEmpty = !loading && !isLiveLookingUp && !browseMode && query.trim().length >= 1 && results.length === 0 && !error;
  const dropdownWidth = wide ? 'min-w-[520px] w-full' : 'w-full';

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* Search Input Container with ARIA Combobox */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            if (!query.trim()) loadBrowse(1, false);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={
            inputClassName ||
            'w-full bg-white dark:bg-[#0F1420] border border-slate-300 dark:border-[#232A3D] rounded-xl px-3.5 py-2.5 pl-10 pr-24 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 shadow-sm font-sans'
          }
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="market-search-listbox"
          aria-activedescendant={highlightIdx >= 0 ? `search-option-${highlightIdx}` : undefined}
        />
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />

        {/* Filter toggle button inside input right */}
        <div className="absolute right-2 top-2 flex items-center gap-1">
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                loadBrowse(1, false);
              }}
              className="p-1 rounded text-slate-400 hover:text-slate-200 text-xs"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
              selectedExchange || selectedType || selectedCountry
                ? 'bg-blue-500/20 border-blue-500/40 text-blue-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Search Filters"
          >
            <Filter className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Row (Collapsible) */}
      {showFilters && (
        <div className="mt-2 p-2.5 bg-slate-100 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D] rounded-xl flex items-center gap-2 flex-wrap text-xs animate-in fade-in">
          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400 uppercase">
            <Filter className="w-3 h-3" /> Filters:
          </div>

          <select
            value={selectedExchange}
            onChange={(e) => setSelectedExchange(e.target.value)}
            className="bg-white dark:bg-[#0F1420] border border-slate-300 dark:border-[#232A3D] text-slate-700 dark:text-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="">All Exchanges</option>
            <option value="NSE">NSE (India .NS)</option>
            <option value="BSE">BSE (India .BO)</option>
            <option value="NASDAQ">NASDAQ (US)</option>
            <option value="NYSE">NYSE (US)</option>
            <option value="LSE">LSE (UK .L)</option>
            <option value="EURONEXT">Euronext (.PA .AS .BR)</option>
            <option value="TSE">Tokyo (.T)</option>
            <option value="KRX">Korea (.KS .KQ)</option>
            <option value="ASX">Australia (.AX)</option>
            <option value="XETRA">Germany (.DE)</option>
            <option value="SIX">Switzerland (.SW)</option>
            <option value="B3">Brazil (.SA)</option>
            <option value="HKEX">Hong Kong (.HK)</option>
          </select>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-white dark:bg-[#0F1420] border border-slate-300 dark:border-[#232A3D] text-slate-700 dark:text-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="">All Asset Types</option>
            <option value="Common Stock">Common Stock</option>
            <option value="ADR">ADR</option>
            <option value="ETF">ETF</option>
            <option value="REIT">REIT</option>
          </select>

          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="bg-white dark:bg-[#0F1420] border border-slate-300 dark:border-[#232A3D] text-slate-700 dark:text-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="">All Countries</option>
            <option value="US">🇺🇸 United States</option>
            <option value="IN">🇮🇳 India</option>
            <option value="GB">🇬🇧 United Kingdom</option>
            <option value="JP">🇯🇵 Japan</option>
            <option value="DE">🇩🇪 Germany</option>
            <option value="FR">🇫🇷 France</option>
            <option value="KR">🇰🇷 South Korea</option>
            <option value="AU">🇦🇺 Australia</option>
            <option value="CA">🇨🇦 Canada</option>
            <option value="CH">🇨🇭 Switzerland</option>
            <option value="BR">🇧🇷 Brazil</option>
          </select>

          {(selectedExchange || selectedType || selectedCountry) && (
            <button
              type="button"
              onClick={() => {
                setSelectedExchange('');
                setSelectedType('');
                setSelectedCountry('');
              }}
              className="text-xs text-rose-400 hover:underline font-semibold ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Dropdown Menu */}
      {open && (
        <div
          id="market-search-listbox"
          role="listbox"
          className={`absolute z-[100] mt-1.5 ${dropdownWidth} bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] rounded-xl shadow-2xl overflow-hidden`}
        >
          {/* Header Bar */}
          <div className="px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between border-b border-slate-100 dark:border-[#232A3D]/40">
            <span className="flex items-center gap-1.5">
              {isOffline ? (
                <span className="text-amber-400 flex items-center gap-1">
                  <WifiOff className="w-3 h-3" /> Offline Mode (Local DB)
                </span>
              ) : browseMode ? (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  {browseTotal > 0 ? `${browseTotal.toLocaleString()} companies` : 'All market stocks'}
                </span>
              ) : (
                <span>
                  {browseTotal > 0 ? `${browseTotal.toLocaleString()} matches` : 'Results'}
                  {latencyMs != null && <span className="ml-1 text-slate-400 font-normal normal-case font-mono">({latencyMs} ms)</span>}
                </span>
              )}
            </span>
            <span className="text-slate-400 font-normal normal-case">
              {isLiveLookingUp ? 'Scanning live exchanges…' : 'Use ↑↓ to navigate'}
            </span>
          </div>

          <div ref={listRef} onScroll={handleScroll} className="max-h-[min(460px,72vh)] overflow-y-auto custom-scrollbar">
            {/* Skeleton Loading State */}
            {loading && results.length === 0 && (
              <div className="p-3 space-y-2.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
                    <div className="w-9 h-9 rounded-full bg-slate-700/30" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-3/4 bg-slate-700/30 rounded" />
                      <div className="h-2.5 w-1/2 bg-slate-700/20 rounded" />
                    </div>
                    <div className="w-16 h-6 bg-slate-700/20 rounded" />
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="px-4 py-6 text-center text-xs text-amber-500 flex flex-col items-center gap-2">
                <AlertCircle className="w-6 h-6" />
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => (query.trim() ? loadSearch(query, 1, false) : loadBrowse(1, false))}
                  className="mt-1 text-xs text-blue-400 hover:underline font-semibold"
                >
                  Retry Search
                </button>
              </div>
            )}

            {/* Empty State with "Add custom symbol" button */}
            {showEmpty && (
              <div className="px-5 py-8 text-center text-xs text-slate-400 space-y-3">
                <p className="font-semibold text-slate-300">
                  No company matching <span className="text-blue-400 font-mono">"{query}"</span>
                </p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Try searching by ticker (e.g. RELIANCE, TATASTEEL, 7203, TSLA) or brand name (e.g. Google, Maggi, Lexus).
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomSymbol(query.toUpperCase().trim());
                      setShowCustomModal(true);
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Add Custom Symbol
                  </button>
                </div>
              </div>
            )}

            {/* Results List */}
            {results.map((item, idx) => {
              const quote = item.quote;
              const isUp = (quote?.change ?? 0) >= 0;
              const sym = item.displaySymbol.toUpperCase();
              const isHighlighted = idx === highlightIdx;
              const isItemPinned = pinned.includes(sym);
              const badgeClass = exchangeBadgeColor(item.exchange);

              return (
                <div
                  key={`${item.symbol}-${idx}`}
                  id={`search-option-${idx}`}
                  role="option"
                  aria-selected={isHighlighted}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  className={`w-full px-3.5 py-2.5 flex items-center gap-3 text-left border-b border-slate-100 dark:border-[#232A3D]/40 last:border-0 transition-colors cursor-pointer ${
                    isHighlighted ? 'bg-blue-500/10 dark:bg-blue-500/15' : 'hover:bg-slate-50 dark:hover:bg-[#161B2C]'
                  }`}
                >
                  {/* Avatar / Logo */}
                  {item.logoUrl ? (
                    <img src={item.logoUrl} alt="" className="w-9 h-9 rounded-full bg-white object-contain p-0.5 shrink-0 shadow-sm" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm">
                      {initials(item.name)}
                    </div>
                  )}

                  {/* Company Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-bold text-slate-900 dark:text-white truncate"
                        title={item.name}
                      >
                        {renderHighlighted(item.name, query)}
                      </span>
                      {item.isLiveSearch && (
                        <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded font-semibold shrink-0">
                          Live Search
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="text-blue-500 dark:text-blue-400 font-bold">${renderHighlighted(sym, query)}</span>
                      <span>•</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-sans font-bold uppercase ${badgeClass}`}>
                        {item.exchange}
                      </span>
                      {item.country && (
                        <>
                          <span>•</span>
                          <span className="text-slate-400 font-sans flex items-center gap-0.5">
                            <Globe className="w-2.5 h-2.5" />
                            {item.country}
                          </span>
                        </>
                      )}
                      {item.type && item.type !== 'Common Stock' && (
                        <>
                          <span>•</span>
                          <span className="text-slate-400 font-sans font-medium text-[10px] bg-slate-800/40 px-1 rounded">
                            {item.type}
                          </span>
                        </>
                      )}
                      {item.currency && (
                        <>
                          <span>•</span>
                          <span className="text-slate-400 font-mono text-[10px]">{item.currency}</span>
                        </>
                      )}
                    </div>

                    {/* Multi-listing Grouped Badges */}
                    {item.listings && item.listings.length > 1 && (
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-slate-400 font-sans">Also listed on:</span>
                        {item.listings.map((l) => (
                          <button
                            key={l.symbol}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelect(l);
                            }}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border transition-colors ${
                              l.symbol.toUpperCase() === sym
                                ? 'bg-blue-600 text-white border-blue-500'
                                : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:border-blue-400'
                            }`}
                          >
                            {l.exchange}: {l.symbol}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Live Quote Price */}
                  {quote ? (
                    <div className="text-right shrink-0 font-mono">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {item.currency === 'INR' ? '₹' : item.currency === 'JPY' ? '¥' : item.currency === 'EUR' ? '€' : '$'}
                        {quote.price.toFixed(2)}
                      </div>
                      <div
                        className={`text-[11px] font-semibold flex items-center justify-end gap-0.5 ${
                          isUp ? 'text-emerald-500' : 'text-red-500'
                        }`}
                      >
                        {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isUp ? '+' : ''}
                        {quote.change.toFixed(2)} ({isUp ? '+' : ''}
                        {quote.percentChange.toFixed(2)}%)
                      </div>
                    </div>
                  ) : loading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />
                  ) : null}

                  {/* Actions: Add to Portfolio & Pin */}
                  <div className="flex items-center gap-1 shrink-0">
                    {onAddToPortfolio && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToPortfolio(item);
                        }}
                        className="p-1 text-slate-400 hover:text-blue-400 transition-colors"
                        title="Add to Portfolio"
                      >
                        <PlusCircle className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePin(item);
                      }}
                      className="p-1 text-slate-400 hover:text-amber-400 transition-colors"
                      aria-label={isItemPinned ? 'Unpin from Watchlist' : 'Pin to Watchlist'}
                      title={isItemPinned ? 'Remove from Watchlist' : 'Add to Watchlist'}
                    >
                      {isItemPinned ? (
                        <Pin className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      ) : (
                        <PinOff className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Infinite Scroll Spinner */}
            {loading && results.length > 0 && (
              <div className="py-3 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Custom Symbol Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#232A3D]">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-blue-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Add Custom Symbol</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Enter any listed ticker symbol worldwide. The ticker will be verified with a live market quote before being saved to your local database.
            </p>

            <form onSubmit={handleCustomSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase">Ticker Symbol</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RELIANCE.NS, 7203.T, MC.PA, NVDA"
                  value={customSymbol}
                  onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161B2C] border border-slate-300 dark:border-[#232A3D] font-mono text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase">Company Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Reliance Industries Ltd"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161B2C] border border-slate-300 dark:border-[#232A3D] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase">Exchange</label>
                  <select
                    value={customExchange}
                    onChange={(e) => setCustomExchange(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161B2C] border border-slate-300 dark:border-[#232A3D] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="NSE">NSE (India)</option>
                    <option value="BSE">BSE (India)</option>
                    <option value="NASDAQ">NASDAQ (US)</option>
                    <option value="NYSE">NYSE (US)</option>
                    <option value="LSE">LSE (UK)</option>
                    <option value="EURONEXT">Euronext (EU)</option>
                    <option value="TSE">TSE (Japan)</option>
                    <option value="KRX">KRX (Korea)</option>
                    <option value="ASX">ASX (Australia)</option>
                    <option value="TSX">TSX (Canada)</option>
                    <option value="XETRA">Xetra (Germany)</option>
                    <option value="SIX">SIX (Switzerland)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase">Currency</label>
                  <select
                    value={customCurrency}
                    onChange={(e) => setCustomCurrency(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161B2C] border border-slate-300 dark:border-[#232A3D] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="JPY">JPY (¥)</option>
                    <option value="CAD">CAD ($)</option>
                    <option value="AUD">AUD ($)</option>
                    <option value="KRW">KRW (₩)</option>
                    <option value="CHF">CHF</option>
                  </select>
                </div>
              </div>

              {customError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{customError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-[#232A3D]">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#161B2C] text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-[#232A3D]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={customSubmitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold shadow-md flex items-center gap-1.5"
                >
                  {customSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  Verify & Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export { getPinnedTickers, togglePin };
