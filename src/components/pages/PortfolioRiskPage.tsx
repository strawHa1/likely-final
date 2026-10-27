import React, { useState, useEffect, useRef, useMemo, useCallback, useReducer } from 'react';
import {
  Briefcase,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Building2,
  Sliders,
  RefreshCw,
  FileSpreadsheet,
  PlusCircle,
  X,
  Loader2,
  Trash2,
  ArrowRightLeft,
  RotateCcw,
  CheckCircle2,
  Undo2,
  Search,
  Filter,
  Layers,
  ChevronDown,
  ArrowUpDown,
  Coins,
  Globe
} from 'lucide-react';
import { CompanyRisk, PortfolioHolding } from '../../types';
import {
  portfolioReducer,
  initialPortfolioState,
  TOLERANCE_STORAGE_KEY_V2,
  MAX_PORTFOLIO_HOLDINGS
} from '../../lib/portfolioReducer';
import { getTickerColor, getSectorColor, OTHER_GRAY } from '../../utils/portfolioColors';
import {
  ComputedHolding,
  computePortfolioHoldings,
  computeTotalPortfolioValue,
  computePortfolioDayChangeDollar,
  computePortfolioDayChangePct,
  getRiskSignalBand,
  isPositionFlagged,
  getFlaggedPositions,
  computeCompositeTailRiskScore,
  generateHedgeRecommendation,
  formatPercent,
  computeAllocationGrouping
} from '../../utils/portfolioMath';
import {
  SUPPORTED_CURRENCIES,
  CurrencyMeta,
  formatMoney,
  convertCurrency,
  FALLBACK_RATES_TO_USD,
  fetchLiveFxRates,
  loadBaseCurrency,
  saveBaseCurrency
} from '../../lib/fxService';
import { usePortfolioQuotes } from '../../hooks/usePortfolioQuotes';
import { useVirtualScroll } from '../../hooks/useVirtualScroll';
import { RelativeTimeAgo } from '../portfolio/RelativeTimeAgo';
import { PortfolioDonutChart, DonutSliceItem, DonutGroupBy } from '../portfolio/PortfolioDonutChart';
import { PositionReviewModal } from '../portfolio/PositionReviewModal';
import { HedgePlanModal } from '../portfolio/HedgePlanModal';
import { AddCompanyModal } from '../portfolio/AddCompanyModal';
import { ReplaceCompanyModal } from '../portfolio/ReplaceCompanyModal';
import { EditPortfolioDrawer } from '../portfolio/EditPortfolioDrawer';
import { generatePortfolioRiskReportPDF } from '../../utils/portfolioReportGenerator';

interface PortfolioRiskPageProps {
  onNavigate: (path: string) => void;
  companies: CompanyRisk[];
  userRiskTolerance?: number;
  initialReviewTicker?: string;
  initialAction?: string;
}

type SortField =
  | 'ticker'
  | 'name'
  | 'allocation'
  | 'value'
  | 'price'
  | 'cost'
  | 'pnl'
  | 'dayChange'
  | 'risk'
  | 'shares';

type SortDirection = 'asc' | 'desc';
type GroupByOption = 'none' | 'sector' | 'country' | 'exchange';

export const PortfolioRiskPage: React.FC<PortfolioRiskPageProps> = ({
  onNavigate,
  companies,
  userRiskTolerance: defaultTolerance = 55,
  initialReviewTicker = '',
  initialAction = ''
}) => {
  // 1. Base Currency State (persisted)
  const [baseCurrency, setBaseCurrency] = useState<string>(() => loadBaseCurrency());
  const [fxRates, setFxRates] = useState<Record<string, number>>(FALLBACK_RATES_TO_USD);
  const [fxRatesTimestamp, setFxRatesTimestamp] = useState<number>(Date.now());
  const [isFxLoading, setIsFxLoading] = useState<boolean>(false);

  // Sync Base Currency changes
  const handleBaseCurrencyChange = (newCurrency: string) => {
    setBaseCurrency(newCurrency);
    saveBaseCurrency(newCurrency);
  };

  // Fetch Live FX rates periodically (1h cache)
  useEffect(() => {
    let isCancelled = false;
    const loadRates = async () => {
      setIsFxLoading(true);
      try {
        const rates = await fetchLiveFxRates();
        if (!isCancelled && rates) {
          setFxRates(rates);
          setFxRatesTimestamp(Date.now());
        }
      } catch (err) {
        console.warn('[PortfolioRiskPage] FX fetch warning, using institutional fallback:', err);
      } finally {
        if (!isCancelled) setIsFxLoading(false);
      }
    };
    loadRates();
    const interval = setInterval(loadRates, 60 * 60 * 1000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  // 2. Persistent User Risk Tolerance State
  const [tolerance, setTolerance] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(TOLERANCE_STORAGE_KEY_V2);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (Number.isFinite(parsed) && parsed >= 20 && parsed <= 90) return parsed;
      }
    } catch {
      /* ignore */
    }
    return defaultTolerance;
  });

  const handleToleranceChange = (newVal: number) => {
    const clamped = Math.max(20, Math.min(90, newVal));
    setTolerance(clamped);
    try {
      localStorage.setItem(TOLERANCE_STORAGE_KEY_V2, String(clamped));
    } catch {
      /* ignore */
    }
  };

  // 3. Centralized Portfolio State Reducer
  const [portfolioState, dispatch] = useReducer(portfolioReducer, initialPortfolioState);
  const rawHoldings = portfolioState.holdings;

  // 4. Undo Toast State for deletions (5-second countdown)
  const [undoToast, setUndoToast] = useState<{
    visible: boolean;
    ticker: string;
    secondsLeft: number;
  } | null>(null);

  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerDeleteWithToast = useCallback((ticker: string) => {
    dispatch({ type: 'REMOVE', payload: { ticker } });

    if (undoTimerRef.current) {
      clearInterval(undoTimerRef.current);
    }

    setUndoToast({
      visible: true,
      ticker,
      secondsLeft: 5
    });

    const startTime = Date.now();
    undoTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = 5 - elapsed;
      if (remaining <= 0) {
        if (undoTimerRef.current) clearInterval(undoTimerRef.current);
        setUndoToast(null);
        dispatch({ type: 'CLEAR_BACKUP' });
      } else {
        setUndoToast((prev) => (prev ? { ...prev, secondsLeft: remaining } : null));
      }
    }, 200);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoTimerRef.current) {
      clearInterval(undoTimerRef.current);
    }
    dispatch({ type: 'RESTORE_DELETED' });
    setUndoToast(null);
  }, []);

  const handleDismissToast = useCallback(() => {
    if (undoTimerRef.current) {
      clearInterval(undoTimerRef.current);
    }
    setUndoToast(null);
    dispatch({ type: 'CLEAR_BACKUP' });
  }, []);

  // 5. Live Quotes with Tiered Polling & Concurrency Cap
  const symbols = useMemo(() => rawHoldings.map((h) => h.ticker), [rawHoldings]);
  const initialQuoteBases = useMemo(
    () =>
      rawHoldings.map((h) => ({
        ticker: h.ticker,
        price: h.avgCost ?? 100,
        prevClose: h.avgCost ?? 100,
        currency: h.currency
      })),
    [rawHoldings]
  );

  const {
    quotes,
    refreshingTickers,
    refreshTicker,
    refreshAllQuotes,
    setVisibleRange,
    isTabHidden
  } = usePortfolioQuotes(symbols, initialQuoteBases, 20000, 60000);

  // 6. Dynamically Computed Holdings Derived from Live Quotes, FX, and Tolerance
  const computedResult = useMemo(() => {
    return computePortfolioHoldings(rawHoldings, quotes, baseCurrency, tolerance, fxRates);
  }, [rawHoldings, quotes, baseCurrency, tolerance, fxRates]);

  const computedHoldings: ComputedHolding[] = computedResult.holdings;

  // Missing FX rates check
  const missingFxHoldings = useMemo(() => {
    return computedHoldings.filter((h) => h.hasMissingFxRate);
  }, [computedHoldings]);

  // 7. Portfolio Aggregate Metrics
  const totalValue = useMemo(
    () => computeTotalPortfolioValue(computedHoldings),
    [computedHoldings]
  );

  const dayChangeDollar = useMemo(
    () => computePortfolioDayChangeDollar(computedHoldings),
    [computedHoldings]
  );

  const dayChangePct = useMemo(
    () => computePortfolioDayChangePct(dayChangeDollar, totalValue),
    [dayChangeDollar, totalValue]
  );

  const flaggedHoldings = useMemo(
    () => getFlaggedPositions(computedHoldings, tolerance),
    [computedHoldings, tolerance]
  );

  const compositeRisk = useMemo(
    () => computeCompositeTailRiskScore(computedHoldings, tolerance),
    [computedHoldings, tolerance]
  );

  const hedgeRecommendation = useMemo(
    () => generateHedgeRecommendation(computedHoldings, totalValue, compositeRisk.score, baseCurrency),
    [computedHoldings, totalValue, compositeRisk.score, baseCurrency]
  );

  // 8. Search, Filtering, Grouping & Sorting Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [selectedExchange, setSelectedExchange] = useState('ALL');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [selectedSignal, setSelectedSignal] = useState('ALL');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupByOption>('none');
  const [sortField, setSortField] = useState<SortField>('allocation');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Filter option sets extracted from current holdings
  const uniqueCountries = useMemo(() => {
    const set = new Set<string>();
    for (const h of computedHoldings) if (h.country) set.add(h.country);
    return Array.from(set).sort();
  }, [computedHoldings]);

  const uniqueExchanges = useMemo(() => {
    const set = new Set<string>();
    for (const h of computedHoldings) if (h.exchange) set.add(h.exchange);
    return Array.from(set).sort();
  }, [computedHoldings]);

  const uniqueSectors = useMemo(() => {
    const set = new Set<string>();
    for (const h of computedHoldings) if (h.sector) set.add(h.sector);
    return Array.from(set).sort();
  }, [computedHoldings]);

  // Handle Sort Column Toggle
  const handleSortToggle = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'ticker' || field === 'name' ? 'asc' : 'desc');
    }
  };

  // Filtered & Sorted Holdings
  const displayedHoldings = useMemo(() => {
    let result = [...computedHoldings];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (h) =>
          h.ticker.toLowerCase().includes(q) ||
          h.companyName.toLowerCase().includes(q) ||
          h.exchange.toLowerCase().includes(q) ||
          h.sector.toLowerCase().includes(q) ||
          h.country.toLowerCase().includes(q)
      );
    }

    // Country filter
    if (selectedCountry !== 'ALL') {
      result = result.filter((h) => h.country === selectedCountry);
    }

    // Exchange filter
    if (selectedExchange !== 'ALL') {
      result = result.filter((h) => h.exchange === selectedExchange);
    }

    // Sector filter
    if (selectedSector !== 'ALL') {
      result = result.filter((h) => h.sector === selectedSector);
    }

    // Risk signal filter
    if (selectedSignal !== 'ALL') {
      result = result.filter((h) => h.signalBand.label.toLowerCase() === selectedSignal.toLowerCase());
    }

    // Flagged only filter
    if (flaggedOnly) {
      result = result.filter((h) => h.isFlagged);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'ticker':
          comparison = a.ticker.localeCompare(b.ticker);
          break;
        case 'name':
          comparison = a.companyName.localeCompare(b.companyName);
          break;
        case 'allocation':
          comparison = a.allocationPct - b.allocationPct;
          break;
        case 'value':
          comparison = a.basePositionValue - b.basePositionValue;
          break;
        case 'price':
          comparison = a.price - b.price;
          break;
        case 'cost':
          comparison = (a.costBasis ?? -1) - (b.costBasis ?? -1);
          break;
        case 'pnl':
          comparison = (a.unrealizedProfitLossDollar ?? -Infinity) - (b.unrealizedProfitLossDollar ?? -Infinity);
          break;
        case 'dayChange':
          comparison = a.dayChangePct - b.dayChangePct;
          break;
        case 'risk':
          comparison = a.riskScore - b.riskScore;
          break;
        case 'shares':
          comparison = a.shares - b.shares;
          break;
        default:
          comparison = 0;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [
    computedHoldings,
    searchQuery,
    selectedCountry,
    selectedExchange,
    selectedSector,
    selectedSignal,
    flaggedOnly,
    sortField,
    sortDirection
  ]);

  // 9. Virtualization for 500-1,000 Holdings
  const ROW_HEIGHT = 68;
  const {
    containerRef,
    handleScroll,
    virtualRows,
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom
  } = useVirtualScroll({
    count: displayedHoldings.length,
    rowHeight: ROW_HEIGHT,
    overscan: 8
  });

  // Notify tiered quotes hook about visible range
  useEffect(() => {
    setVisibleRange(startIndex, endIndex);
  }, [startIndex, endIndex, setVisibleRange]);

  // 10. Modals & Drawers State
  const [activeReviewHolding, setActiveReviewHolding] = useState<ComputedHolding | null>(null);
  const [showHedgeModal, setShowHedgeModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [holdingToReplace, setHoldingToReplace] = useState<PortfolioHolding | ComputedHolding | null>(null);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // Handle deep-linked action params
  useEffect(() => {
    if (initialReviewTicker && computedHoldings.length > 0) {
      const match = computedHoldings.find(
        (h) => h.ticker.toUpperCase() === initialReviewTicker.toUpperCase()
      );
      if (match) {
        if (initialAction === 'hedge') {
          setShowHedgeModal(true);
        } else {
          setActiveReviewHolding(match);
        }
      }
    }
  }, [initialReviewTicker, initialAction, computedHoldings]);

  // 11. Interactive Donut Chart Slice Click Filter
  const handleDonutSliceClick = (id: string, groupMode: string) => {
    if (groupMode === 'sector') {
      setSelectedSector((prev) => (prev === id ? 'ALL' : id));
    } else if (groupMode === 'country') {
      setSelectedCountry((prev) => (prev === id ? 'ALL' : id));
    } else if (groupMode === 'exchange') {
      setSelectedExchange((prev) => (prev === id ? 'ALL' : id));
    } else if (groupMode === 'ticker') {
      setSearchQuery((prev) => (prev === id ? '' : id));
    }
  };


  // Donut chart grouping state
  const [donutGroupBy, setDonutGroupBy] = useState<DonutGroupBy>('ticker');

  const donutItems: DonutSliceItem[] = useMemo(() => {
    if (computedHoldings.length === 0 || totalValue <= 0) return [];

    if (donutGroupBy === 'ticker') {
      const sorted = [...computedHoldings].sort(
        (a, b) => b.basePositionValue - a.basePositionValue
      );
      const top10 = sorted.slice(0, 10);
      const others = sorted.slice(10);

      const items: DonutSliceItem[] = top10.map((h) => ({
        id: h.ticker,
        label: h.ticker,
        subLabel: h.companyName,
        value: h.basePositionValue,
        allocationPct: h.allocationPct,
        color: getTickerColor(h.ticker)
      }));

      if (others.length > 0) {
        const otherValue = others.reduce((s, h) => s + h.basePositionValue, 0);
        const otherAlloc = Number(((otherValue / totalValue) * 100).toFixed(1));
        items.push({
          id: 'Other',
          label: `Other (${others.length} holdings)`,
          subLabel: 'Remaining diversified positions',
          value: otherValue,
          allocationPct: otherAlloc,
          color: OTHER_GRAY,
          otherCount: others.length,
          topContributors: others.slice(0, 5).map((o) => `${o.ticker} (${o.allocationPct}%)`)
        });
      }
      return items;
    }

    const groups = computeAllocationGrouping(computedHoldings, donutGroupBy, totalValue);
    return groups.map((g) => ({
      id: g.key,
      label: g.label,
      subLabel: `${g.count} holdings`,
      value: g.value,
      allocationPct: g.allocationPct,
      color: getSectorColor(g.key)
    }));
  }, [computedHoldings, donutGroupBy, totalValue]);

  // 12. Report Export Handler
  const handleGenerateReport = useCallback(() => {
    if (computedHoldings.length === 0) return;

    generatePortfolioRiskReportPDF({
      totalValue,
      dayChangeDollar,
      dayChangePct,
      compositeRisk,
      userTolerance: tolerance,
      baseCurrency,
      holdings: computedHoldings,
      flaggedHoldings,
      sectorBreakdown: computeAllocationGrouping(computedHoldings, 'sector', totalValue),
      countryBreakdown: computeAllocationGrouping(computedHoldings, 'country', totalValue),
      hedgeRecommendation,
      timestamp: new Date().toLocaleString([], {
        dateStyle: 'full',
        timeStyle: 'medium'
      })
    });
  }, [
    totalValue,
    dayChangeDollar,
    dayChangePct,
    compositeRisk,
    tolerance,
    baseCurrency,
    computedHoldings,
    flaggedHoldings,
    hedgeRecommendation
  ]);

  const isPositiveDay = dayChangeDollar >= 0;
  const currentCurrencyMeta = SUPPORTED_CURRENCIES.find((c) => c.code === baseCurrency) || SUPPORTED_CURRENCIES[0];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans text-slate-100">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 font-bold uppercase tracking-wider">
            <Briefcase className="w-4 h-4" />
            Institutional Portfolio Risk & Hedging
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1 flex items-center gap-3">
            <span>Portfolio Risk</span>
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-slate-800 text-blue-400 border border-slate-700">
              {rawHoldings.length} Holdings
            </span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
            Single source of truth multi-currency valuations, live quotes calibration, and concentration stress metrics
          </p>
        </div>

        {/* Action Controls: Base Currency, Tolerance Slider, Report, Edit */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Base Currency Selector */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0F1420] border border-slate-800">
            <Coins className="w-3.5 h-3.5 text-blue-400" />
            <label htmlFor="base-currency-select" className="text-[11px] font-bold text-slate-300">
              Base:
            </label>
            <select
              id="base-currency-select"
              value={baseCurrency}
              onChange={(e) => handleBaseCurrencyChange(e.target.value)}
              className="bg-transparent text-xs font-mono font-bold text-white focus:outline-none cursor-pointer"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code} className="bg-[#0F1420] text-white">
                  {c.flag} {c.code} ({c.symbol})
                </option>
              ))}
            </select>
          </div>

          {/* User Risk Tolerance Slider */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0F1420] border border-slate-800">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <label htmlFor="risk-tolerance-slider" className="text-[11px] font-bold text-slate-300">
              Tolerance: <span className="font-mono text-blue-400">{tolerance}</span>
            </label>
            <input
              id="risk-tolerance-slider"
              type="range"
              min="20"
              max="90"
              step="1"
              value={tolerance}
              onChange={(e) => handleToleranceChange(parseInt(e.target.value, 10))}
              className="w-20 sm:w-24 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              aria-label="Adjust portfolio risk tolerance threshold"
            />
          </div>

          {/* Edit Portfolio Button */}
          <button
            type="button"
            onClick={() => setShowEditDrawer(true)}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span>Manage ({rawHoldings.length})</span>
          </button>

          {/* Generate Report Button */}
          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={computedHoldings.length === 0}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 shrink-0 active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>PDF Report</span>
          </button>
        </div>
      </div>

      {/* Missing FX Warning Banner (Only shown if missing rates exist) */}
      {missingFxHoldings.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-center justify-between gap-3 text-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Missing FX Conversion Rate:</strong> {missingFxHoldings.length} holding(s) (
              {missingFxHoldings.map((h) => h.ticker).join(', ')}) cannot be converted to {baseCurrency} and are excluded from portfolio totals.
            </span>
          </div>
        </div>
      )}

      {/* Flagged Positions Warning Banner */}
      {flaggedHoldings.length > 0 && (
        <div
          className="p-4 sm:p-5 rounded-2xl bg-rose-500/10 border-2 border-rose-500/30 text-rose-200 space-y-3 animate-fadeIn"
          role="alert"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl shrink-0 mt-0.5">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xs font-black text-rose-300 uppercase tracking-wider flex items-center gap-2">
                  <span>
                    {flaggedHoldings.length} {flaggedHoldings.length === 1 ? 'POSITION' : 'POSITIONS'} FLAGGED FOR DRAWDOWN EXPOSURE
                  </span>
                </h3>
                <p className="text-xs text-rose-200 mt-1 leading-relaxed">
                  Elevated capital loss risk detected. Ticker(s){' '}
                  <strong>
                    {flaggedHoldings
                      .slice(0, 3)
                      .map((f) => `${f.ticker} (${f.riskScore}/100)`)
                      .join(', ')}
                  </strong>
                  {flaggedHoldings.length > 3 && (
                    <span className="ml-1 text-rose-300 font-bold">
                      +{flaggedHoldings.length - 3} more
                    </span>
                  )}{' '}
                  exceed your risk tolerance of {tolerance}/100.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const highestRisk = [...flaggedHoldings].sort((a, b) => b.riskScore - a.riskScore)[0];
                setActiveReviewHolding(highestRisk);
              }}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 shrink-0 self-start sm:self-auto active:scale-95"
            >
              <Sliders className="w-4 h-4" />
              <span>Review Position ({[...flaggedHoldings].sort((a, b) => b.riskScore - a.riskScore)[0]?.ticker})</span>
            </button>
          </div>
        </div>
      )}

      {/* Top 3 Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Total Portfolio Value & Today Change */}
        <div className="bg-[#0F1420] border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Total Portfolio Value ({baseCurrency})
              </span>
              <span className="text-xs font-mono text-slate-500">{currentCurrencyMeta.flag}</span>
            </div>
            <div className="text-3xl font-black font-mono text-white mt-1 tabular-nums">
              {formatMoney(totalValue, baseCurrency)}
            </div>
          </div>
          <div
            className={`mt-3 text-xs font-bold flex items-center gap-1.5 font-mono ${
              isPositiveDay ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isPositiveDay ? (
              <ArrowUpRight className="w-4 h-4 shrink-0" />
            ) : (
              <ArrowDownRight className="w-4 h-4 shrink-0" />
            )}
            <span className="tabular-nums">
              {isPositiveDay ? '+' : ''}
              {dayChangePct.toFixed(2)}% ({isPositiveDay ? '+' : ''}
              {formatMoney(dayChangeDollar, baseCurrency)}) Today
            </span>
          </div>
        </div>

        {/* Card 2: Composite Tail-Risk Score & Concentration */}
        <div className="bg-[#0F1420] border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Composite Tail-Risk Score
            </span>
            <div className="text-3xl font-black font-mono text-amber-400 mt-1 flex items-baseline gap-1.5 tabular-nums">
              <span>{computedHoldings.length === 0 ? '—' : compositeRisk.score}</span>
              <span className="text-xs font-normal text-slate-400">/ 100</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-amber-400 font-semibold truncate">
            {computedHoldings.length === 0 ? (
              'No positions'
            ) : (
              `${compositeRisk.label} Threat Concentration (${compositeRisk.topSector.name} ${compositeRisk.topSector.allocationPct}%)`
            )}
          </div>
        </div>

        {/* Card 3: AI Recommended Hedging */}
        <div className="bg-[#0F1420] border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              AI Recommended Hedging
            </span>
            <div className="text-sm font-bold text-slate-200 mt-1.5 leading-snug">
              {computedHoldings.length === 0
                ? 'No positions to hedge'
                : hedgeRecommendation
                ? hedgeRecommendation.actionTitle
                : 'No hedge needed: all positions are within your risk tolerance'}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            {hedgeRecommendation ? (
              <button
                type="button"
                onClick={() => setShowHedgeModal(true)}
                className="font-bold text-blue-400 hover:underline flex items-center gap-1"
              >
                Review {hedgeRecommendation.ticker} Hedge Plan →
              </button>
            ) : (
              <span className="text-slate-400 text-xs">
                {computedHoldings.length === 0 ? 'Add positions to evaluate' : 'No hedge necessary'}
              </span>
            )}
            <span className="text-[10px] text-slate-500 italic">Institutional Model</span>
          </div>
        </div>
      </div>

      {/* Main Split Layout: Table Left (2 cols), Allocation Donut Right (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Holdings Table Section */}
        <div className="lg:col-span-2 bg-[#0F1420] border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xl flex flex-col space-y-4">
          {/* Header Controls: Title, Filter Inputs, Add Button */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  Portfolio Holdings ({displayedHoldings.length} of {computedHoldings.length})
                </h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  Live multi-currency valuations &bull; Sum: {formatMoney(totalValue, baseCurrency)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={refreshAllQuotes}
                  title="Refresh quotes for all holdings"
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  disabled={rawHoldings.length >= MAX_PORTFOLIO_HOLDINGS}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white shadow-sm transition-all active:scale-95"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add Company</span>
                </button>
              </div>
            </div>

            {/* Filter Toolbar: Search, Country, Exchange, Sector, Signal, Flagged Only */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 pt-1 text-xs font-mono">
              {/* Search Box */}
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by symbol, company, exchange..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#121826] border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Country Filter */}
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-[#121826] border border-slate-800 text-white focus:outline-none"
              >
                <option value="ALL">All Countries</option>
                {uniqueCountries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Sector Filter */}
              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-[#121826] border border-slate-800 text-white focus:outline-none"
              >
                <option value="ALL">All Sectors</option>
                {uniqueSectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {/* Flagged Only Toggle */}
              <button
                type="button"
                onClick={() => setFlaggedOnly((prev) => !prev)}
                className={`px-3 py-1.5 rounded-xl border font-bold transition-all flex items-center justify-center gap-1.5 ${
                  flaggedOnly
                    ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                    : 'bg-[#121826] border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Flagged Only</span>
              </button>
            </div>
          </div>

          {/* Virtualized Table Container */}
          {displayedHoldings.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border-2 border-dashed border-slate-800 space-y-3">
              <Building2 className="w-10 h-10 text-slate-600 mx-auto" />
              <h4 className="text-sm font-bold text-slate-200">
                {rawHoldings.length === 0 ? 'No positions in your portfolio' : 'No matching positions found'}
              </h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {rawHoldings.length === 0
                  ? 'Your portfolio is currently empty. Add global companies or reset to the 500-holding institutional sample to begin tail-risk tracking.'
                  : 'Try clearing your search query or adjusting the country/sector filters.'}
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
                >
                  + Add Company
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'RESET', payload: { sample: 'global' } })}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Load 500 Global Sample
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Virtualized Table Wrapper with Sticky Header */}
              <div
                ref={containerRef}
                onScroll={handleScroll}
                className="overflow-y-auto overflow-x-auto max-h-[580px] rounded-xl border border-slate-800 bg-[#0B0F17]"
              >
                <table className="w-full text-left text-xs border-collapse min-w-[760px]">
                  {/* Sticky Header with Sorting on Every Column */}
                  <thead className="sticky top-0 z-10 bg-[#0F1420] border-b border-slate-800 text-[10px] uppercase text-slate-400 font-mono">
                    <tr>
                      <th
                        onClick={() => handleSortToggle('ticker')}
                        className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1">
                          <span>Asset</span>
                          <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortToggle('allocation')}
                        className="py-3 px-3 text-right cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Allocation</span>
                          <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortToggle('price')}
                        className="py-3 px-3 text-right cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Live Quote</span>
                          <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortToggle('cost')}
                        className="py-3 px-3 text-right cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Cost Basis & P/L</span>
                          <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </div>
                      </th>
                      <th
                        onClick={() => handleSortToggle('risk')}
                        className="py-3 px-3 text-center cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>Risk Signal</span>
                          <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </div>
                      </th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {/* Top Virtual Spacer */}
                    {paddingTop > 0 && (
                      <tr>
                        <td colSpan={6} style={{ height: `${paddingTop}px` }} />
                      </tr>
                    )}

                    {/* Rendered Virtual Rows */}
                    {virtualRows.map((virtualRow) => {
                      const h = displayedHoldings[virtualRow.index];
                      if (!h) return null;

                      const quote = quotes[h.ticker.toUpperCase()];
                      const isHovered = hoveredKey?.toUpperCase() === h.ticker.toUpperCase();
                      const isRefreshing = refreshingTickers[h.ticker.toUpperCase()] || false;
                      const priceDiff = h.price - h.prevClose;
                      const isPositivePrice = priceDiff >= 0;
                      const tickerColor = getTickerColor(h.ticker);

                      return (
                        <tr
                          key={h.id || h.ticker}
                          style={{ height: `${ROW_HEIGHT}px` }}
                          onMouseEnter={() => setHoveredKey(h.ticker)}
                          onMouseLeave={() => setHoveredKey(null)}
                          className={`border-b border-slate-800/80 transition-colors ${
                            isHovered
                              ? 'bg-blue-600/15'
                              : h.isFlagged
                              ? 'bg-rose-950/10 hover:bg-rose-950/20'
                              : 'hover:bg-slate-800/40'
                          }`}
                        >
                          {/* Asset Column */}
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: tickerColor }}
                              />
                              <span className="truncate max-w-[170px]">{h.companyName}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono text-slate-400">
                              <span className="font-bold text-blue-400">{h.ticker}</span>
                              <span className="px-1 py-0.2 rounded bg-slate-800 text-slate-300">
                                {h.exchange}
                              </span>
                              <span>&bull;</span>
                              <span>{h.shares} shs</span>
                              <span>&bull;</span>
                              <span>{h.country}</span>
                            </div>
                          </td>

                          {/* Allocation Column */}
                          <td className="py-2.5 px-3 text-right font-mono">
                            <div className="font-bold text-white text-xs tabular-nums">
                              {formatPercent(h.allocationPct, 1)}
                            </div>
                            <div className="text-[10px] text-slate-400 tabular-nums">
                              {h.hasMissingFxRate ? (
                                <span className="text-amber-400">No FX rate</span>
                              ) : (
                                formatMoney(h.basePositionValue, baseCurrency)
                              )}
                            </div>
                          </td>

                          {/* Live Quote Column */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-mono font-bold text-white text-xs tabular-nums">
                                {formatMoney(h.price, h.currency)}
                              </span>
                              {h.quoteStatus === 'costBasisOnly' ? (
                                <span className="px-1 py-0.2 rounded bg-slate-800 text-[9px] text-amber-400 font-mono">
                                  cost basis, no quote
                                </span>
                              ) : (
                                <span
                                  className={`inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[10px] font-mono font-bold border tabular-nums whitespace-nowrap ${
                                    isPositivePrice
                                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                      : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                                  }`}
                                >
                                  {isPositivePrice ? '+' : ''}
                                  {h.dayChangePct.toFixed(2)}%
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-end gap-1.5 mt-0.5 text-[10px] text-slate-400">
                              <span className="inline-flex items-center gap-1 font-medium">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    quote?.isMarketOpen ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                                  }`}
                                />
                                <span className={quote?.isMarketOpen ? 'text-emerald-400' : 'text-amber-400'}>
                                  {quote?.isMarketOpen ? 'Live' : 'Last close'}
                                </span>
                              </span>
                              <span>&bull;</span>
                              <RelativeTimeAgo timestamp={quote?.fetchedAt || null} />
                              <button
                                type="button"
                                onClick={() => refreshTicker(h.ticker)}
                                disabled={isRefreshing}
                                title={`Refresh quote for ${h.ticker}`}
                                className="p-0.5 rounded text-slate-400 hover:text-white"
                              >
                                <RefreshCw className={`w-2.5 h-2.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
                              </button>
                            </div>
                          </td>

                          {/* Cost Basis & Unrealized P/L */}
                          <td className="py-2.5 px-3 text-right font-mono">
                            {h.costBasis !== undefined && h.unrealizedProfitLossDollar !== undefined ? (
                              <>
                                <div
                                  className={`text-xs font-bold tabular-nums ${
                                    h.unrealizedProfitLossDollar >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                  }`}
                                >
                                  {h.unrealizedProfitLossDollar >= 0 ? '+' : ''}
                                  {formatMoney(h.unrealizedProfitLossDollar, baseCurrency)} (
                                  {h.unrealizedProfitLossPct !== undefined
                                    ? `${h.unrealizedProfitLossPct >= 0 ? '+' : ''}${h.unrealizedProfitLossPct.toFixed(1)}%`
                                    : '—'}
                                  )
                                </div>
                                <div className="text-[10px] text-slate-400 tabular-nums">
                                  Cost: {formatMoney(h.costBasis, baseCurrency)}
                                </div>
                              </>
                            ) : (
                              <div className="text-slate-500 text-[11px]">—</div>
                            )}
                          </td>

                          {/* Risk Signal Column */}
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border font-mono whitespace-nowrap ${h.signalBand.badgeClass}`}
                            >
                              {h.signalBand.label} ({h.riskScore})
                            </span>
                          </td>

                          {/* Actions Column */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setActiveReviewHolding(h)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                                  h.isFlagged
                                    ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-600'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                                }`}
                              >
                                {h.isFlagged ? 'Review' : 'Inspect'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setHoldingToReplace(h);
                                  setShowReplaceModal(true);
                                }}
                                title={`Replace ${h.ticker} with another company`}
                                className="p-1 rounded text-slate-400 hover:text-blue-400 transition-colors"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => triggerDeleteWithToast(h.ticker)}
                                title={`Remove ${h.ticker} from portfolio`}
                                className="p-1 rounded text-slate-400 hover:text-rose-400 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Bottom Virtual Spacer */}
                    {paddingBottom > 0 && (
                      <tr>
                        <td colSpan={6} style={{ height: `${paddingBottom}px` }} />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Allocation Donut Chart Section */}
        <PortfolioDonutChart
          items={donutItems}
          groupBy={donutGroupBy}
          onGroupByChange={setDonutGroupBy}
          totalPositionsCount={computedHoldings.length}
          baseCurrency={baseCurrency}
          hoveredKey={hoveredKey}
          onHoverKey={setHoveredKey}
          onSelectFilterKey={(key) => handleDonutSliceClick(key || '', donutGroupBy)}
        />
      </div>

      {/* Undo Toast Notification */}
      {undoToast?.visible && (
        <div
          className="fixed bottom-6 left-6 z-50 p-4 rounded-2xl bg-slate-900 text-white border border-slate-700 shadow-2xl flex items-center gap-3 animate-slideInUp max-w-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex-1 text-xs">
            <span className="font-semibold text-slate-200">
              Removed <span className="font-mono text-blue-400">${undoToast.ticker}</span> from portfolio
            </span>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Auto-dismissing in {undoToast.secondsLeft}s
            </div>
          </div>
          <button
            type="button"
            onClick={handleUndo}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1 active:scale-95"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>
          <button
            type="button"
            onClick={handleDismissToast}
            aria-label="Dismiss toast"
            className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Position Review Modal */}
      {activeReviewHolding && (
        <PositionReviewModal
          holding={activeReviewHolding}
          company={companies.find((c) => c.ticker === activeReviewHolding.ticker)}
          userTolerance={tolerance}
          onClose={() => setActiveReviewHolding(null)}
          onOpenHedgePlan={() => {
            setActiveReviewHolding(null);
            setShowHedgeModal(true);
          }}
          onNavigateToCompany={(ticker) => {
            setActiveReviewHolding(null);
            onNavigate(`/companies?symbol=${ticker}`);
          }}
        />
      )}

      {/* Hedge Plan Modal */}
      {showHedgeModal && hedgeRecommendation && (
        <HedgePlanModal
          hedge={hedgeRecommendation}
          onClose={() => setShowHedgeModal(false)}
          onNavigateToCompany={(ticker) => {
            setShowHedgeModal(false);
            onNavigate(`/companies?symbol=${ticker}`);
          }}
        />
      )}

      {/* Add Position Modal */}
      <AddCompanyModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        currentHoldings={rawHoldings}
        baseCurrency={baseCurrency}
        fxRates={fxRates}
        totalPortfolioValue={totalValue}
        onAdd={(holding) => dispatch({ type: 'ADD', payload: holding })}
        onSelectExistingToEdit={() => {
          setShowAddModal(false);
          setShowEditDrawer(true);
        }}
      />

      {/* Replace Holding Modal */}
      <ReplaceCompanyModal
        isOpen={showReplaceModal}
        currentHolding={holdingToReplace}
        currentHoldings={rawHoldings}
        baseCurrency={baseCurrency}
        fxRates={fxRates}
        totalPortfolioValue={totalValue}
        onClose={() => {
          setShowReplaceModal(false);
          setHoldingToReplace(null);
        }}
        onReplace={(params) => dispatch({ type: 'REPLACE', payload: params })}
      />

      {/* Edit Portfolio Drawer */}
      <EditPortfolioDrawer
        isOpen={showEditDrawer}
        onClose={() => setShowEditDrawer(false)}
        holdings={rawHoldings}
        baseCurrency={baseCurrency}
        fxRates={fxRates}
        totalPortfolioValue={totalValue}
        onAddClick={() => {
          setShowEditDrawer(false);
          setShowAddModal(true);
        }}
        onReplaceClick={(h) => {
          setShowEditDrawer(false);
          setHoldingToReplace(h);
          setShowReplaceModal(true);
        }}
        onDeleteHolding={(ticker) => triggerDeleteWithToast(ticker)}
        onBulkDelete={(tickers) => dispatch({ type: 'BULK_REMOVE', payload: { tickers } })}
        onUpdateHolding={(ticker, shares, avgCost) =>
          dispatch({ type: 'EDIT', payload: { ticker, shares, avgCost } })
        }
        onBulkAdd={(newHoldings) => dispatch({ type: 'BULK_ADD', payload: { holdings: newHoldings } })}
        onImportCsv={(importedHoldings, mode) =>
          dispatch({ type: 'IMPORT', payload: { holdings: importedHoldings, mode } })
        }
        onLoadSample={(sample) => dispatch({ type: 'RESET', payload: { sample } })}
      />
    </div>
  );
};
