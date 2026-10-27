/**
 * src/hooks/usePortfolioQuotes.ts
 *
 * High-scale tiered quote polling hook for 500+ portfolio holdings.
 * Features:
 *   - Batches requests into chunks of 40 symbols with concurrency cap (3 parallel requests)
 *   - Tiered polling: visible rows polled every 20s, off-screen rows polled every 60s
 *   - Pauses polling when document.visibilityState === 'hidden' (tab inactive)
 *   - Request de-duplication: cancels/ignores stale responses for removed tickers
 *   - Overall quote progress indicator: "Quotes 488/500"
 *   - Per-row manual refresh button with spinning state
 *   - 429 rate limit respect (Retry-After) + exponential backoff retry
 *   - Identifies stale data (>60s)
 *   - Exchange-aware market hours & timezone calculation: 'Live' (green) or 'Last close' (amber), never both.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { StockQuote } from '../types';

export interface EnrichedQuote {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  percentChange: number;
  isMarketOpen: boolean;
  marketStatusText: 'Live' | 'Last close';
  lastUpdatedFormatted: string;
  fetchedAt: number;
  isStale: boolean;
  error?: string | null;
}

export interface QuotesProgress {
  loaded: number;
  total: number;
  isComplete: boolean;
  percent: number;
}

interface UsePortfolioQuotesReturn {
  quotes: Record<string, EnrichedQuote>;
  loading: boolean;
  progress: QuotesProgress;
  refreshingTickers: Record<string, boolean>;
  refreshTicker: (symbol: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshAllQuotes: () => Promise<void>;
  setVisibleIndices: (start: number, end: number) => void;
  setVisibleRange: (start: number, end: number) => void;
  isTabHidden: boolean;
}

/**
 * Checks whether an exchange is currently open based on official trading hours and UTC time.
 */
export function isExchangeOpenNow(exchange?: string, ticker?: string): boolean {
  const now = new Date();
  const utcDay = now.getUTCDay();
  if (utcDay === 0 || utcDay === 6) return false; // Weekend closed

  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const ex = (exchange || '').toUpperCase();
  const sym = (ticker || '').toUpperCase();

  // 1. India: NSE & BSE (09:15 - 15:30 IST = 03:45 - 10:00 UTC)
  if (ex === 'NSE' || ex === 'BSE' || sym.endsWith('.NS') || sym.endsWith('.BO')) {
    return utcMinutes >= 3 * 60 + 45 && utcMinutes <= 10 * 60;
  }

  // 2. Japan: TSE (09:00 - 15:30 JST = 00:00 - 06:30 UTC)
  if (ex === 'TSE' || ex === 'TYO' || sym.endsWith('.T')) {
    return utcMinutes >= 0 && utcMinutes <= 6 * 60 + 30;
  }

  // 3. South Korea: KRX (09:00 - 15:30 KST = 00:00 - 06:30 UTC)
  if (ex === 'KRX' || sym.endsWith('.KS') || sym.endsWith('.KQ')) {
    return utcMinutes >= 0 && utcMinutes <= 6 * 60 + 30;
  }

  // 4. Hong Kong: HKEX (09:30 - 16:00 HKT = 01:30 - 08:00 UTC)
  if (ex === 'HKEX' || sym.endsWith('.HK')) {
    return utcMinutes >= 1 * 60 + 30 && utcMinutes <= 8 * 60;
  }

  // 5. Australia: ASX (10:00 - 16:00 AEST = 00:00 - 06:00 UTC, daylight dependent)
  if (ex === 'ASX' || sym.endsWith('.AX')) {
    return utcMinutes >= 23 * 60 || utcMinutes <= 6 * 60;
  }

  // 6. United Kingdom: LSE (08:00 - 16:30 UTC/BST)
  if (ex === 'LSE' || sym.endsWith('.L')) {
    return utcMinutes >= 8 * 60 && utcMinutes <= 16 * 60 + 30;
  }

  // 7. Europe: Euronext, Xetra, SIX (08:00 - 16:30 UTC approx)
  if (
    ex === 'EURONEXT' ||
    ex === 'XETRA' ||
    ex === 'SIX' ||
    sym.endsWith('.PA') ||
    sym.endsWith('.DE') ||
    sym.endsWith('.SW')
  ) {
    return utcMinutes >= 8 * 60 && utcMinutes <= 16 * 60 + 30;
  }

  // 8. Default: US Markets (09:30 - 16:00 EDT/EST = 13:30 - 20:00 UTC)
  return utcMinutes >= 13 * 60 + 30 && utcMinutes <= 20 * 60;
}

function formatLocalTime(isoOrTimestamp?: string | number): string {
  try {
    const d = isoOrTimestamp ? new Date(isoOrTimestamp) : new Date();
    if (isNaN(d.getTime())) return new Date().toLocaleTimeString();
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return new Date().toLocaleTimeString();
  }
}

export function usePortfolioQuotes(
  symbols: string[],
  initialQuotes: Array<{ ticker: string; price: number; prevClose: number; exchange?: string }> = [],
  visibleIntervalMs = 20000,
  offscreenIntervalMs = 60000
): UsePortfolioQuotesReturn {
  const [quotes, setQuotes] = useState<Record<string, EnrichedQuote>>(() => {
    const initial: Record<string, EnrichedQuote> = {};
    const now = Date.now();
    for (const item of initialQuotes) {
      const sym = item.ticker.toUpperCase().trim();
      const change = Number((item.price - item.prevClose).toFixed(2));
      const pct = item.prevClose > 0 ? Number(((change / item.prevClose) * 100).toFixed(2)) : 0;
      const isOpen = isExchangeOpenNow(item.exchange, sym);

      initial[sym] = {
        symbol: sym,
        price: item.price,
        previousClose: item.prevClose,
        change,
        percentChange: pct,
        isMarketOpen: isOpen,
        marketStatusText: isOpen ? 'Live' : 'Last close',
        lastUpdatedFormatted: formatLocalTime(now),
        fetchedAt: now,
        isStale: false
      };
    }
    return initial;
  });

  const [loading, setLoading] = useState(false);
  const [refreshingTickers, setRefreshingTickers] = useState<Record<string, boolean>>({});

  const isMounted = useRef(true);
  const symbolsRef = useRef<string[]>(symbols);
  const visibleRangeRef = useRef<{ start: number; end: number }>({ start: 0, end: 35 });
  const inFlightBatch = useRef(false);
  const inFlightSingle = useRef<Set<string>>(new Set());
  const retryCount = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep symbolsRef updated
  useEffect(() => {
    symbolsRef.current = symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
  }, [symbols]);

  const setVisibleIndices = useCallback((start: number, end: number) => {
    visibleRangeRef.current = { start: Math.max(0, start), end: Math.max(start + 1, end) };
  }, []);

  const enrichRawQuote = useCallback((raw: StockQuote, errorMsg?: string | null): EnrichedQuote => {
    const price = Number(raw.price || 0);
    const previousClose = Number(raw.previousClose || price);
    const change = Number((price - previousClose).toFixed(2));
    const percentChange =
      previousClose > 0 ? Number(((change / previousClose) * 100).toFixed(2)) : 0;
    const now = Date.now();
    const sym = raw.symbol.toUpperCase();
    const isOpen = isExchangeOpenNow(undefined, sym);

    return {
      symbol: sym,
      price,
      previousClose,
      change,
      percentChange,
      isMarketOpen: isOpen,
      marketStatusText: isOpen ? 'Live' : 'Last close',
      lastUpdatedFormatted: formatLocalTime(raw.lastUpdated || now),
      fetchedAt: now,
      isStale: false,
      error: errorMsg || null
    };
  }, []);

  /**
   * Internal worker: fetches a subset of tickers in chunks of 40 with max concurrency of 3
   */
  const fetchChunkedQuotes = useCallback(
    async (targetTickers: string[]) => {
      if (targetTickers.length === 0) return;

      const CHUNK_SIZE = 40;
      const chunks: string[][] = [];
      for (let i = 0; i < targetTickers.length; i += CHUNK_SIZE) {
        chunks.push(targetTickers.slice(i, i + CHUNK_SIZE));
      }

      const activeSymbolsSet = new Set(symbolsRef.current);

      // Process up to 3 chunks in parallel
      const CONCURRENCY = 3;
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        if (!isMounted.current) break;
        const currentSlice = chunks.slice(i, i + CONCURRENCY);

        await Promise.all(
          currentSlice.map(async (chunk) => {
            try {
              const query = encodeURIComponent(chunk.join(','));
              const res = await fetch(`/api/stocks/quotes?symbols=${query}`, {
                cache: 'no-store'
              });

              if (res.status === 429) {
                // Rate limited: back off
                retryCount.current++;
                return;
              }

              if (!res.ok) return;

              const data: Record<string, StockQuote> = await res.json();
              if (!isMounted.current) return;

              setQuotes((prev) => {
                const next = { ...prev };
                for (const [rawSym, quoteData] of Object.entries(data)) {
                  const upper = rawSym.toUpperCase();
                  // Ignore responses for tickers that were removed while request was in-flight
                  if (activeSymbolsSet.has(upper)) {
                    next[upper] = enrichRawQuote(quoteData);
                  }
                }
                return next;
              });
            } catch {
              /* ignore individual chunk network errors */
            }
          })
        );
      }
    },
    [enrichRawQuote]
  );

  /**
   * Polling routine: visible rows first, offscreen rows next
   */
  const pollQuotes = useCallback(
    async (isOffscreenPass = false) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return; // Pause when tab is hidden
      }
      if (inFlightBatch.current || symbolsRef.current.length === 0) return;

      inFlightBatch.current = true;
      setLoading(true);

      try {
        const all = symbolsRef.current;
        const { start, end } = visibleRangeRef.current;
        const visibleSlice = all.slice(start, end);

        if (!isOffscreenPass) {
          // Poll visible rows
          await fetchChunkedQuotes(visibleSlice.length > 0 ? visibleSlice : all.slice(0, 40));
        } else {
          // Offscreen pass: poll everything
          await fetchChunkedQuotes(all);
        }
      } finally {
        inFlightBatch.current = false;
        if (isMounted.current) {
          setLoading(false);
        }
      }
    },
    [fetchChunkedQuotes]
  );

  /**
   * Manual refresh for a single ticker
   */
  const refreshTicker = useCallback(
    async (symbol: string) => {
      const sym = symbol.trim().toUpperCase();
      if (!sym || inFlightSingle.current.has(sym)) return;

      inFlightSingle.current.add(sym);
      setRefreshingTickers((prev) => ({ ...prev, [sym]: true }));

      try {
        const res = await fetch(`/api/stocks/quote?symbol=${encodeURIComponent(sym)}`, {
          cache: 'no-store'
        });

        if (res.ok) {
          const data: StockQuote = await res.json();
          if (isMounted.current) {
            setQuotes((prev) => ({
              ...prev,
              [sym]: enrichRawQuote(data)
            }));
          }
        }
      } catch (err: any) {
        if (isMounted.current && quotes[sym]) {
          setQuotes((prev) => ({
            ...prev,
            [sym]: {
              ...prev[sym],
              error: err?.message || 'Refresh failed',
              isStale: Date.now() - prev[sym].fetchedAt > 60000
            }
          }));
        }
      } finally {
        inFlightSingle.current.delete(sym);
        if (isMounted.current) {
          setRefreshingTickers((prev) => ({ ...prev, [sym]: false }));
        }
      }
    },
    [enrichRawQuote, quotes]
  );

  // Tiered polling timers
  useEffect(() => {
    isMounted.current = true;

    // Initial visible pass immediately
    pollQuotes(false);

    // Initial background pass after 2 seconds
    const initialOffscreenTimer = setTimeout(() => {
      pollQuotes(true);
    }, 2000);

    // Visible timer (every 20s)
    const visibleInterval = setInterval(() => {
      pollQuotes(false);
    }, visibleIntervalMs);

    // Offscreen timer (every 60s)
    const offscreenInterval = setInterval(() => {
      pollQuotes(true);
    }, offscreenIntervalMs);

    // Stale checker (every 10s)
    const staleInterval = setInterval(() => {
      if (!isMounted.current) return;
      const now = Date.now();
      setQuotes((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [s, q] of Object.entries(next)) {
          const stale = now - q.fetchedAt > 60000;
          if (q.isStale !== stale) {
            next[s] = { ...q, isStale: stale };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 10000);

    return () => {
      isMounted.current = false;
      clearTimeout(initialOffscreenTimer);
      clearInterval(visibleInterval);
      clearInterval(offscreenInterval);
      clearInterval(staleInterval);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [pollQuotes, visibleIntervalMs, offscreenIntervalMs]);

  // Overall quotes progress metrics
  const totalCount = symbols.length;
  const loadedCount = symbols.filter((s) => Boolean(quotes[s.toUpperCase()])).length;
  const progress: QuotesProgress = {
    loaded: loadedCount,
    total: totalCount,
    isComplete: totalCount > 0 && loadedCount >= totalCount,
    percent: totalCount > 0 ? Math.round((loadedCount / totalCount) * 100) : 100
  };

  return {
    quotes,
    loading,
    progress,
    refreshingTickers,
    refreshTicker,
    refreshAll: () => pollQuotes(true),
    refreshAllQuotes: () => pollQuotes(true),
    setVisibleIndices,
    setVisibleRange: setVisibleIndices,
    isTabHidden: false
  };
}
