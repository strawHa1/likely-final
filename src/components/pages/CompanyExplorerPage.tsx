import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2,
  Loader2,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Info,
  Pin,
  PinOff,
  Briefcase,
  Globe,
  PlusCircle,
  X
} from 'lucide-react';
import { CompanyRisk } from '../../types';
import { LiveStockPrice } from '../common/LiveStockPrice';
import {
  MarketSearch,
  getQuickAccessChips,
  addRecentSearch
} from '../common/MarketSearch';
import { useCompanyProfile } from '../../lib/useCompanyProfile';
import { computeInvestmentRiskSignal, InvestmentSignalLabel } from '../../utils/riskSignal';
import { isPinned, togglePin, addWatchlistItem, removeWatchlistItem } from '../../lib/watchlistService';
import { executeTrade, getHolding } from '../../lib/portfolioService';

interface CompanyExplorerPageProps {
  initialSymbol?: string;
  filter?: string;
  filterTickers?: string[];
  onNavigate: (path: string) => void;
  companies: CompanyRisk[];
  userRiskTolerance?: number;
  theme?: 'light' | 'dark';
}

function profitStatus(label: InvestmentSignalLabel): { text: string; detail: string; positive: boolean } {
  switch (label) {
    case 'Favorable':
      return { text: 'Good to Invest', detail: 'Strong profit potential with manageable risk', positive: true };
    case 'Neutral-Hold':
      return { text: 'Hold / Wait', detail: 'Moderate profit potential — monitor before investing', positive: false };
    case 'Caution':
      return { text: 'Invest with Caution', detail: 'Limited profit potential; elevated risk of drawdown', positive: false };
    case 'High Risk':
    default:
      return { text: 'Not Recommended', detail: 'High loss risk outweighs profit potential', positive: false };
  }
}

function signalIcon(label: InvestmentSignalLabel) {
  switch (label) {
    case 'Favorable': return CheckCircle2;
    case 'Neutral-Hold': return Info;
    case 'Caution': return AlertTriangle;
    default: return ShieldAlert;
  }
}

export const CompanyExplorerPage: React.FC<CompanyExplorerPageProps> = ({
  initialSymbol = '',
  filter = '',
  filterTickers = [],
  onNavigate,
  companies,
  userRiskTolerance = 55
}) => {
  const isAtRiskView = filter === 'at-risk';
  const [selectedTicker, setSelectedTicker] = useState(initialSymbol.toUpperCase());
  const [chips, setChips] = useState<{ ticker: string; name?: string }[]>(getQuickAccessChips(10));
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeAmount, setTradeAmount] = useState('5000');
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);

  const hasSelection = selectedTicker.length > 0;

  const { profile, loading, notFound, error, refresh } = useCompanyProfile(
    hasSelection ? selectedTicker : '',
    8_000
  );

  const refreshChips = useCallback(() => {
    setChips(getQuickAccessChips(10));
  }, []);

  useEffect(() => {
    setSelectedTicker(initialSymbol ? initialSymbol.toUpperCase() : '');
  }, [initialSymbol]);

  useEffect(() => {
    if (selectedTicker) {
      setIsInWatchlist(isPinned(selectedTicker));
    }
  }, [selectedTicker]);

  useEffect(() => {
    refreshChips();
    const onRecent = () => refreshChips();
    window.addEventListener('bs-recent-updated', onRecent);
    return () => window.removeEventListener('bs-recent-updated', onRecent);
  }, [refreshChips]);

  const handleSelect = useCallback((ticker: string, name?: string) => {
    addRecentSearch(ticker, name);
    setSelectedTicker(ticker.toUpperCase());
    refreshChips();
  }, [refreshChips]);

  const fallbackCompany = companies.find((c) => c.ticker === selectedTicker);
  const displayCompany: CompanyRisk | null = profile
    ? {
        ticker: profile.ticker,
        name: profile.name,
        sector: profile.sector,
        country: profile.country,
        marketCap: profile.marketCap,
        riskScore: profile.riskScore,
        sentimentScore: profile.sentimentScore,
        sentimentLabel: profile.sentimentLabel as CompanyRisk['sentimentLabel'],
        description: profile.description,
        keyRisks: profile.keyRisks,
        aiSummary: profile.aiSummary,
        recentNews: fallbackCompany?.recentNews || [],
        riskTrend: profile.riskTrend
      }
    : fallbackCompany || null;

  const signal = useMemo(() => {
    if (!displayCompany) return null;
    return computeInvestmentRiskSignal(
      displayCompany,
      profile?.activeImpactCount ?? 0,
      userRiskTolerance
    );
  }, [displayCompany, profile?.activeImpactCount, userRiskTolerance]);

  const profit = signal ? profitStatus(signal.label) : null;
  const SignalIcon = signal ? signalIcon(signal.label) : Info;

  const handleToggleWatchlist = async () => {
    if (!displayCompany) return;
    const nextState = !isInWatchlist;
    setIsInWatchlist(nextState);
    if (nextState) {
      await addWatchlistItem({
        ticker: displayCompany.ticker,
        companyName: displayCompany.name,
        sector: displayCompany.sector,
        exchange: profile?.exchange || 'US',
        country: displayCompany.country,
        region: profile?.region || 'Global'
      });
    } else {
      await removeWatchlistItem(displayCompany.ticker);
    }
    refreshChips();
  };

  const handleExecuteTrade = () => {
    if (!displayCompany) return;
    const amt = parseFloat(tradeAmount);
    if (!amt || amt <= 0) return;
    const price = profile?.quote?.price || 150;

    const res = executeTrade({
      action: 'invest',
      ticker: displayCompany.ticker,
      companyName: displayCompany.name,
      amount: amt,
      price,
      riskScore: displayCompany.riskScore,
      sector: displayCompany.sector,
      country: displayCompany.country,
      region: profile?.region || 'Global',
      countryIso: profile?.countryIso,
      countryFlag: profile?.countryFlag,
      recommendedAction: profile?.action
    });

    if (res.ok) {
      setTradeSuccess(`Added $${amt.toLocaleString()} of $${displayCompany.ticker} to portfolio!`);
      setTimeout(() => {
        setTradeSuccess(null);
        setShowTradeModal(false);
      }, 1500);
    } else {
      alert(res.error || 'Failed to add holding');
    }
  };

  if (isAtRiskView && !hasSelection) {
    return (
      <div className="min-h-[calc(100vh-4rem)] p-6 max-w-4xl mx-auto font-sans space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-purple-400 font-bold uppercase tracking-wider">
            <Building2 className="w-4 h-4" />
            Companies at Risk
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight mt-1">High-Risk Watchlist</h1>
          <p className="text-slate-400 text-xs mt-1">
            Live news-to-price impact signals across global exchanges
          </p>
        </div>

        {filterTickers.length === 0 ? (
          <div className="bg-[#0F1420] border border-[#232A3D] p-8 rounded-2xl text-center text-slate-400 text-sm">
            No impacted companies detected right now. Check back after the next news refresh.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filterTickers.map((ticker) => (
              <button
                key={ticker}
                type="button"
                onClick={() => onNavigate(`/companies?symbol=${encodeURIComponent(ticker)}`)}
                className="text-left p-4 rounded-xl bg-[#0F1420] border border-[#232A3D] hover:border-purple-500/50 transition-all space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">${ticker}</span>
                  <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                    At Risk
                  </span>
                </div>
                <LiveStockPrice symbol={ticker} size="sm" showDetails={false} />
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => onNavigate('/companies')}
          className="text-xs text-blue-400 hover:underline font-semibold"
        >
          ← Search all companies
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col p-4 sm:p-6 max-w-3xl mx-auto font-sans">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 text-xs font-mono text-purple-600 dark:text-purple-400 font-bold uppercase tracking-wider">
          <Building2 className="w-4 h-4" />
          Global Company Explorer
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
          Search any company globally (NSE, BSE, NYSE, NASDAQ, LSE, TSE, KRX) to inspect risk & profit status
        </p>
      </div>

      {/* Centered search */}
      <div className="flex flex-col items-center justify-center flex-1">
        <div className="w-full max-w-lg">
          <MarketSearch
            onSelect={handleSelect}
            onAddToPortfolio={(item) => {
              handleSelect(item.symbol, item.name);
              setShowTradeModal(true);
            }}
            placeholder="Search company — Tata Steel, Samsung, Nestle, Apple, TSLA..."
            className="w-full"
            wide
          />
        </div>

        {chips.length > 0 && !hasSelection && (
          <div className="flex items-center justify-center gap-2 flex-wrap mt-4 max-w-lg">
            {chips.slice(0, 8).map(({ ticker, name }) => (
              <button
                key={ticker}
                onClick={() => handleSelect(ticker, name)}
                className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-white dark:bg-[#0F1420] text-slate-700 dark:text-slate-400 border border-slate-200 dark:border-[#232A3D] hover:border-blue-500 transition-colors"
              >
                ${ticker}
              </button>
            ))}
          </div>
        )}

        {!hasSelection && (
          <p className="text-center text-xs text-slate-500 mt-8">
            Type any listed company name or ticker above to get started
          </p>
        )}

        {hasSelection && loading && !displayCompany && (
          <div className="flex flex-col items-center py-12 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400 mb-3" />
            <p className="text-xs">Analyzing {selectedTicker} live market and geopolitical data...</p>
          </div>
        )}

        {hasSelection && notFound && (
          <div className="mt-8 w-full max-w-lg bg-[#0F1420] border border-amber-500/30 p-8 rounded-2xl text-center">
            <p className="text-sm font-bold text-white">Company not found</p>
            <p className="text-xs text-slate-400 mt-1">Try another global ticker or company name.</p>
          </div>
        )}

        {hasSelection && error && !displayCompany && (
          <div className="mt-8 w-full max-w-lg bg-[#0F1420] border border-red-500/30 p-8 rounded-2xl text-center">
            <p className="text-red-400 text-sm font-bold">Unable to fetch live data</p>
            <button onClick={refresh} className="mt-2 text-xs text-blue-400 hover:underline">Retry</button>
          </div>
        )}

        {hasSelection && displayCompany && signal && profit && (
          <div className="mt-8 w-full max-w-lg space-y-4 animate-in fade-in duration-300">
            {/* Company header card */}
            <div className="bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] rounded-2xl p-5 text-center shadow-md">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-[#232A3D]/50 text-xs">
                <span className="flex items-center gap-1.5 font-medium text-slate-500 dark:text-slate-400">
                  <span className="text-base">{profile?.countryFlag || '🌐'}</span>
                  <span>{displayCompany.country}</span>
                  <span>•</span>
                  <span>{profile?.region || 'Global'}</span>
                  <span>•</span>
                  <span className="font-mono font-bold text-blue-500">{profile?.exchange || 'US'}</span>
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                  profile?.action === 'Safe' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                  profile?.action === 'Monitor' ? 'bg-sky-500/10 text-sky-500 border border-sky-500/20' :
                  profile?.action === 'Review' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                  'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                }`}>
                  Action: {profile?.action || 'Monitor'}
                </span>
              </div>

              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{displayCompany.name}</h2>
              <p className="text-sm font-mono font-bold text-blue-500 dark:text-blue-400 mt-0.5">${displayCompany.ticker}</p>
              <p className="text-xs text-slate-500 mt-1">{displayCompany.sector} • Market Cap: {displayCompany.marketCap}</p>

              <div className="mt-4 flex justify-center">
                <LiveStockPrice symbol={displayCompany.ticker} size="md" showDetails />
              </div>

              {/* Action buttons */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-[#232A3D] flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleToggleWatchlist}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 border shadow-sm ${
                    isInWatchlist
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                      : 'bg-slate-100 dark:bg-[#161B2C] border-slate-200 dark:border-[#232A3D] text-slate-700 dark:text-slate-300 hover:border-blue-500'
                  }`}
                >
                  {isInWatchlist ? <Pin className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> : <PinOff className="w-3.5 h-3.5" />}
                  {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowTradeModal(true)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Add to Portfolio
                </button>
              </div>
            </div>

            {/* Risk & Profit cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] rounded-2xl p-5 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Tail-Risk Score</p>
                <div className="flex items-center gap-2">
                  <SignalIcon className={`w-5 h-5 ${
                    signal.label === 'Favorable' ? 'text-emerald-500' :
                    signal.label === 'Neutral-Hold' ? 'text-sky-500' :
                    signal.label === 'Caution' ? 'text-amber-500' : 'text-red-500'
                  }`} />
                  <span className="text-lg font-bold text-slate-900 dark:text-white">{signal.label}</span>
                </div>
                <p className="text-2xl font-extrabold font-mono mt-2 text-slate-900 dark:text-white">
                  {signal.compositeScore}<span className="text-sm text-slate-500">/100</span>
                </p>
                <div className="w-full h-2 bg-slate-200 dark:bg-[#232A3D] rounded-full mt-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      signal.compositeScore >= 75 ? 'bg-red-500' :
                      signal.compositeScore >= 55 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${signal.compositeScore}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Sentiment: {displayCompany.sentimentLabel} ({displayCompany.sentimentScore}/100)
                </p>
              </div>

              <div className={`border rounded-2xl p-5 shadow-sm ${
                profit.positive
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                  : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
              }`}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Profit / Invest Status</p>
                <div className="flex items-center gap-2">
                  {profit.positive ? (
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-amber-500" />
                  )}
                  <span className={`text-lg font-bold ${
                    profit.positive ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                  }`}>
                    {profit.text}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-3 leading-relaxed">
                  {profit.detail}
                </p>
                {signal.isCapitalLossWarning && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-3 font-medium">
                    ⚠ Risk exceeds your tolerance ({userRiskTolerance}/100)
                  </p>
                )}
              </div>
            </div>

            {/* Key driver summary */}
            <div className="bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] rounded-2xl p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Key Risk Factors</p>
              <ul className="space-y-1.5">
                {displayCompany.keyRisks.slice(0, 4).map((d, i) => (
                  <li key={i} className="text-xs text-slate-600 dark:text-slate-300 flex gap-2">
                    <span className="text-blue-500 shrink-0">•</span>{d}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Add to Portfolio Modal */}
        {showTradeModal && displayCompany && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-md bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#232A3D]">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-blue-500" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Add ${displayCompany.ticker} to Portfolio</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTradeModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase">Investment Amount (USD)</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
                    <input
                      type="number"
                      min="100"
                      step="100"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#161B2C] border border-slate-300 dark:border-[#232A3D] font-mono text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D] space-y-1 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Live Price:</span>
                    <span className="font-bold text-slate-900 dark:text-white">${profile?.quote?.price?.toFixed(2) || '150.00'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Est. Shares:</span>
                    <span className="font-bold text-blue-500">
                      {((parseFloat(tradeAmount) || 0) / (profile?.quote?.price || 150)).toFixed(2)} shs
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Country & Region:</span>
                    <span className="font-bold text-slate-900 dark:text-white">{displayCompany.country} ({profile?.region || 'Global'})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tail-Risk Score:</span>
                    <span className="font-bold text-red-400">{displayCompany.riskScore}/100</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Action:</span>
                    <span className="font-bold text-amber-400">{profile?.action || 'Monitor'}</span>
                  </div>
                </div>

                {tradeSuccess && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs text-center font-bold">
                    {tradeSuccess}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-[#232A3D]">
                <button
                  type="button"
                  onClick={() => setShowTradeModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#161B2C] text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-[#232A3D]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteTrade}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md active:scale-95"
                >
                  Confirm Position
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
