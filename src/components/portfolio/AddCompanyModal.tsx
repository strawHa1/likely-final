/**
 * src/components/portfolio/AddCompanyModal.tsx
 *
 * Add Company modal powered by the full symbol search service (25,959 symbols + live fallback).
 * Features:
 *   - ARIA combobox with keyboard navigation (Up, Down, Enter, Esc)
 *   - Debounced search querying /api/symbols/search with fallback to /api/symbols/lookup
 *   - Live preview of native price, base currency value, and resulting portfolio allocation %
 *   - Rebalance mode helpers: Exact Shares, Target Value in Base Currency, or Target %
 *   - Duplicate ticker validation with offer to edit existing holding
 *   - Rejects zero, negative, and NaN inputs; blocks double submission
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Search,
  PlusCircle,
  AlertTriangle,
  Loader2,
  DollarSign,
  PieChart as PieIcon,
  CheckCircle2,
  TrendingUp,
  Sliders,
  Building2,
  Globe,
  Info
} from 'lucide-react';
import { PortfolioHolding } from '../../types';
import { MAX_PORTFOLIO_HOLDINGS } from '../../lib/portfolioReducer';
import { convertCurrency, formatMoney, formatPercentSafe } from '../../lib/fxService';
import { computeRiskScore } from '../../lib/portfolioRiskScorer';

interface AddCompanyModalProps {
  currentHoldings: PortfolioHolding[];
  totalPortfolioValue: number;
  baseCurrency?: string;
  fxRates?: Record<string, number>;
  isOpen: boolean;
  onClose: () => void;
  onAdd: (holding: {
    ticker: string;
    companyName: string;
    exchange: string;
    country: string;
    currency: string;
    sector: string;
    shares: number;
    avgCost?: number;
  }) => void;
  onSelectExistingToEdit?: (ticker: string) => void;
}

interface StockOption {
  ticker: string;
  name: string;
  sector: string;
  exchange: string;
  country: string;
  currency: string;
  price: number;
  riskScore: number;
  isEstimated?: boolean;
  isLiveSearch?: boolean;
}

type InputMode = 'shares' | 'dollars' | 'percent';

export const AddCompanyModal: React.FC<AddCompanyModalProps> = ({
  currentHoldings,
  totalPortfolioValue,
  baseCurrency = 'USD',
  fxRates,
  isOpen,
  onClose,
  onAdd,
  onSelectExistingToEdit
}) => {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedStock, setSelectedStock] = useState<StockOption | null>(null);
  const [activeHighlightIndex, setActiveHighlightIndex] = useState(-1);
  const [showComboboxMenu, setShowComboboxMenu] = useState(false);

  // Input mode: 'shares' | 'dollars' | 'percent'
  const [inputMode, setInputMode] = useState<InputMode>('shares');
  const [sharesInput, setSharesInput] = useState('100');
  const [dollarsInput, setDollarsInput] = useState('10000');
  const [percentInput, setPercentInput] = useState('5');
  const [avgCostInput, setAvgCostInput] = useState('');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Focus trap & keyboard Esc handling
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 60);
      setQuery('');
      setSelectedStock(null);
      setValidationError(null);
      setSearchError(null);
      setSearchResults([]);
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced search with live fallback
  const performSearch = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSearching(true);
    setSearchError(null);

    try {
      // 1. Local symbol database search
      const response = await fetch(`/api/symbols/search?q=${encodeURIComponent(q)}&limit=12`, {
        signal: controller.signal
      });

      let items: any[] = [];
      if (response.ok) {
        const data = await response.json();
        items = data.results || [];
      }

      // 2. If no local matches, call live lookup fallback
      if (items.length === 0) {
        const lookupRes = await fetch(`/api/symbols/lookup?q=${encodeURIComponent(q)}`, {
          signal: controller.signal
        });
        if (lookupRes.ok) {
          const lookupData = await lookupRes.json();
          items = lookupData.results || [];
        }
      }

      const options: StockOption[] = items.map((r: any) => {
        const sym = (r.symbol || '').toUpperCase().trim();
        const price = r.quote?.price || (r.currency === 'JPY' ? 2500 : r.currency === 'KRW' ? 50000 : 120);
        return {
          ticker: sym,
          name: r.name || sym,
          sector: r.sector || 'General',
          exchange: r.exchange || 'NASDAQ',
          country: r.country || 'US',
          currency: r.currency || 'USD',
          price,
          riskScore: computeRiskScore(sym, r.quote, r.sector).score,
          isEstimated: !r.quote?.price,
          isLiveSearch: Boolean(r.isLiveSearch)
        };
      });

      if (options.length > 0) {
        setSearchResults(options);
        setShowComboboxMenu(true);
        setActiveHighlightIndex(0);
      } else {
        setSearchResults([]);
        setSearchError(`No listed company found matching "${q}". Verify the ticker or exchange suffix (e.g. .NS, .BO, .L, .T).`);
        setShowComboboxMenu(false);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setSearchError('Search failed. Please try again.');
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setValidationError(null);
    setSearchError(null);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      performSearch(val);
    }, 250);
  };

  const handleSelectOption = (stock: StockOption) => {
    setSelectedStock(stock);
    setQuery(`${stock.ticker} — ${stock.name}`);
    setShowComboboxMenu(false);
    setSearchError(null);
    setValidationError(null);

    if (stock.price > 0) {
      setAvgCostInput(stock.price.toFixed(2));
      const initShares = 100;
      setSharesInput(String(initShares));

      const converted = convertCurrency(initShares * stock.price, stock.currency, baseCurrency, fxRates);
      const baseVal = converted ? converted.value : initShares * stock.price;
      setDollarsInput(baseVal.toFixed(0));

      const newTotal = totalPortfolioValue + baseVal;
      const pct = newTotal > 0 ? (baseVal / newTotal) * 100 : 100;
      setPercentInput(pct.toFixed(1));
    }
  };

  // Keyboard navigation inside combobox
  const handleKeyDownCombobox = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showComboboxMenu || searchResults.length === 0) {
      if (e.key === 'ArrowDown' && searchResults.length > 0) {
        setShowComboboxMenu(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveHighlightIndex((prev) => (prev + 1) % searchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveHighlightIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeHighlightIndex >= 0 && activeHighlightIndex < searchResults.length) {
        handleSelectOption(searchResults[activeHighlightIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowComboboxMenu(false);
    }
  };

  // Base price per share for preview
  const basePricePerShare = (() => {
    if (!selectedStock || selectedStock.price <= 0) return 0;
    const conv = convertCurrency(selectedStock.price, selectedStock.currency, baseCurrency, fxRates);
    return conv ? conv.value : selectedStock.price;
  })();

  // Effective shares calculation
  const effectiveShares = (() => {
    if (!selectedStock || selectedStock.price <= 0) return 0;
    if (inputMode === 'shares') {
      const parsed = parseFloat(sharesInput);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }
    if (inputMode === 'dollars') {
      const parsedDollars = parseFloat(dollarsInput);
      if (Number.isFinite(parsedDollars) && parsedDollars > 0 && basePricePerShare > 0) {
        return Number((parsedDollars / basePricePerShare).toFixed(4));
      }
      return 0;
    }
    if (inputMode === 'percent') {
      const parsedPct = parseFloat(percentInput);
      if (Number.isFinite(parsedPct) && parsedPct > 0 && parsedPct < 100 && basePricePerShare > 0) {
        if (totalPortfolioValue <= 0) return 100;
        const targetVal = totalPortfolioValue * (parsedPct / (100 - parsedPct));
        return Number((targetVal / basePricePerShare).toFixed(4));
      }
      return 0;
    }
    return 0;
  })();

  const nativePositionValue = selectedStock ? effectiveShares * selectedStock.price : 0;
  const basePositionValue = effectiveShares * basePricePerShare;
  const newTotalPortfolioValue = totalPortfolioValue + basePositionValue;
  const resultingAllocationPct =
    newTotalPortfolioValue > 0 ? (basePositionValue / newTotalPortfolioValue) * 100 : 0;

  // Duplicate check
  const existingHolding = selectedStock
    ? currentHoldings.find((h) => h.ticker.toUpperCase() === selectedStock.ticker.toUpperCase())
    : null;

  const isLimitReached = currentHoldings.length >= MAX_PORTFOLIO_HOLDINGS;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (isLimitReached) {
      setValidationError(`Portfolio limit reached (maximum ${MAX_PORTFOLIO_HOLDINGS.toLocaleString()} holdings).`);
      return;
    }

    if (!selectedStock) {
      setValidationError('Please search and select a company from the list.');
      return;
    }

    if (existingHolding) {
      setValidationError(`Ticker "${selectedStock.ticker}" is already in your portfolio. Edit its position instead.`);
      return;
    }

    if (effectiveShares <= 0 || !Number.isFinite(effectiveShares)) {
      setValidationError('Please enter a valid share quantity greater than 0.');
      return;
    }

    const avgCostNum = parseFloat(avgCostInput);
    const validAvgCost = Number.isFinite(avgCostNum) && avgCostNum > 0 ? avgCostNum : undefined;

    setIsSubmitting(true);
    try {
      onAdd({
        ticker: selectedStock.ticker,
        companyName: selectedStock.name,
        exchange: selectedStock.exchange,
        country: selectedStock.country,
        currency: selectedStock.currency,
        sector: selectedStock.sector,
        shares: Number(effectiveShares.toFixed(4)),
        ...(validAvgCost !== undefined ? { avgCost: validAvgCost } : {})
      });
      onClose();
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to add company.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-company-title"
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] rounded-2xl shadow-2xl overflow-hidden text-slate-800 dark:text-slate-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#232A3D]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="add-company-title" className="text-base font-bold text-slate-900 dark:text-white">
                Add Company to Portfolio
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                Search global equities across 40+ exchanges with real-time currency conversion
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close add company modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#161B2C] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Search Box / Combobox */}
          <div className="relative">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
              Search Company or Ticker
            </label>
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={handleQueryChange}
                onKeyDown={handleKeyDownCombobox}
                placeholder="Type ticker, name, or country (e.g. RELIANCE, Toyota, SAP, BMW, AAPL)..."
                role="combobox"
                aria-expanded={showComboboxMenu}
                aria-autocomplete="list"
                aria-controls="combobox-options-list"
                className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-slate-50 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D] text-slate-900 dark:text-white text-xs font-mono placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              {isSearching && (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
              )}
            </div>

            {/* Combobox Dropdown Results */}
            {showComboboxMenu && searchResults.length > 0 && (
              <ul
                id="combobox-options-list"
                role="listbox"
                className="absolute z-30 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl bg-white dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D] shadow-xl py-1 divide-y divide-slate-100 dark:divide-[#232A3D]"
              >
                {searchResults.map((stock, idx) => {
                  const isHighlighted = idx === activeHighlightIndex;
                  return (
                    <li
                      key={stock.ticker}
                      role="option"
                      aria-selected={isHighlighted}
                      onClick={() => handleSelectOption(stock)}
                      onMouseEnter={() => setActiveHighlightIndex(idx)}
                      className={`px-3 py-2 cursor-pointer transition-colors flex items-center justify-between text-xs ${
                        isHighlighted
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-slate-50 dark:hover:bg-[#1D2436] text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono font-bold">{stock.ticker}</span>
                        <span className="truncate opacity-90">{stock.name}</span>
                        {stock.isLiveSearch && (
                          <span className="px-1 py-0.2 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300">
                            Live
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 font-mono text-[11px] opacity-80">
                        <span>{stock.exchange}</span>
                        <span>&bull;</span>
                        <span>{formatMoney(stock.price, stock.currency)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {searchError && (
              <p className="mt-1.5 text-xs text-rose-500 font-semibold">{searchError}</p>
            )}
          </div>

          {/* Selected Stock Overview Card */}
          {selectedStock && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D] space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                      ${selectedStock.ticker}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                      {selectedStock.name}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {selectedStock.sector} &bull; {selectedStock.exchange} ({selectedStock.country})
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {formatMoney(selectedStock.price, selectedStock.currency)}
                  </div>
                  {selectedStock.currency !== baseCurrency && (
                    <div className="text-[10px] text-slate-400">
                      ≈ {formatMoney(basePricePerShare, baseCurrency)}
                    </div>
                  )}
                </div>
              </div>

              {/* Duplicate Warning & Quick Link */}
              {existingHolding && (
                <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between">
                  <span className="font-semibold">
                    Already holding {existingHolding.shares} shares of ${selectedStock.ticker}
                  </span>
                  {onSelectExistingToEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onSelectExistingToEdit(selectedStock.ticker);
                      }}
                      className="font-bold underline text-blue-600 dark:text-blue-400 ml-2"
                    >
                      Edit Holding →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sizing Mode Tabs */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
              Position Sizing Method
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D] rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setInputMode('shares')}
                className={`py-1.5 rounded-lg transition-all ${
                  inputMode === 'shares'
                    ? 'bg-white dark:bg-[#0F1420] text-blue-600 dark:text-blue-400 shadow-sm font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Exact Shares
              </button>
              <button
                type="button"
                onClick={() => setInputMode('dollars')}
                className={`py-1.5 rounded-lg transition-all ${
                  inputMode === 'dollars'
                    ? 'bg-white dark:bg-[#0F1420] text-blue-600 dark:text-blue-400 shadow-sm font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Target Value ({baseCurrency})
              </button>
              <button
                type="button"
                onClick={() => setInputMode('percent')}
                className={`py-1.5 rounded-lg transition-all ${
                  inputMode === 'percent'
                    ? 'bg-white dark:bg-[#0F1420] text-blue-600 dark:text-blue-400 shadow-sm font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Target Allocation (%)
              </button>
            </div>
          </div>

          {/* Sizing Inputs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {inputMode === 'shares' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Share Quantity
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  value={sharesInput}
                  onChange={(e) => setSharesInput(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-slate-50 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            {inputMode === 'dollars' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Target Value in {baseCurrency}
                </label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  value={dollarsInput}
                  onChange={(e) => setDollarsInput(e.target.value)}
                  placeholder="e.g. 10000"
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-slate-50 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            {inputMode === 'percent' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Target Allocation (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={percentInput}
                  onChange={(e) => setPercentInput(e.target.value)}
                  placeholder="e.g. 5"
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-slate-50 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Average Cost Basis (Optional) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Average Cost ({selectedStock?.currency || baseCurrency} / sh, optional)
              </label>
              <input
                type="number"
                step="any"
                min="0.0001"
                placeholder={selectedStock ? selectedStock.price.toFixed(2) : 'Optional'}
                value={avgCostInput}
                onChange={(e) => setAvgCostInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-slate-50 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Live Preview Panel */}
          {selectedStock && effectiveShares > 0 && (
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs font-mono space-y-1.5">
              <div className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider">
                Position Projection Preview
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-slate-800 dark:text-slate-200">
                <div>
                  <div className="text-[10px] text-slate-400">Computed Shares</div>
                  <div className="font-bold text-sm">{effectiveShares.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Position Value ({baseCurrency})</div>
                  <div className="font-bold text-sm">{formatMoney(basePositionValue, baseCurrency)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Resulting Weight</div>
                  <div className="font-bold text-sm text-blue-600 dark:text-blue-400">
                    {formatPercentSafe(resultingAllocationPct, 1)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Validation Error Banner */}
          {validationError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-[#232A3D]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#161B2C] hover:bg-slate-200 dark:hover:bg-[#232A3D] text-slate-700 dark:text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedStock || Boolean(existingHolding) || isLimitReached}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md transition-all active:scale-95 flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Adding...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add to Portfolio</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
