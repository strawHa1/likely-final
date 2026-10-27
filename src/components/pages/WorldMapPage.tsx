import React, { useState, useMemo } from 'react';
import {
  Map as MapIcon,
  Globe2,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ArrowUpDown,
  Layers,
  ShieldCheck,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { SeverityBadge } from '../common/SeverityBadge';
import { AUTO_REFRESH_LABEL, useCountryRisk } from '../../lib/useCountryRisk';
import { LiveCountryRisk } from '../../types';

function MonthSparkline({ values }: { values?: (number | null)[] }) {
  if (!values || values.length < 2) return null;
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = Math.max(1, max - min);
  const w = 72;
  const h = 22;
  const pts = values
    .map((v, i) => {
      if (v == null) return null;
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline fill="none" stroke="#60A5FA" strokeWidth="1.5" points={pts} />
    </svg>
  );
}

interface WorldMapPageProps {
  onNavigate: (path: string) => void;
}

const ITEMS_PER_PAGE = 24;

export const WorldMapPage: React.FC<WorldMapPageProps> = ({ onNavigate }) => {
  const { countries, lastUpdated, loading, refreshing, error, changedIds, refresh, dismissError } =
    useCountryRisk();
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');
  const [sortBy, setSortBy] = useState<'risk' | 'name' | 'events'>('risk');
  const [groupByRegion, setGroupByRegion] = useState(false);
  const [page, setPage] = useState(1);

  // Derive unique region list from available countries
  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const c of countries) {
      if (c.region) set.add(c.region);
    }
    return Array.from(set).sort();
  }, [countries]);

  // Filter & sort countries
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result = countries.filter((c) => {
      // Risk level filter
      if (filterLevel !== 'all' && c.riskLevel.toLowerCase() !== filterLevel.toLowerCase()) {
        return false;
      }
      // Region filter
      if (filterRegion !== 'all' && c.region.toLowerCase() !== filterRegion.toLowerCase()) {
        return false;
      }
      // Text search
      if (q) {
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesIso = c.isoCode.toLowerCase() === q;
        const matchesRegion = c.region.toLowerCase().includes(q);
        const matchesSubregion = (c.subregion || '').toLowerCase().includes(q);
        if (!matchesName && !matchesIso && !matchesRegion && !matchesSubregion) {
          return false;
        }
      }
      return true;
    });

    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'events') {
        if (b.eventsCount !== a.eventsCount) return b.eventsCount - a.eventsCount;
        return b.riskScore - a.riskScore;
      }
      // default: risk
      if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [countries, searchQuery, filterRegion, filterLevel, sortBy]);

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, filterRegion, filterLevel, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    if (groupByRegion) return filtered;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage, groupByRegion]);

  // Grouped structure when groupByRegion is enabled
  const grouped = useMemo(() => {
    if (!groupByRegion) return null;
    const map = new Map<string, LiveCountryRisk[]>();
    for (const c of filtered) {
      const reg = c.region || 'Global';
      if (!map.has(reg)) map.set(reg, []);
      map.get(reg)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, groupByRegion]);

  const active =
    countries.find((c) => c.id === selectedCountryId) ||
    filtered[0] ||
    countries[0] ||
    null;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-blue-400 font-bold uppercase tracking-wider">
            <MapIcon className="w-4 h-4" />
            GIS Geopolitical & Maritime Risk Heatmap
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight mt-1">World Risk Map</h1>
          <p className="text-slate-400 text-xs mt-0.5">
            Global coverage for all ~195+ sovereign countries & territories with live risk intelligence
            {lastUpdated && ` • Updated ${new Date(lastUpdated).toLocaleTimeString()}`}
            {' · '}30-day history snapshots daily at 16:05 ET
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="p-2.5 rounded-xl bg-[#161B2C] border border-[#232A3D] text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
            title="Refresh country risk scores"
          >
            <RefreshCw className={`w-4 h-4 ${loading || refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-[#0F1420] border border-[#232A3D] p-3.5 rounded-2xl shadow-md">
        {/* Search Input */}
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search any country (e.g. Brazil, Nigeria, Vietnam, Oman)..."
            className="w-full bg-[#161B2C] border border-[#232A3D] rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-sans"
          />
        </div>

        {/* Region Filter */}
        <div>
          <select
            value={filterRegion}
            onChange={(e) => setFilterRegion(e.target.value)}
            className="w-full bg-[#161B2C] border border-[#232A3D] text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Regions ({countries.length})</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* Risk Level Filter */}
        <div>
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="w-full bg-[#161B2C] border border-[#232A3D] text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Risk Levels</option>
            <option value="critical">Critical (80-100)</option>
            <option value="high">High (65-79)</option>
            <option value="medium">Medium (45-64)</option>
            <option value="low">Low (0-44)</option>
          </select>
        </div>

        {/* Sort & Group Options */}
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="flex-1 bg-[#161B2C] border border-[#232A3D] text-slate-200 text-xs rounded-xl px-2.5 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="risk">Highest Risk</option>
            <option value="name">Alphabetical (A - Z)</option>
            <option value="events">Most Events</option>
          </select>
          <button
            type="button"
            onClick={() => setGroupByRegion(!groupByRegion)}
            className={`p-2 rounded-xl border text-xs font-bold transition-colors ${
              groupByRegion
                ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                : 'bg-[#161B2C] border-[#232A3D] text-slate-400 hover:text-white'
            }`}
            title="Toggle Group by Region"
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading && countries.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400 mb-3" />
          <p className="text-xs">Computing live regional risk scores across all 195+ countries...</p>
        </div>
      ) : error && countries.length === 0 ? (
        <div className="bg-[#0F1420] border border-red-500/30 p-8 rounded-2xl text-center">
          <p className="text-red-400 font-bold text-sm">Data temporarily unavailable</p>
          <button onClick={refresh} className="mt-2 text-xs text-blue-400 hover:underline">Retry</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {error && countries.length > 0 && (
            <div className="lg:col-span-3 flex items-center justify-between gap-3 bg-[#0F1420] border border-amber-500/30 text-amber-300 text-xs px-4 py-2.5 rounded-xl">
              <span>Refresh failed — showing last known good data. Next auto-refresh will retry.</span>
              <div className="flex items-center gap-3 shrink-0">
                <button type="button" onClick={refresh} className="text-blue-400 hover:underline font-semibold">
                  Retry now
                </button>
                <button type="button" onClick={dismissError} className="text-slate-400 hover:text-white">
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Left 2 Cols: Country Grid */}
          <div className="lg:col-span-2 bg-[#0F1420] border border-[#232A3D] rounded-2xl p-6 shadow-2xl min-h-[520px] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-[#232A3D] pb-3">
                <span className="flex items-center gap-2">
                  <Globe2 className="w-4 h-4 text-blue-400" />
                  Showing {filtered.length} of {countries.length} countries & territories
                </span>
                <span className="flex items-center gap-3">
                  <span className={`flex items-center gap-1.5 text-emerald-400 ${refreshing ? 'animate-pulse' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${refreshing ? 'animate-pulse' : ''}`} />
                    Live Feed
                  </span>
                  <span className="text-emerald-500">Live {AUTO_REFRESH_LABEL} · history daily</span>
                </span>
              </div>

              {filtered.length === 0 ? (
                <div className="py-24 text-center text-slate-500 text-xs">
                  No country matched "{searchQuery}". Try searching by another name, ISO code, or clear filters.
                </div>
              ) : groupByRegion && grouped ? (
                /* Grouped by Region View */
                <div className="py-4 space-y-6 max-h-[560px] overflow-y-auto custom-scrollbar pr-1">
                  {grouped.map(([regName, groupList]) => (
                    <div key={regName} className="space-y-2">
                      <div className="text-xs font-mono font-bold text-blue-400 uppercase tracking-wider flex items-center justify-between border-b border-[#232A3D]/60 pb-1">
                        <span>{regName}</span>
                        <span className="text-[10px] text-slate-500">{groupList.length} countries</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {groupList.map((cnt) => renderCountryCard(cnt))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Paginated Grid View */
                <div className="my-auto py-4 relative">
                  <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#3B82F6_1px,transparent_1px)] [background-size:20px_20px]" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 z-10 relative max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
                    {paginated.map((cnt) => renderCountryCard(cnt))}
                  </div>
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            {!groupByRegion && totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-[#232A3D] text-xs font-mono text-slate-400">
                <span>
                  Page {currentPage} of {totalPages} ({filtered.length} total)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="p-1.5 rounded-lg border border-[#232A3D] bg-[#161B2C] text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalPages > 5 && currentPage > 3) {
                      pageNum = Math.min(totalPages - 4 + i, Math.max(1, currentPage - 2 + i));
                    }
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setPage(pageNum)}
                        className={`w-7 h-7 rounded-lg border text-xs font-mono font-bold ${
                          currentPage === pageNum
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'border-[#232A3D] bg-[#161B2C] text-slate-400 hover:text-white'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="p-1.5 rounded-lg border border-[#232A3D] bg-[#161B2C] text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Col: Country Risk Profile Detail Panel */}
          <div className="bg-[#0F1420] border border-[#232A3D] p-6 rounded-2xl shadow-xl flex flex-col justify-between">
            {active ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#232A3D]">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{active.flag}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-extrabold text-white">{active.name}</h3>
                        {active.isHotspot && (
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/30">
                            Hotspot
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {active.region}
                        {active.subregion && active.subregion !== active.region ? ` • ${active.subregion}` : ''}
                        {' • '}{active.isoCode}
                      </div>
                    </div>
                  </div>
                  <SeverityBadge severity={active.riskLevel.toLowerCase()} size="sm" />
                </div>

                {/* Score & Events Grid */}
                <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                  <div className="bg-[#161B2C] border border-[#232A3D] p-3 rounded-xl">
                    <span className="text-[10px] text-slate-400 uppercase">Risk Score</span>
                    <div className="text-xl font-extrabold text-red-400 mt-0.5">{active.riskScore}/100</div>
                    {active.scoreChanged && active.previousScore != null && (
                      <div className="text-[10px] text-amber-400 mt-0.5">was {active.previousScore}</div>
                    )}
                  </div>
                  <div className="bg-[#161B2C] border border-[#232A3D] p-3 rounded-xl">
                    <span className="text-[10px] text-slate-400 uppercase">Active Events</span>
                    <div className="text-xl font-extrabold text-blue-400 mt-0.5">{active.eventsCount}</div>
                    {active.eventsCount === 0 && (
                      <div className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Baseline
                      </div>
                    )}
                  </div>
                </div>

                {/* 30-Day Trend */}
                <div className="bg-[#161B2C] border border-[#232A3D] p-3 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 uppercase font-mono">30-day score</span>
                    {active.monthDelta != null && (
                      <span
                        className={`text-[10px] font-mono ${
                          active.monthDelta > 0
                            ? 'text-red-400'
                            : active.monthDelta < 0
                            ? 'text-emerald-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {active.monthDelta > 0 ? '+' : ''}
                        {active.monthDelta} vs month start
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <MonthSparkline values={active.sparkline} />
                  </div>
                </div>

                {/* Key Risks Vectors */}
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">
                    {active.eventsCount > 0 ? 'Active Geopolitical Shock Vectors' : 'Regional Baseline Vectors'}
                  </h4>
                  <ul className="space-y-2 text-xs text-slate-300">
                    {active.keyRisks.slice(0, 5).map((risk, idx) => (
                      <li key={idx} className="p-2.5 rounded-lg bg-[#161B2C] border border-[#232A3D] flex gap-2">
                        <span className="text-red-400 font-bold shrink-0">•</span>
                        <span className="line-clamp-2">{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Action CTA */}
                <button
                  type="button"
                  onClick={() =>
                    onNavigate(
                      `/events?country=${encodeURIComponent(active.isoCode)}&region=${encodeURIComponent(
                        active.region
                      )}`
                    )
                  }
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-xs transition-all shadow-md active:scale-95"
                >
                  View Country Events Feed ({active.name}) →
                </button>
              </div>
            ) : (
              <p className="text-center text-slate-400 text-xs py-12">Select a country to view its risk profile.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  function renderCountryCard(cnt: LiveCountryRisk) {
    const isSelected = active?.id === cnt.id;
    const justChanged = changedIds.has(cnt.id);
    let borderColor = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    if (cnt.riskLevel === 'Critical') borderColor = 'border-red-500/50 bg-red-500/15 text-red-300';
    else if (cnt.riskLevel === 'High') borderColor = 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    else if (cnt.riskLevel === 'Medium') borderColor = 'border-blue-500/30 bg-blue-500/10 text-blue-300';

    return (
      <div
        key={cnt.id}
        onClick={() => setSelectedCountryId(cnt.id)}
        className={`p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] ${borderColor} ${
          isSelected ? 'ring-2 ring-purple-500 scale-[1.02]' : ''
        } ${justChanged ? 'animate-pulse ring-2 ring-yellow-400/60' : ''}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-lg">{cnt.flag}</span>
          <span className="text-xs font-mono font-bold">{cnt.riskScore}/100</span>
        </div>
        <div className="text-sm font-extrabold text-white mt-1.5 line-clamp-1 flex items-center gap-1">
          <span>{cnt.name}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-slate-400 font-mono">
            {cnt.eventsCount > 0 ? `${cnt.eventsCount} events` : 'Baseline'}
          </span>
          {cnt.monthDelta != null ? (
            <span
              className={`text-[10px] font-mono ${
                cnt.monthDelta > 0
                  ? 'text-red-400'
                  : cnt.monthDelta < 0
                  ? 'text-emerald-400'
                  : 'text-slate-500'
              }`}
            >
              30d {cnt.monthDelta > 0 ? '+' : ''}
              {cnt.monthDelta}
            </span>
          ) : (
            <span className="text-[10px] text-slate-500 font-mono">{cnt.region}</span>
          )}
        </div>
        <div className="mt-1">
          <MonthSparkline values={cnt.sparkline} />
        </div>
      </div>
    );
  }
};
