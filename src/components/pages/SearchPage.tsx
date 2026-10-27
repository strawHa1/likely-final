import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Building2,
  Flame,
  Globe2,
  FileSpreadsheet,
  ChevronRight,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
  Loader2
} from 'lucide-react';
import { GlobalEvent, CompanyRisk, SearchResultItem } from '../../types';
import { INITIAL_REPORTS } from '../../data/mockData';
import { SeverityBadge } from '../common/SeverityBadge';
import { LiveStockPrice } from '../common/LiveStockPrice';
import { computeInvestmentRiskSignal } from '../../utils/riskSignal';
import { useCountryRisk } from '../../lib/useCountryRisk';

interface SearchPageProps {
  onNavigate: (path: string) => void;
  events: GlobalEvent[];
  companies: CompanyRisk[];
  userRiskTolerance?: number;
}

export const SearchPage: React.FC<SearchPageProps> = ({
  onNavigate,
  events,
  companies,
  userRiskTolerance = 55
}) => {
  const [query, setQuery] = useState('Taiwan');
  const [activeTab, setActiveTab] = useState<'all' | 'companies' | 'events' | 'countries' | 'reports'>('all');
  const [reports, setReports] = useState(INITIAL_REPORTS);
  const [liveSymbolResults, setLiveSymbolResults] = useState<SearchResultItem[]>([]);
  const [searchingSymbols, setSearchingSymbols] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { countries } = useCountryRisk();

  useEffect(() => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.reports) && d.reports.length > 0) {
          setReports(d.reports);
        }
      })
      .catch(() => {});
  }, []);

  // Debounced live symbol search proxying global exchanges
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setLiveSymbolResults([]);
      setSearchingSymbols(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSearchingSymbols(true);
    const timer = setTimeout(() => {
      fetch(`/api/symbols/search?q=${encodeURIComponent(q)}&limit=8`, {
        signal: controller.signal
      })
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d.results)) {
            setLiveSymbolResults(d.results);
          }
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            /* ignore */
          }
        })
        .finally(() => {
          setSearchingSymbols(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Merge static/cached companies with live symbol search results
  const matchedCompanies = useMemo(() => {
    const q = query.toLowerCase().trim();
    const map = new Map<string, CompanyRisk>();

    // 1. Check local companies prop
    for (const c of companies) {
      if (
        c.name.toLowerCase().includes(q) ||
        c.ticker.toLowerCase().includes(q) ||
        c.sector.toLowerCase().includes(q) ||
        c.country.toLowerCase().includes(q)
      ) {
        map.set(c.ticker.toUpperCase(), c);
      }
    }

    // 2. Merge live global search results
    for (const item of liveSymbolResults) {
      const sym = item.displaySymbol.toUpperCase();
      if (!map.has(sym)) {
        map.set(sym, {
          ticker: sym,
          name: item.name,
          sector: item.sector || 'Diversified',
          country: item.country || 'Global',
          marketCap: 'N/A',
          riskScore: 50,
          sentimentScore: 50,
          sentimentLabel: 'Neutral',
          description: `${item.name} (${sym}) — listed on ${item.exchange}.`,
          keyRisks: [`${item.exchange} market trading exposure`, `Sector volatility (${item.sector})`],
          aiSummary: `${item.name} quantitative tracking active on ${item.exchange}.`,
          recentNews: [],
          riskTrend: []
        });
      }
    }

    return Array.from(map.values());
  }, [query, companies, liveSymbolResults]);

  const matchedEvents = useMemo(() => {
    const q = query.toLowerCase().trim();
    return events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.region.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
    );
  }, [events, query]);

  // Universal country search across all 250 countries & territories
  const matchedCountries = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return countries.slice(0, 12);
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.isoCode.toLowerCase() === q ||
        c.region.toLowerCase().includes(q) ||
        (c.subregion && c.subregion.toLowerCase().includes(q))
    );
  }, [countries, query]);

  const matchedReports = useMemo(() => {
    const q = query.toLowerCase().trim();
    return reports.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        (Array.isArray(r.tags) && r.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }, [reports, query]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header & Big Search Input */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Global Terminal Search
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
            Universal search across all ~195+ countries, global equities (NSE, BSE, NYSE, NASDAQ, LSE, TSE, KRX), live risk signals, and macro events
          </p>
        </div>

        <div className="relative max-w-2xl">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any country or company (e.g. Brazil, Tata Steel, Samsung, Nestle, Visa, Taiwan, Hormuz)..."
            className="w-full bg-white dark:bg-[#0F1420] border-2 border-blue-500/50 rounded-2xl px-5 py-4 pl-12 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-600 font-sans shadow-md dark:shadow-2xl transition-colors"
          />
          <Search className="w-5 h-5 text-blue-600 dark:text-blue-400 absolute left-4 top-4.5" />
          {searchingSymbols && (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin absolute right-4 top-5" />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-[#232A3D] pb-1 overflow-x-auto">
        {[
          { id: 'all', label: 'All Results' },
          { id: 'companies', label: `Companies (${matchedCompanies.length})` },
          { id: 'countries', label: `Countries (${matchedCountries.length})` },
          { id: 'events', label: `Events (${matchedEvents.length})` },
          { id: 'reports', label: `Reports (${matchedReports.length})` }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-xs font-bold transition-all border-b-2 whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Results Content */}
      <div className="space-y-6">
        {/* Countries Section */}
        {(activeTab === 'all' || activeTab === 'countries') && matchedCountries.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Matched Countries & Geopolitical Regions ({matchedCountries.length})
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {matchedCountries.slice(0, activeTab === 'countries' ? 48 : 8).map((c) => (
                <div
                  key={c.id}
                  onClick={() => onNavigate(`/events?country=${encodeURIComponent(c.isoCode)}&region=${encodeURIComponent(c.region)}`)}
                  className="p-3.5 rounded-2xl bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] hover:border-blue-500/50 cursor-pointer transition-all shadow-sm space-y-2 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{c.flag}</span>
                    <SeverityBadge severity={c.riskLevel.toLowerCase()} size="sm" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-blue-500 transition-colors line-clamp-1">
                      {c.name}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      {c.region} • {c.isoCode}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-[#232A3D]/50 text-[10px] font-mono">
                    <span className="text-slate-500">{c.eventsCount > 0 ? `${c.eventsCount} events` : 'Baseline'}</span>
                    <span className="font-bold text-red-500 dark:text-red-400">{c.riskScore}/100</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Companies Section */}
        {(activeTab === 'all' || activeTab === 'companies') && matchedCompanies.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" /> Matched Companies & Risk Signals ({matchedCompanies.length})
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {matchedCompanies.slice(0, activeTab === 'companies' ? 24 : 6).map((c) => {
                const signal = computeInvestmentRiskSignal(c, 2, userRiskTolerance);

                return (
                  <div
                    key={c.ticker}
                    onClick={() => onNavigate(`/companies?symbol=${c.ticker}`)}
                    className="p-5 rounded-2xl bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] hover:border-blue-500/50 cursor-pointer transition-all shadow-sm dark:shadow-md space-y-4 group"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-[#232A3D]">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {c.name}
                          </h4>
                          <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded">
                            ${c.ticker}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{c.sector} • {c.country}</p>
                      </div>

                      {/* Live Price Widget */}
                      <div className="bg-slate-50 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D] px-3 py-2 rounded-xl shrink-0">
                        <LiveStockPrice symbol={c.ticker} size="sm" showDetails={true} />
                      </div>
                    </div>

                    {/* Signal & Score Row */}
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Signal:</span>
                        <span className={`px-2.5 py-1 rounded-lg font-bold border flex items-center gap-1 ${
                          signal.label === 'Favorable'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-300'
                            : signal.label === 'Neutral-Hold'
                            ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-400 border-sky-300'
                            : signal.label === 'Caution'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400 border-amber-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-400 border-rose-300'
                        }`}>
                          {signal.label}
                        </span>
                      </div>

                      <div className="font-mono text-xs text-slate-600 dark:text-slate-400">
                        Score: <strong className="text-slate-900 dark:text-white font-bold">{signal.compositeScore}/100</strong>
                        <span className="ml-2 text-[10px] text-slate-400">({signal.confidencePct}% Conf)</span>
                      </div>
                    </div>

                    {/* Key Drivers preview */}
                    <div className="bg-slate-50 dark:bg-[#161B2C] p-3 rounded-xl border border-slate-200 dark:border-[#232A3D] text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                      <div className="font-bold text-slate-700 dark:text-slate-400 text-[10px] uppercase flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-blue-500" /> Key Drivers:
                      </div>
                      <div className="line-clamp-2">
                        • {signal.keyDrivers.join(' • ')}
                      </div>
                    </div>

                    {/* Capital Loss Warning snippet if applicable */}
                    {signal.isCapitalLossWarning && (
                      <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 p-2.5 rounded-lg border border-rose-200 dark:border-rose-500/20 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <ShieldAlert className="w-4 h-4 shrink-0" /> Capital Loss Risk Warning Flagged
                        </span>
                        <span className="text-blue-600 dark:text-blue-400 font-sans hover:underline">Inspect Signal →</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Events Section */}
        {(activeTab === 'all' || activeTab === 'events') && matchedEvents.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-600 dark:text-red-400" /> Matched Global Events ({matchedEvents.length})
            </h3>

            <div className="space-y-3">
              {matchedEvents.map((e) => (
                <div
                  key={e.id}
                  onClick={() => onNavigate(`/events?id=${e.id}`)}
                  className="p-4 rounded-2xl bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] hover:border-slate-400 cursor-pointer transition-all space-y-1 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <SeverityBadge severity={e.severity} size="sm" />
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{e.reportedAt}</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">{e.title}</div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-1">{e.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reports Section */}
        {(activeTab === 'all' || activeTab === 'reports') && matchedReports.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Matched Intelligence Reports ({matchedReports.length})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {matchedReports.map((r) => (
                <div
                  key={r.id}
                  onClick={() => onNavigate(`/reports?id=${r.id}`)}
                  className="p-4 rounded-2xl bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] hover:border-emerald-500/50 cursor-pointer transition-all space-y-2 shadow-sm group"
                >
                  <div className="flex items-center justify-between">
                    <SeverityBadge severity={r.severityTag.toLowerCase()} size="sm" />
                    <span className="text-[10px] text-slate-400 font-mono">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'Recent'}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors line-clamp-1">
                    {r.title}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                    {r.summary}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {matchedCompanies.length === 0 &&
          matchedCountries.length === 0 &&
          matchedEvents.length === 0 &&
          matchedReports.length === 0 && (
            <div className="bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] p-12 rounded-2xl text-center space-y-2">
              <p className="text-base font-bold text-slate-800 dark:text-slate-200">
                No results found for "{query}"
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Try searching for any sovereign country (e.g. Brazil, Nigeria, Vietnam, Oman), or global equities (e.g. Tata Steel, Samsung, Nestle, NVDA, AAPL).
              </p>
            </div>
          )}
      </div>
    </div>
  );
};
