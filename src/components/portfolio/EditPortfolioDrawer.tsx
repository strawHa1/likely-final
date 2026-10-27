import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  PlusCircle,
  Trash2,
  ArrowRightLeft,
  RotateCcw,
  Sliders,
  DollarSign,
  PieChart as PieIcon,
  AlertTriangle,
  Building2,
  Check,
  Search,
  FileSpreadsheet,
  Download,
  Upload,
  ClipboardList,
  CheckSquare,
  Square,
  Loader2,
  Info
} from 'lucide-react';
import { PortfolioHolding } from '../../types';
import { MAX_PORTFOLIO_HOLDINGS } from '../../lib/portfolioReducer';
import { formatPercent } from '../../utils/portfolioMath';
import { getTickerColor } from '../../utils/portfolioColors';
import { formatMoney, FALLBACK_RATES_TO_USD, convertCurrency } from '../../lib/fxService';

export interface EditPortfolioDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  holdings: PortfolioHolding[];
  baseCurrency?: string;
  fxRates?: Record<string, number>;
  totalPortfolioValue: number;
  onAddClick: () => void;
  onReplaceClick: (holding: PortfolioHolding) => void;
  onDeleteHolding: (ticker: string) => void;
  onBulkDelete: (tickers: string[]) => void;
  onUpdateHolding: (ticker: string, shares: number, avgCost?: number) => void;
  onBulkAdd: (holdings: Array<{
    ticker: string;
    companyName: string;
    exchange?: string;
    country?: string;
    currency?: string;
    sector?: string;
    shares: number;
    avgCost?: number;
  }>) => void;
  onImportCsv: (holdings: PortfolioHolding[], mode: 'replace' | 'merge') => void;
  onLoadSample: (sample: 'starter' | 'global') => void;
}

type DrawerTab = 'holdings' | 'paste' | 'csv' | 'reset';
type RebalanceMode = 'shares' | 'dollars' | 'percent';

interface ParsedPasteItem {
  ticker: string;
  shares: number;
  companyName?: string;
  exchange?: string;
  country?: string;
  currency?: string;
  sector?: string;
  status: 'valid' | 'invalid' | 'exists';
  message?: string;
}

export const EditPortfolioDrawer: React.FC<EditPortfolioDrawerProps> = ({
  isOpen,
  onClose,
  holdings,
  baseCurrency = 'USD',
  fxRates = FALLBACK_RATES_TO_USD,
  totalPortfolioValue,
  onAddClick,
  onReplaceClick,
  onDeleteHolding,
  onBulkDelete,
  onUpdateHolding,
  onBulkAdd,
  onImportCsv,
  onLoadSample
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('holdings');
  const [filterQuery, setFilterQuery] = useState('');
  const [rebalanceMode, setRebalanceMode] = useState<RebalanceMode>('shares');

  // Draft inputs per holding
  const [draftShares, setDraftShares] = useState<Record<string, string>>({});
  const [draftCosts, setDraftCosts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Multi-select for bulk delete
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Paste list tab state
  const [pasteText, setPasteText] = useState('');
  const [isValidatingPaste, setIsValidatingPaste] = useState(false);
  const [pasteResults, setPasteResults] = useState<ParsedPasteItem[]>([]);
  const [pasteError, setPasteError] = useState<string | null>(null);

  // CSV tab state
  const [csvFileContent, setCsvFileContent] = useState('');
  const [csvImportMode, setCsvImportMode] = useState<'merge' | 'replace'>('merge');
  const [parsedCsvHoldings, setParsedCsvHoldings] = useState<PortfolioHolding[]>([]);
  const [csvParseError, setCsvParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset sample confirm dialog state
  const [sampleChoice, setSampleChoice] = useState<'starter' | 'global'>('global');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Synchronize draft state when holdings or drawer open changes
  useEffect(() => {
    if (isOpen) {
      const sharesMap: Record<string, string> = {};
      const costMap: Record<string, string> = {};
      holdings.forEach((h) => {
        sharesMap[h.ticker] = String(h.shares);
        costMap[h.ticker] = h.avgCost !== undefined ? String(h.avgCost) : '';
      });
      setDraftShares(sharesMap);
      setDraftCosts(costMap);
      setErrors({});
      setSelectedTickers(new Set());
      setShowBulkDeleteConfirm(false);
      setShowResetConfirm(false);
      setFilterQuery('');
    }
  }, [isOpen, holdings]);

  // Filtered holdings for the list
  const filteredHoldings = useMemo(() => {
    if (!filterQuery.trim()) return holdings;
    const q = filterQuery.toLowerCase().trim();
    return holdings.filter(
      (h) =>
        h.ticker.toLowerCase().includes(q) ||
        h.companyName.toLowerCase().includes(q) ||
        h.exchange.toLowerCase().includes(q) ||
        h.sector.toLowerCase().includes(q)
    );
  }, [holdings, filterQuery]);

  // Handle Share Change
  const handleSharesChange = (ticker: string, val: string) => {
    setDraftShares((prev) => ({ ...prev, [ticker]: val }));
    const num = parseFloat(val);
    if (!Number.isFinite(num) || num <= 0) {
      setErrors((prev) => ({ ...prev, [ticker]: 'Shares must be > 0' }));
      return;
    }
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[ticker];
      return copy;
    });

    const currentCost = parseFloat(draftCosts[ticker] || '');
    onUpdateHolding(
      ticker,
      num,
      Number.isFinite(currentCost) && currentCost > 0 ? currentCost : undefined
    );
  };

  // Handle Avg Cost Change
  const handleCostChange = (ticker: string, val: string) => {
    setDraftCosts((prev) => ({ ...prev, [ticker]: val }));
    const costNum = parseFloat(val);
    const sharesNum = parseFloat(draftShares[ticker] || '');
    if (Number.isFinite(sharesNum) && sharesNum > 0) {
      onUpdateHolding(
        ticker,
        sharesNum,
        Number.isFinite(costNum) && costNum > 0 ? costNum : undefined
      );
    }
  };

  // Multi-select helpers
  const handleToggleSelect = (ticker: string) => {
    setSelectedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    if (selectedTickers.size === filteredHoldings.length) {
      setSelectedTickers(new Set());
    } else {
      setSelectedTickers(new Set(filteredHoldings.map((h) => h.ticker)));
    }
  };

  const handleExecuteBulkDelete = () => {
    if (selectedTickers.size === 0) return;
    onBulkDelete(Array.from(selectedTickers));
    setSelectedTickers(new Set());
    setShowBulkDeleteConfirm(false);
  };

  // Paste list validation
  const handleValidatePasteList = async () => {
    if (!pasteText.trim()) {
      setPasteError('Please enter at least one ticker.');
      return;
    }

    setIsValidatingPaste(true);
    setPasteError(null);
    setPasteResults([]);

    // Parse tokens: "AAPL 50, MSFT 100\nRELIANCE.NS 200, TSLA"
    const lines = pasteText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const holdingMap = new Map(holdings.map((h) => [h.ticker.toUpperCase(), h]));
    const results: ParsedPasteItem[] = [];

    for (const item of lines) {
      const parts = item.split(/\s+/).filter(Boolean);
      if (parts.length === 0) continue;

      const rawTicker = parts[0].toUpperCase();
      let shares = 100;
      if (parts.length >= 2) {
        const parsedShares = parseFloat(parts[1]);
        if (Number.isFinite(parsedShares) && parsedShares > 0) {
          shares = Math.round(parsedShares);
        }
      }

      // Check if already held
      if (holdingMap.has(rawTicker)) {
        const held = holdingMap.get(rawTicker)!;
        results.push({
          ticker: rawTicker,
          shares,
          companyName: held.companyName,
          exchange: held.exchange,
          currency: held.currency,
          sector: held.sector,
          status: 'exists',
          message: `Already in portfolio (${held.shares} shares)`
        });
        continue;
      }

      // Query symbol database lookup
      try {
        const res = await fetch(`/api/symbols/lookup?symbol=${encodeURIComponent(rawTicker)}`);
        if (res.ok) {
          const symData = await res.json();
          if (symData && symData.symbol) {
            results.push({
              ticker: symData.symbol.toUpperCase(),
              shares,
              companyName: symData.name || symData.symbol,
              exchange: symData.exchange || 'NASDAQ',
              country: symData.country || 'US',
              currency: symData.currency || 'USD',
              sector: symData.sector || 'General',
              status: 'valid'
            });
            continue;
          }
        }
      } catch {
        /* ignore */
      }

      // Fallback search
      try {
        const sRes = await fetch(`/api/symbols/search?q=${encodeURIComponent(rawTicker)}&limit=1`);
        if (sRes.ok) {
          const sData = await sRes.json();
          const items = Array.isArray(sData) ? sData : sData.results || [];
          const match = items.find((i: any) => (i.symbol || i.ticker || '').toUpperCase() === rawTicker);
          if (match) {
            results.push({
              ticker: match.symbol.toUpperCase(),
              shares,
              companyName: match.name || match.symbol,
              exchange: match.exchange || 'NASDAQ',
              country: match.country || 'US',
              currency: match.currency || 'USD',
              sector: match.sector || 'General',
              status: 'valid'
            });
            continue;
          }
        }
      } catch {
        /* ignore */
      }

      // If not resolved
      results.push({
        ticker: rawTicker,
        shares,
        status: 'invalid',
        message: 'Symbol not found in universe'
      });
    }

    setPasteResults(results);
    setIsValidatingPaste(false);
  };

  const handleAddValidFromPaste = () => {
    const valid = pasteResults.filter((p) => p.status === 'valid');
    if (valid.length === 0) return;

    onBulkAdd(
      valid.map((v) => ({
        ticker: v.ticker,
        companyName: v.companyName || v.ticker,
        exchange: v.exchange,
        country: v.country,
        currency: v.currency,
        sector: v.sector,
        shares: v.shares
      }))
    );

    setPasteText('');
    setPasteResults([]);
    setActiveTab('holdings');
  };

  // CSV Export
  const handleExportCsv = () => {
    const headers = ['ticker', 'companyName', 'exchange', 'country', 'currency', 'sector', 'shares', 'avgCost'];
    const rows = holdings.map((h) => [
      `"${h.ticker}"`,
      `"${(h.companyName || h.ticker).replace(/"/g, '""')}"`,
      `"${h.exchange}"`,
      `"${h.country}"`,
      `"${h.currency}"`,
      `"${h.sector}"`,
      h.shares,
      h.avgCost !== undefined ? h.avgCost : ''
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `portfolio-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Parse
  const handleParseCsv = (content: string) => {
    setCsvParseError(null);
    setParsedCsvHoldings([]);
    if (!content.trim()) return;

    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      setCsvParseError('CSV must include a header row and at least one data row.');
      return;
    }

    const header = lines[0].toLowerCase().split(',').map((h) => h.replace(/["'\s]/g, ''));
    const tickerIdx = header.findIndex((h) => h === 'ticker' || h === 'symbol' || h === 'code');
    const nameIdx = header.findIndex((h) => h === 'companyname' || h === 'name' || h === 'company');
    const sharesIdx = header.findIndex((h) => h === 'shares' || h === 'quantity' || h === 'qty');
    const costIdx = header.findIndex((h) => h === 'avgcost' || h === 'cost' || h === 'price');
    const exchangeIdx = header.findIndex((h) => h === 'exchange');
    const countryIdx = header.findIndex((h) => h === 'country');
    const currencyIdx = header.findIndex((h) => h === 'currency');
    const sectorIdx = header.findIndex((h) => h === 'sector');

    if (tickerIdx === -1) {
      setCsvParseError('CSV missing required "ticker" or "symbol" header column.');
      return;
    }

    const parsed: PortfolioHolding[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Regex CSV splitter handling quotes
      const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
      const cleanCols = cols.map((c) => c.replace(/^["']|["']$/g, '').trim());

      const rawTicker = cleanCols[tickerIdx]?.toUpperCase();
      if (!rawTicker) continue;

      const rawShares = sharesIdx !== -1 ? parseFloat(cleanCols[sharesIdx]) : 100;
      const shares = Number.isFinite(rawShares) && rawShares > 0 ? Math.round(rawShares) : 100;

      const rawCost = costIdx !== -1 ? parseFloat(cleanCols[costIdx]) : undefined;
      const avgCost = rawCost !== undefined && Number.isFinite(rawCost) && rawCost > 0 ? rawCost : undefined;

      const companyName = nameIdx !== -1 && cleanCols[nameIdx] ? cleanCols[nameIdx] : rawTicker;
      const exchange = exchangeIdx !== -1 && cleanCols[exchangeIdx] ? cleanCols[exchangeIdx] : 'NASDAQ';
      const country = countryIdx !== -1 && cleanCols[countryIdx] ? cleanCols[countryIdx] : 'US';
      const currency = currencyIdx !== -1 && cleanCols[currencyIdx] ? cleanCols[currencyIdx] : 'USD';
      const sector = sectorIdx !== -1 && cleanCols[sectorIdx] ? cleanCols[sectorIdx] : 'General';

      parsed.push({
        id: `csv-${Date.now()}-${i}`,
        ticker: rawTicker,
        companyName,
        exchange,
        country,
        currency,
        sector,
        shares,
        ...(avgCost !== undefined ? { avgCost } : {}),
        addedAt: Date.now()
      });
    }

    if (parsed.length === 0) {
      setCsvParseError('No valid rows found in CSV file.');
      return;
    }

    setParsedCsvHoldings(parsed);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvFileContent(text);
      handleParseCsv(text);
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    if (parsedCsvHoldings.length === 0) return;
    onImportCsv(parsedCsvHoldings, csvImportMode);
    setParsedCsvHoldings([]);
    setCsvFileContent('');
    setActiveTab('holdings');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-portfolio-title"
    >
      <div className="bg-[#0B0F17] border-l border-slate-800 w-full max-w-2xl h-full shadow-2xl flex flex-col animate-slideInRight text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-[#0F1420]/90">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="manage-portfolio-title" className="text-base font-bold text-white">
                Manage Portfolio
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-blue-400 border border-slate-700">
                {holdings.length} / {MAX_PORTFOLIO_HOLDINGS}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              Add, edit, bulk import, or rebalance holdings across all exchanges
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onAddClick}
              disabled={holdings.length >= MAX_PORTFOLIO_HOLDINGS}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white shadow-sm transition-all active:scale-95"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Company</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close edit portfolio drawer"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 border-b border-slate-800 bg-[#0F1420]/60 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('holdings')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'holdings'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Holdings ({holdings.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'paste'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Paste Tickers</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('csv')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'csv'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>CSV Import / Export</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reset')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'reset'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Sample</span>
          </button>
        </div>

        {/* Tab 1: Holdings List with Search, Filter & Multi-Select */}
        {activeTab === 'holdings' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search and Bulk Action Toolbar */}
            <div className="p-4 border-b border-slate-800 bg-[#121826]/70 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder="Filter by symbol, company, exchange, sector..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#0B0F17] border border-slate-800 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 flex items-center gap-1.5"
                >
                  {selectedTickers.size > 0 && selectedTickers.size === filteredHoldings.length ? (
                    <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>Select All</span>
                </button>

                {selectedTickers.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowBulkDeleteConfirm(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-[11px] font-bold text-white flex items-center gap-1.5 shadow-sm animate-fadeIn"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete ({selectedTickers.size})</span>
                  </button>
                )}
              </div>

              {/* Bulk Delete Confirm Banner */}
              {showBulkDeleteConfirm && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>
                      Permanently delete <strong>{selectedTickers.size}</strong> selected positions?
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBulkDeleteConfirm(false)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-[11px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteBulkDelete}
                      className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px]"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Holdings Scrollable List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {filteredHoldings.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <Building2 className="w-10 h-10 text-slate-600 mx-auto" />
                  <div className="text-sm font-bold text-slate-300">
                    {filterQuery ? 'No matching holdings found' : 'No Holdings in Portfolio'}
                  </div>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {filterQuery
                      ? 'Try adjusting your search filter or clear it to see all holdings.'
                      : 'Add companies or load the institutional sample portfolio.'}
                  </p>
                </div>
              ) : (
                filteredHoldings.map((h) => {
                  const isSelected = selectedTickers.has(h.ticker);
                  const tickerColor = getTickerColor(h.ticker);
                  const sharesNum = parseFloat(draftShares[h.ticker] ?? String(h.shares)) || 0;
                  const err = errors[h.ticker];

                  return (
                    <div
                      key={h.ticker}
                      className={`p-3.5 rounded-xl bg-[#121826] border transition-all ${
                        isSelected
                          ? 'border-blue-500/60 ring-1 ring-blue-500/30 bg-blue-950/10'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Top Row: Checkbox, Symbol, Company, Badges, Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleToggleSelect(h.ticker)}
                            className="text-slate-400 hover:text-white"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600" />
                            )}
                          </button>
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: tickerColor }}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm text-white">
                                {h.ticker}
                              </span>
                              <span className="text-xs text-slate-400 truncate max-w-[180px]">
                                {h.companyName}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                {h.exchange}
                              </span>
                              <span>{h.country}</span>
                              <span>&bull;</span>
                              <span>{h.currency}</span>
                              <span>&bull;</span>
                              <span>{h.sector}</span>
                            </div>
                          </div>
                        </div>

                        {/* Replace / Remove Actions */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onReplaceClick(h)}
                            title={`Replace ${h.ticker} with another company`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteHolding(h.ticker)}
                            title={`Remove ${h.ticker} from portfolio`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Inputs Row */}
                      <div className="grid grid-cols-2 gap-3 mt-3 pt-2.5 border-t border-slate-800/80">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Shares
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="any"
                            value={draftShares[h.ticker] ?? h.shares}
                            onChange={(e) => handleSharesChange(h.ticker, e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[#0B0F17] border border-slate-800 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Avg Cost ({h.currency || 'USD'})
                          </label>
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            placeholder="Optional"
                            value={draftCosts[h.ticker] ?? (h.avgCost || '')}
                            onChange={(e) => handleCostChange(h.ticker, e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg text-xs font-mono bg-[#0B0F17] border border-slate-800 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {err && (
                        <div className="mt-2 text-[11px] text-rose-400 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{err}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Paste List Tickers */}
        {activeTab === 'paste' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white">Paste Tickers Bulk Importer</h3>
              <p className="text-xs text-slate-400 mt-1">
                Enter comma-, space- or newline-separated symbols. You can optionally include shares after each symbol.
              </p>
              <div className="mt-2 p-2.5 rounded-lg bg-blue-950/20 border border-blue-500/20 text-[11px] text-blue-300 font-mono">
                Example: AAPL 50, MSFT 100, RELIANCE.NS 200, ASML.AS, SAP.DE 75
              </div>
            </div>

            <textarea
              rows={6}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="AAPL 50&#10;MSFT 100&#10;RELIANCE.NS 200&#10;TCS.BO 150"
              className="w-full p-3 rounded-xl bg-[#121826] border border-slate-800 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {pasteError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{pasteError}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleValidatePasteList}
                disabled={isValidatingPaste || !pasteText.trim()}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2"
              >
                {isValidatingPaste ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Validating Tickers...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5" />
                    <span>Validate & Preview</span>
                  </>
                )}
              </button>

              {pasteResults.some((p) => p.status === 'valid') && (
                <button
                  type="button"
                  onClick={handleAddValidFromPaste}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md"
                >
                  Add {pasteResults.filter((p) => p.status === 'valid').length} Valid Positions
                </button>
              )}
            </div>

            {/* Validation Preview List */}
            {pasteResults.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  Parsed Results ({pasteResults.length})
                </h4>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {pasteResults.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
                        item.status === 'valid'
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                          : item.status === 'exists'
                          ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                          : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      <div>
                        <div className="font-bold flex items-center gap-2">
                          <span>{item.ticker}</span>
                          <span className="font-sans font-normal opacity-80">
                            {item.companyName || ''}
                          </span>
                        </div>
                        <div className="text-[10px] opacity-70 mt-0.5">
                          {item.shares} shares &bull; {item.exchange || 'N/A'} &bull; {item.currency || 'USD'}
                        </div>
                      </div>
                      <div className="text-right text-[11px] font-sans font-bold">
                        {item.status === 'valid' && <span className="text-emerald-400">Valid</span>}
                        {item.status === 'exists' && <span className="text-amber-400">{item.message}</span>}
                        {item.status === 'invalid' && <span className="text-rose-400">{item.message}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: CSV Import / Export */}
        {activeTab === 'csv' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Export Section */}
            <div className="p-4 rounded-xl bg-[#121826] border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Export Current Portfolio
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Download {holdings.length} holdings in CSV format with tickers, shares, currencies, and cost basis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  <span>Download CSV</span>
                </button>
              </div>
            </div>

            {/* Import Section */}
            <div className="p-4 rounded-xl bg-[#121826] border border-slate-800 space-y-4">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Import Portfolio CSV
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Upload a CSV file or paste raw content. Supported columns: ticker, companyName, shares, avgCost, exchange, country, currency.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Select CSV File</span>
                </button>

                <div className="flex items-center gap-2 text-xs">
                  <label className="text-slate-400">Mode:</label>
                  <select
                    value={csvImportMode}
                    onChange={(e) => setCsvImportMode(e.target.value as any)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-800 text-xs font-mono text-white"
                  >
                    <option value="merge">Merge with existing</option>
                    <option value="replace">Replace whole portfolio</option>
                  </select>
                </div>
              </div>

              {csvParseError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{csvParseError}</span>
                </div>
              )}

              {parsedCsvHoldings.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 font-mono">
                      Parsed {parsedCsvHoldings.length} holdings ready for import
                    </span>
                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md"
                    >
                      Confirm {csvImportMode === 'replace' ? 'Replacement' : 'Merge'}
                    </button>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1.5 font-mono text-xs">
                    {parsedCsvHoldings.slice(0, 30).map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-[#0B0F17] border border-slate-800 flex items-center justify-between text-slate-300"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{item.ticker}</span>
                          <span className="text-slate-500 truncate max-w-xs">{item.companyName}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {item.shares} sh &bull; {item.currency}
                        </div>
                      </div>
                    ))}
                    {parsedCsvHoldings.length > 30 && (
                      <div className="text-center text-slate-500 text-[11px] py-1">
                        + {parsedCsvHoldings.length - 30} more holdings
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Reset Sample Portfolio */}
        {activeTab === 'reset' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="p-4 rounded-xl bg-[#121826] border border-slate-800 space-y-3">
              <h3 className="text-sm font-bold text-white">Institutional Sample Portfolios</h3>
              <p className="text-xs text-slate-400">
                Quickly populate your portfolio with verified benchmarks to test performance, multi-currency valuations, and tail-risk calculations.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {/* Starter Portfolio Option */}
                <label
                  className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                    sampleChoice === 'starter'
                      ? 'bg-blue-500/10 border-blue-500 text-blue-200 ring-1 ring-blue-500'
                      : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="sample-choice"
                    value="starter"
                    checked={sampleChoice === 'starter'}
                    onChange={() => setSampleChoice('starter')}
                    className="sr-only"
                  />
                  <div className="font-bold text-white">Starter Portfolio (5 Holdings)</div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    The classic original 5 holdings: NVDA, TSM, AAPL, XOM, and LMT with historical weights.
                  </p>
                </label>

                {/* Global Portfolio Option */}
                <label
                  className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                    sampleChoice === 'global'
                      ? 'bg-blue-500/10 border-blue-500 text-blue-200 ring-1 ring-blue-500'
                      : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="sample-choice"
                    value="global"
                    checked={sampleChoice === 'global'}
                    onChange={() => setSampleChoice('global')}
                    className="sr-only"
                  />
                  <div className="font-bold text-white">Global Institutional (500 Holdings)</div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Comprehensive multi-currency portfolio across 36 countries, 40 exchanges, US, India (NSE/BSE), and global equities.
                  </p>
                </label>
              </div>

              {showResetConfirm ? (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-2.5 mt-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <div className="font-bold">Reset Portfolio?</div>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        This will replace your current {holdings.length} holdings with the{' '}
                        {sampleChoice === 'starter' ? '5 Starter' : '500 Global'} sample holdings.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(false)}
                      className="px-3 py-1 rounded-lg bg-slate-800 text-xs font-semibold text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onLoadSample(sampleChoice);
                        setShowResetConfirm(false);
                        setActiveTab('holdings');
                      }}
                      className="px-3.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white shadow-sm"
                    >
                      Confirm Reset
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md"
                  >
                    Load Sample ({sampleChoice === 'starter' ? '5' : '500'})
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-5 border-t border-slate-800 bg-[#0F1420]/90 flex items-center justify-between">
          <div className="text-xs text-slate-400 font-mono">
            Total Positions: <span className="font-bold text-white">{holdings.length}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
