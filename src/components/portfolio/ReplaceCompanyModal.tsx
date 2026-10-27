import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X,
  Search,
  ArrowRightLeft,
  AlertTriangle,
  Loader2,
  DollarSign,
  Sliders,
  Building2,
  CheckCircle2,
  Globe,
  Coins
} from 'lucide-react';
import { PortfolioHolding } from '../../types';
import { ComputedHolding, formatPercent } from '../../utils/portfolioMath';
import { convertCurrency, formatMoney, FALLBACK_RATES_TO_USD } from '../../lib/fxService';

export interface ReplaceCompanyModalProps {
  currentHolding: PortfolioHolding | ComputedHolding | null;
  currentHoldings: PortfolioHolding[];
  baseCurrency?: string;
  fxRates?: Record<string, number>;
  totalPortfolioValue: number;
  isOpen: boolean;
  onClose: () => void;
  onReplace: (params: {
    oldTicker: string;
    newTicker: string;
    newCompanyName: string;
    newExchange?: string;
    newCountry?: string;
    newCurrency?: string;
    newSector?: string;
    newPrice?: number;
    mode: 'same-value' | 'same-shares';
    oldBaseValue?: number;
    newBasePrice?: number;
  }) => void;
}

interface StockSearchResult {
  ticker: string;
  name: string;
  sector: string;
  exchange: string;
  country: string;
  currency: string;
  price?: number;
  type?: string;
}

type ReplaceMode = 'same-value' | 'same-shares';

export const ReplaceCompanyModal: React.FC<ReplaceCompanyModalProps> = ({
  currentHolding,
  currentHoldings,
  baseCurrency = 'USD',
  fxRates = FALLBACK_RATES_TO_USD,
  totalPortfolioValue,
  isOpen,
  onClose,
  onReplace
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null);
  const [selectedQuotePrice, setSelectedQuotePrice] = useState<number>(0);
  const [selectedQuoteCurrency, setSelectedQuoteCurrency] = useState<string>('USD');
  const [replaceMode, setReplaceMode] = useState<ReplaceMode>('same-value');

  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Combobox navigation
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  // Debounce search input by 250ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Reset state when modal opens or holding changes
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setDebouncedQuery('');
      setSelectedStock(null);
      setSelectedQuotePrice(0);
      setSelectedQuoteCurrency('USD');
      setReplaceMode('same-value');
      setErrorMessage(null);
      setIsSubmitting(false);
      setActiveIndex(-1);
      setIsDropdownOpen(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen, currentHolding]);

  // Search API
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 1) {
      setSearchResults([]);
      setIsLoadingSearch(false);
      setIsDropdownOpen(false);
      return;
    }

    let isCancelled = false;
    setIsLoadingSearch(true);
    setErrorMessage(null);

    const performSearch = async () => {
      try {
        const res = await fetch(`/api/symbols/search?q=${encodeURIComponent(debouncedQuery)}&limit=15`);
        if (res.ok && !isCancelled) {
          const data = await res.json();
          const rawItems = Array.isArray(data) ? data : data.results || [];
          const items: StockSearchResult[] = rawItems.map((item: any) => ({
            ticker: String(item.symbol || item.ticker || '').toUpperCase(),
            name: item.name || item.companyName || item.symbol,
            sector: item.sector || 'General',
            exchange: item.exchange || 'NASDAQ',
            country: item.country || 'US',
            currency: item.currency || (item.exchange === 'NSE' || item.exchange === 'BSE' ? 'INR' : 'USD'),
            type: item.type || 'Common Stock',
            price: typeof item.price === 'number' && item.price > 0 ? item.price : undefined
          }));

          if (items.length > 0) {
            setSearchResults(items);
            setIsDropdownOpen(true);
            setIsLoadingSearch(false);
            return;
          }
        }

        // If no results, attempt live lookup
        if (!isCancelled && debouncedQuery.length >= 2) {
          const lookupRes = await fetch(`/api/symbols/lookup?symbol=${encodeURIComponent(debouncedQuery)}`);
          if (lookupRes.ok && !isCancelled) {
            const ldata = await lookupRes.json();
            if (ldata && ldata.symbol) {
              setSearchResults([
                {
                  ticker: String(ldata.symbol).toUpperCase(),
                  name: ldata.name || ldata.symbol,
                  sector: ldata.sector || 'General',
                  exchange: ldata.exchange || 'NASDAQ',
                  country: ldata.country || 'US',
                  currency: ldata.currency || 'USD',
                  price: typeof ldata.price === 'number' && ldata.price > 0 ? ldata.price : undefined,
                  type: ldata.type || 'Common Stock'
                }
              ]);
              setIsDropdownOpen(true);
              setIsLoadingSearch(false);
              return;
            }
          }
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('[ReplaceCompanyModal] Search failed:', err);
        }
      }

      if (!isCancelled) {
        setSearchResults([]);
        setIsLoadingSearch(false);
      }
    };

    performSearch();

    return () => {
      isCancelled = true;
    };
  }, [debouncedQuery]);

  // Select stock and fetch live quote
  const handleSelectStock = useCallback(
    async (stock: StockSearchResult) => {
      const sym = stock.ticker.toUpperCase();

      if (currentHolding && sym === currentHolding.ticker.toUpperCase()) {
        setErrorMessage(`$${sym} is currently the position you are replacing. Choose a different company.`);
        return;
      }

      const existsElsewhere = currentHoldings.some(
        (h) =>
          h.ticker.toUpperCase() === sym &&
          (!currentHolding || h.ticker.toUpperCase() !== currentHolding.ticker.toUpperCase())
      );
      if (existsElsewhere) {
        setErrorMessage(`$${sym} is already in your portfolio. Select a different company.`);
        return;
      }

      setIsDropdownOpen(false);
      setIsLoadingQuote(true);
      setErrorMessage(null);
      setSelectedStock(stock);

      try {
        const quoteRes = await fetch(`/api/stocks/quote?symbol=${encodeURIComponent(sym)}`);
        if (quoteRes.ok) {
          const quoteData = await quoteRes.json();
          const price = typeof quoteData.price === 'number' && quoteData.price > 0
            ? quoteData.price
            : typeof quoteData.previousClose === 'number' && quoteData.previousClose > 0
            ? quoteData.previousClose
            : stock.price || 100;
          const cur = quoteData.currency || stock.currency || 'USD';

          setSelectedQuotePrice(price);
          setSelectedQuoteCurrency(cur);
        } else {
          setSelectedQuotePrice(stock.price || 100);
          setSelectedQuoteCurrency(stock.currency || 'USD');
        }
      } catch {
        setSelectedQuotePrice(stock.price || 100);
        setSelectedQuoteCurrency(stock.currency || 'USD');
      } finally {
        setIsLoadingQuote(false);
      }

      setSearchQuery(`${sym} — ${stock.name}`);
    },
    [currentHolding, currentHoldings]
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen || searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < searchResults.length) {
        handleSelectStock(searchResults[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  // Calculations for before / after preview
  const preview = useMemo(() => {
    if (!currentHolding) return null;

    // Computed holding may already have positionValue in baseCurrency
    const isComputed = 'positionValue' in currentHolding && typeof (currentHolding as any).positionValue === 'number';
    let oldBaseValue = 0;
    let oldNativePrice = 0;

    if (isComputed) {
      const comp = currentHolding as ComputedHolding;
      oldBaseValue = comp.basePositionValue;
      oldNativePrice = comp.price;
    } else {
      oldNativePrice = currentHolding.avgCost || 100;
      const converted = convertCurrency(
        oldNativePrice * currentHolding.shares,
        currentHolding.currency || 'USD',
        baseCurrency,
        fxRates
      );
      oldBaseValue = converted !== null ? converted.value : oldNativePrice * currentHolding.shares;
    }

    const oldShares = currentHolding.shares;
    const oldAlloc = totalPortfolioValue > 0 ? (oldBaseValue / totalPortfolioValue) * 100 : 0;

    if (!selectedStock || selectedQuotePrice <= 0) {
      return {
        old: {
          ticker: currentHolding.ticker,
          name: currentHolding.companyName || currentHolding.ticker,
          exchange: currentHolding.exchange || 'NASDAQ',
          currency: currentHolding.currency || 'USD',
          shares: oldShares,
          price: oldNativePrice,
          value: oldBaseValue,
          allocationPct: oldAlloc
        },
        next: null
      };
    }

    // Convert new stock's price to baseCurrency
    const convertedNewPrice = convertCurrency(
      selectedQuotePrice,
      selectedQuoteCurrency,
      baseCurrency,
      fxRates
    );
    const newBasePricePerShare = convertedNewPrice !== null && convertedNewPrice.value > 0 ? convertedNewPrice.value : selectedQuotePrice;

    let nextShares: number;
    let nextBaseValue: number;

    if (replaceMode === 'same-value') {
      nextShares = Math.max(1, Math.round(oldBaseValue / newBasePricePerShare));
      nextBaseValue = nextShares * newBasePricePerShare;
    } else {
      nextShares = oldShares;
      nextBaseValue = nextShares * newBasePricePerShare;
    }

    const nextTotalValue = Math.max(1, totalPortfolioValue - oldBaseValue + nextBaseValue);
    const nextAlloc = (nextBaseValue / nextTotalValue) * 100;

    return {
      old: {
        ticker: currentHolding.ticker,
        name: currentHolding.companyName || currentHolding.ticker,
        exchange: currentHolding.exchange || 'NASDAQ',
        currency: currentHolding.currency || 'USD',
        shares: oldShares,
        price: oldNativePrice,
        value: oldBaseValue,
        allocationPct: oldAlloc
      },
      next: {
        ticker: selectedStock.ticker,
        name: selectedStock.name,
        exchange: selectedStock.exchange,
        currency: selectedQuoteCurrency,
        shares: nextShares,
        price: selectedQuotePrice,
        basePrice: newBasePricePerShare,
        value: nextBaseValue,
        allocationPct: nextAlloc,
        sector: selectedStock.sector,
        country: selectedStock.country
      }
    };
  }, [
    currentHolding,
    selectedStock,
    selectedQuotePrice,
    selectedQuoteCurrency,
    replaceMode,
    totalPortfolioValue,
    baseCurrency,
    fxRates
  ]);

  // Submit replacement
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHolding || !selectedStock || isSubmitting || !preview?.next) return;

    if (selectedStock.ticker.toUpperCase() === currentHolding.ticker.toUpperCase()) {
      setErrorMessage('Cannot replace with the same ticker.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      onReplace({
        oldTicker: currentHolding.ticker,
        newTicker: selectedStock.ticker,
        newCompanyName: selectedStock.name,
        newExchange: selectedStock.exchange,
        newCountry: selectedStock.country,
        newCurrency: selectedQuoteCurrency,
        newSector: selectedStock.sector,
        newPrice: selectedQuotePrice,
        mode: replaceMode,
        oldBaseValue: preview.old.value,
        newBasePrice: preview.next.basePrice
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to replace company.');
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !currentHolding) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replace-modal-title"
    >
      <div className="bg-[#0B0F17] border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-[#0F1420]/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 id="replace-modal-title" className="text-base font-bold text-white flex items-center gap-2">
                <span>Replace Holding</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {currentHolding.ticker}
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Swap with an international or domestic company
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close replace dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Current Position Summary */}
          <div className="p-4 rounded-xl bg-[#121826] border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                Current Position to Replace
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {currentHolding.exchange || 'NASDAQ'} &bull; {currentHolding.country || 'US'}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <div>
                <span className="font-bold text-sm text-white">
                  {currentHolding.companyName}
                </span>
                <span className="ml-2 font-mono text-xs font-bold text-blue-400">
                  ${currentHolding.ticker}
                </span>
              </div>
              <span className="font-mono font-bold text-xs text-white">
                {formatMoney(preview?.old.value || 0, baseCurrency)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400 font-mono">
              <span>{currentHolding.shares} shares</span>
              <span>&bull;</span>
              <span>
                {formatMoney(preview?.old.price || 0, currentHolding.currency || 'USD')} native
              </span>
              <span>&bull;</span>
              <span>{formatPercent(preview?.old.allocationPct || 0, 1)} allocation</span>
            </div>
          </div>

          {/* Search New Replacement Company */}
          <div className="space-y-1.5">
            <label
              htmlFor="replace-stock-search"
              className="block text-xs font-bold text-slate-300"
            >
              Search Replacement Company
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={inputRef}
                id="replace-stock-search"
                type="text"
                role="combobox"
                aria-expanded={isDropdownOpen}
                aria-autocomplete="list"
                aria-controls="replace-stock-listbox"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (selectedStock && e.target.value !== selectedStock.ticker) {
                    setSelectedStock(null);
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search symbol, brand, or name (e.g. MSFT, ASML, RELIANCE.NS, BMW.DE)..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#121826] border border-slate-800 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {isLoadingSearch && (
                <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-400" />
              )}
            </div>

            {/* Combobox Dropdown Results */}
            {isDropdownOpen && searchResults.length > 0 && (
              <ul
                id="replace-stock-listbox"
                ref={dropdownRef}
                role="listbox"
                className="mt-1 max-h-56 overflow-y-auto rounded-xl bg-[#0F1420] border border-slate-800 shadow-2xl divide-y divide-slate-800/80 z-20"
              >
                {searchResults.map((stock, idx) => {
                  const isSelected = activeIndex === idx;
                  const isCurrent = currentHolding.ticker.toUpperCase() === stock.ticker.toUpperCase();
                  const isOther = currentHoldings.some(
                    (h) =>
                      h.ticker.toUpperCase() === stock.ticker.toUpperCase() &&
                      h.ticker.toUpperCase() !== currentHolding.ticker.toUpperCase()
                  );

                  return (
                    <li
                      key={stock.ticker}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => !isCurrent && !isOther && handleSelectStock(stock)}
                      className={`p-3 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        isCurrent || isOther
                          ? 'opacity-40 cursor-not-allowed bg-slate-900/40'
                          : isSelected
                          ? 'bg-blue-600/15 text-blue-300'
                          : 'hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <div>
                          <div className="font-bold font-mono text-white flex items-center gap-2">
                            <span>{stock.ticker}</span>
                            <span className="font-sans font-normal text-slate-400 truncate max-w-xs">
                              {stock.name}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                              {stock.exchange}
                            </span>
                            <span>{stock.country}</span>
                            <span>&bull;</span>
                            <span>{stock.currency}</span>
                            <span>&bull;</span>
                            <span>{stock.sector}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        {stock.price ? (
                          <div className="font-bold text-white">
                            {formatMoney(stock.price, stock.currency)}
                          </div>
                        ) : null}
                        {isCurrent ? (
                          <div className="text-[10px] text-amber-400 font-sans">Current position</div>
                        ) : isOther ? (
                          <div className="text-[10px] text-rose-400 font-sans">Already held</div>
                        ) : (
                          <div className="text-[10px] text-emerald-400 font-sans">Available</div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Capital Reallocation Strategy */}
          {selectedStock && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300">
                Capital Reallocation Strategy
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Mode 1: Keep Same Dollar Value */}
                <label
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5 ${
                    replaceMode === 'same-value'
                      ? 'bg-blue-500/10 border-blue-500/60 text-blue-200 ring-1 ring-blue-500/50'
                      : 'bg-[#121826] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="replace-mode"
                    value="same-value"
                    checked={replaceMode === 'same-value'}
                    onChange={() => setReplaceMode('same-value')}
                    className="mt-0.5 text-blue-500 focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-bold flex items-center gap-1 text-white">
                      <DollarSign className="w-3.5 h-3.5 text-blue-400" />
                      Keep Same Dollar Value
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                      Reinvest 100% of the {formatMoney(preview?.old.value || 0, baseCurrency)} value into{' '}
                      <span className="font-mono text-white">{selectedStock.ticker}</span> (
                      {preview?.next?.shares} shares).
                    </p>
                  </div>
                </label>

                {/* Mode 2: Keep Same Share Count */}
                <label
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5 ${
                    replaceMode === 'same-shares'
                      ? 'bg-blue-500/10 border-blue-500/60 text-blue-200 ring-1 ring-blue-500/50'
                      : 'bg-[#121826] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="replace-mode"
                    value="same-shares"
                    checked={replaceMode === 'same-shares'}
                    onChange={() => setReplaceMode('same-shares')}
                    className="mt-0.5 text-blue-500 focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-bold flex items-center gap-1 text-white">
                      <Sliders className="w-3.5 h-3.5 text-purple-400" />
                      Keep Same Share Count
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                      Purchase exactly {currentHolding.shares} shares of{' '}
                      <span className="font-mono text-white">{selectedStock.ticker}</span> (
                      {formatMoney(preview?.next?.value || 0, baseCurrency)} in {baseCurrency}).
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Allocation & Position Preview: Before vs. After */}
          {selectedStock && preview?.next && (
            <div className="p-4 rounded-xl bg-[#121826] border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                  Allocation Impact Preview ({baseCurrency})
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 font-mono">
                  <CheckCircle2 className="w-3 h-3" />
                  Live Quote: {formatMoney(selectedQuotePrice, selectedQuoteCurrency)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                {/* Before Column */}
                <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800 space-y-1">
                  <span className="text-[9px] font-bold uppercase text-slate-400">Before (Current)</span>
                  <div className="font-bold text-white">${preview.old.ticker}</div>
                  <div className="text-[11px] text-slate-400">{preview.old.shares} shares</div>
                  <div className="text-[11px] text-slate-300">{formatMoney(preview.old.value, baseCurrency)}</div>
                  <div className="text-xs font-black text-slate-300 pt-1 border-t border-slate-800">
                    {formatPercent(preview.old.allocationPct, 1)} of portfolio
                  </div>
                </div>

                {/* After Column */}
                <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-500/30 space-y-1">
                  <span className="text-[9px] font-bold uppercase text-blue-400">After (Projected)</span>
                  <div className="font-bold text-blue-300">${preview.next.ticker}</div>
                  <div className="text-[11px] text-slate-300">{preview.next.shares} shares</div>
                  <div className="text-[11px] text-emerald-400 font-bold">
                    {formatMoney(preview.next.value, baseCurrency)}
                  </div>
                  <div className="text-xs font-black text-blue-300 pt-1 border-t border-blue-500/20">
                    {formatPercent(preview.next.allocationPct, 1)} of portfolio
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800 bg-[#0F1420]/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedStock || isSubmitting || isLoadingQuote}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 active:scale-95"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Replacing...</span>
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Confirm Replace</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
