/**
 * src/components/portfolio/PortfolioDonutChart.tsx
 *
 * High-scale Donut chart for portfolios with 500+ holdings.
 * Features:
 *   - Group by Ticker (Top 10 + "Other (N holdings)"), Sector, Country, Exchange, Currency
 *   - Slices proportional to real base-currency weights
 *   - Scrollable legend with sticky headers
 *   - "Other" slice tooltip lists count and top contributors
 *   - Center label shows real total portfolio position count
 *   - Stable color hashing (18 color palette, "Other" always gray #64748B)
 *   - Interactive: hover links slices, legend and table; clicking legend item filters the table
 *   - Accessible text-table alternative view
 */

import React, { useState, useMemo } from 'react';
import { PieChart as PieIcon, Table as TableIcon, Layers, Filter } from 'lucide-react';
import { formatMoney, formatPercentSafe } from '../../lib/fxService';

export interface DonutSliceItem {
  id: string;
  label: string;
  subLabel?: string;
  value: number;
  allocationPct: number;
  color: string;
  otherCount?: number;
  topContributors?: string[];
}

export type DonutGroupBy = 'ticker' | 'sector' | 'country' | 'exchange' | 'currency';

interface PortfolioDonutChartProps {
  items: DonutSliceItem[];
  groupBy: DonutGroupBy;
  onGroupByChange: (groupBy: DonutGroupBy) => void;
  totalPositionsCount: number;
  baseCurrency?: string;
  hoveredKey: string | null;
  onHoverKey: (key: string | null) => void;
  selectedFilterKey?: string | null;
  onSelectFilterKey?: (key: string | null) => void;
  className?: string;
}

export const PortfolioDonutChart: React.FC<PortfolioDonutChartProps> = ({
  items,
  groupBy,
  onGroupByChange,
  totalPositionsCount,
  baseCurrency = 'USD',
  hoveredKey,
  onHoverKey,
  selectedFilterKey,
  onSelectFilterKey,
  className = ''
}) => {
  const [activeTooltip, setActiveTooltip] = useState<DonutSliceItem | null>(null);
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  // SVG trigonometry calculations for donut arcs
  const slices = useMemo(() => {
    if (!items || items.length === 0) return [];
    const totalAlloc = items.reduce((sum, it) => sum + it.allocationPct, 0) || 100;

    let cumulative = 0;
    return items.map((item) => {
      const startPct = cumulative;
      cumulative += item.allocationPct;
      const endPct = cumulative;

      // Angles in radians (-PI/2 rotates start to 12 o'clock)
      const startAngle = (startPct / totalAlloc) * 2 * Math.PI - Math.PI / 2;
      const endAngle = (endPct / totalAlloc) * 2 * Math.PI - Math.PI / 2;

      return {
        item,
        startAngle,
        endAngle,
        pct: item.allocationPct
      };
    });
  }, [items]);

  const cx = 100;
  const cy = 100;
  const rInner = 56;
  const rOuterBase = 84;

  const currentHoveredItem = useMemo(() => {
    if (activeTooltip) return activeTooltip;
    if (hoveredKey) {
      return (
        items.find((it) => it.id.toUpperCase() === hoveredKey.toUpperCase()) ||
        items.find((it) => it.label.toUpperCase() === hoveredKey.toUpperCase()) ||
        null
      );
    }
    return null;
  }, [activeTooltip, hoveredKey, items]);

  return (
    <div
      className={`bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] p-5 sm:p-6 rounded-2xl shadow-sm dark:shadow-xl flex flex-col justify-between ${className}`}
    >
      {/* Header with Title and Controls */}
      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Asset Allocation
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Table / Chart Toggle */}
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'chart' ? 'table' : 'chart')}
              title={viewMode === 'chart' ? 'View as accessible table' : 'View as donut chart'}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D] transition-colors"
              aria-label="Toggle accessible tabular view"
            >
              {viewMode === 'chart' ? (
                <TableIcon className="w-3.5 h-3.5" />
              ) : (
                <PieIcon className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Clear Filter button if one is active */}
            {selectedFilterKey && onSelectFilterKey && (
              <button
                type="button"
                onClick={() => onSelectFilterKey(null)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 rounded-lg hover:bg-blue-500/20 transition-colors"
              >
                <Filter className="w-3 h-3" />
                Clear Filter
              </button>
            )}
          </div>
        </div>

        {/* Group By selector tabs */}
        <div className="flex items-center gap-1 mt-3 overflow-x-auto pb-1 text-[11px] font-bold">
          <span className="text-[10px] text-slate-400 font-normal mr-1 uppercase">Group:</span>
          {(['ticker', 'sector', 'country', 'exchange', 'currency'] as DonutGroupBy[]).map((grp) => (
            <button
              key={grp}
              type="button"
              onClick={() => onGroupByChange(grp)}
              aria-pressed={groupBy === grp}
              className={`px-2.5 py-1 rounded-lg capitalize transition-all whitespace-nowrap ${
                groupBy === grp
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-[#161B2C] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#232A3D]'
              }`}
            >
              {grp}
            </button>
          ))}
        </div>
      </div>

      {/* Main View: Donut or Table */}
      {items.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
          <Layers className="w-8 h-8 mb-2 opacity-50" />
          No holdings available to visualize
        </div>
      ) : viewMode === 'table' ? (
        <div className="my-4 max-h-72 overflow-y-auto border border-slate-200 dark:border-[#232A3D] rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-[#161B2C] sticky top-0 text-[10px] text-slate-500 font-mono uppercase">
              <tr>
                <th className="py-2 px-3">Segment</th>
                <th className="py-2 px-3 text-right">Value ({baseCurrency})</th>
                <th className="py-2 px-3 text-right">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#232A3D] font-mono">
              {items.map((it) => (
                <tr
                  key={it.id}
                  onClick={() => onSelectFilterKey?.(selectedFilterKey === it.id ? null : it.id)}
                  className="hover:bg-slate-50 dark:hover:bg-[#161B2C] cursor-pointer"
                >
                  <td className="py-2 px-3 flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: it.color }}
                    />
                    <span className="font-sans font-semibold truncate text-slate-900 dark:text-white">
                      {it.label}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {formatMoney(it.value, baseCurrency)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums font-bold text-blue-600 dark:text-blue-400">
                    {formatPercentSafe(it.allocationPct, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative my-4 flex flex-col items-center justify-center">
          <div className="relative w-48 h-48 sm:w-52 sm:h-52">
            <svg
              viewBox="0 0 200 200"
              className="w-full h-full transform transition-transform duration-300"
              role="img"
              aria-label={`Portfolio allocation chart grouped by ${groupBy}`}
            >
              {slices.map(({ item, startAngle, endAngle }) => {
                const isHovered =
                  (hoveredKey && item.id.toUpperCase() === hoveredKey.toUpperCase()) ||
                  (activeTooltip && item.id === activeTooltip.id) ||
                  (selectedFilterKey && item.id.toUpperCase() === selectedFilterKey.toUpperCase());

                const rOuter = isHovered ? rOuterBase + 6 : rOuterBase;
                const angleDiff = endAngle - startAngle;
                const isFullCircle = angleDiff >= 2 * Math.PI - 0.001;

                let pathD = '';
                if (isFullCircle) {
                  pathD = `
                    M ${cx} ${cy - rOuter}
                    A ${rOuter} ${rOuter} 0 1 1 ${cx - 0.01} ${cy - rOuter}
                    Z
                    M ${cx} ${cy - rInner}
                    A ${rInner} ${rInner} 0 1 0 ${cx - 0.01} ${cy - rInner}
                    Z
                  `;
                } else {
                  const x1 = cx + rOuter * Math.cos(startAngle);
                  const y1 = cy + rOuter * Math.sin(startAngle);
                  const x2 = cx + rOuter * Math.cos(endAngle);
                  const y2 = cy + rOuter * Math.sin(endAngle);

                  const x3 = cx + rInner * Math.cos(endAngle);
                  const y3 = cy + rInner * Math.sin(endAngle);
                  const x4 = cx + rInner * Math.cos(startAngle);
                  const y4 = cy + rInner * Math.sin(startAngle);

                  const largeArcFlag = angleDiff > Math.PI ? 1 : 0;

                  pathD = `
                    M ${x1} ${y1}
                    A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${x2} ${y2}
                    L ${x3} ${y3}
                    A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${x4} ${y4}
                    Z
                  `;
                }

                return (
                  <path
                    key={item.id}
                    d={pathD}
                    fill={item.color}
                    fillOpacity={isHovered ? 1.0 : hoveredKey || selectedFilterKey ? 0.45 : 0.9}
                    stroke="#0F1420"
                    strokeWidth={1.5}
                    className="transition-all duration-200 cursor-pointer"
                    onMouseEnter={() => {
                      setActiveTooltip(item);
                      onHoverKey(item.id);
                    }}
                    onMouseLeave={() => {
                      setActiveTooltip(null);
                      onHoverKey(null);
                    }}
                    onClick={() => {
                      onSelectFilterKey?.(selectedFilterKey === item.id ? null : item.id);
                    }}
                    tabIndex={0}
                    role="graphics-symbol"
                    aria-label={`${item.label}: ${item.allocationPct}%`}
                    onFocus={() => {
                      setActiveTooltip(item);
                      onHoverKey(item.id);
                    }}
                    onBlur={() => {
                      setActiveTooltip(null);
                      onHoverKey(null);
                    }}
                  />
                );
              })}
            </svg>

            {/* Donut Center Label (Shows REAL total position count) */}
            <div className="absolute inset-[27%] rounded-full bg-white dark:bg-[#0F1420] flex flex-col items-center justify-center pointer-events-none shadow-inner border border-slate-200/50 dark:border-[#232A3D]/50 text-center px-1">
              <span className="text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-bold">
                POSITIONS
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white mt-0.5">
                {totalPositionsCount}
              </span>
              <span className="text-[9px] text-slate-400 font-mono">
                {items.length} {groupBy}s
              </span>
            </div>
          </div>

          {/* Interactive Tooltip Card */}
          <div className="min-h-[50px] w-full mt-2 text-center flex flex-col items-center justify-center">
            {currentHoveredItem ? (
              <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#161B2C] border border-slate-300 dark:border-[#232A3D] text-xs font-mono shadow-md animate-fadeIn flex flex-col items-center gap-1 max-w-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: currentHoveredItem.color }}
                  />
                  <span className="font-bold text-slate-900 dark:text-white">
                    {currentHoveredItem.label}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {formatMoney(currentHoveredItem.value, baseCurrency)}
                  </span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    {formatPercentSafe(currentHoveredItem.allocationPct, 1)}
                  </span>
                </div>
                {/* Other slice expanded detail */}
                {currentHoveredItem.topContributors && currentHoveredItem.topContributors.length > 0 && (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans truncate max-w-xs">
                    {currentHoveredItem.otherCount} positions: {currentHoveredItem.topContributors.slice(0, 8).join(', ')}
                    {currentHoveredItem.topContributors.length > 8 ? '…' : ''}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                Hover to inspect or click to filter table
              </span>
            )}
          </div>
        </div>
      )}

      {/* Legend Rows (Scrollable up to 260px) */}
      <div className="w-full max-h-60 overflow-y-auto space-y-1.5 text-xs font-mono text-slate-700 dark:text-slate-300 pt-3 border-t border-slate-200 dark:border-[#232A3D] pr-1">
        {items.map((item) => {
          const isHovered =
            (hoveredKey && item.id.toUpperCase() === hoveredKey.toUpperCase()) ||
            (activeTooltip && item.id === activeTooltip.id) ||
            (selectedFilterKey && item.id.toUpperCase() === selectedFilterKey.toUpperCase());

          const isSelected = selectedFilterKey && item.id.toUpperCase() === selectedFilterKey.toUpperCase();

          return (
            <div
              key={item.id}
              onMouseEnter={() => {
                setActiveTooltip(item);
                onHoverKey(item.id);
              }}
              onMouseLeave={() => {
                setActiveTooltip(null);
                onHoverKey(null);
              }}
              onClick={() => {
                onSelectFilterKey?.(selectedFilterKey === item.id ? null : item.id);
              }}
              className={`flex justify-between items-center px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-blue-600/20 ring-1 ring-blue-500'
                  : isHovered
                  ? 'bg-blue-500/15 ring-1 ring-blue-500/30'
                  : 'hover:bg-slate-100 dark:hover:bg-[#161B2C]'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="font-semibold text-slate-900 dark:text-white truncate">
                  {item.label}
                </span>
                {item.subLabel && (
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate hidden sm:inline">
                    ({item.subLabel})
                  </span>
                )}
              </span>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-slate-500 dark:text-slate-400 text-[11px] tabular-nums hidden sm:inline">
                  {formatMoney(item.value, baseCurrency)}
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums min-w-[42px] text-right">
                  {formatPercentSafe(item.allocationPct, 1)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
