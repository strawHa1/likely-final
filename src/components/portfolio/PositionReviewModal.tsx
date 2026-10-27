import React, { useEffect, useState } from 'react';
import {
  X,
  ShieldAlert,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Sliders,
  DollarSign,
  PieChart as PieIcon,
  Briefcase,
  Globe
} from 'lucide-react';
import { BaseHolding, formatCurrency, formatPercent, getRiskSignalBand } from '../../utils/portfolioMath';
import { CompanyRisk, CompanyProfile } from '../../types';
import { fetchCompanyProfile } from '../../lib/watchlistService';

interface PositionReviewModalProps {
  holding: BaseHolding & {
    positionValue: number;
    allocationPct: number;
    isFlagged: boolean;
    country?: string;
    region?: string;
    action?: string;
  };
  company?: CompanyRisk;
  userTolerance: number;
  onClose: () => void;
  onOpenHedgePlan: (ticker: string) => void;
  onNavigateToCompany: (ticker: string) => void;
}

export const PositionReviewModal: React.FC<PositionReviewModalProps> = ({
  holding,
  company,
  userTolerance,
  onClose,
  onOpenHedgePlan,
  onNavigateToCompany
}) => {
  const [liveCompany, setLiveCompany] = useState<CompanyProfile | CompanyRisk | null>(company || null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch company profile dynamically if not provided in mock data
  useEffect(() => {
    if (!company) {
      fetchCompanyProfile(holding.ticker)
        .then((p) => {
          if (p) setLiveCompany(p);
        })
        .catch(() => {});
    }
  }, [company, holding.ticker]);

  const signal = getRiskSignalBand(holding.riskScore, userTolerance);
  const activeCompany = liveCompany || company;
  const countryName = holding.country || activeCompany?.country || 'Global';

  const contributingFactors = [
    `Baseline institutional tail-risk score of ${holding.riskScore}/100.`,
    holding.isFlagged
      ? `Exceeds your configured risk tolerance threshold of ${userTolerance}/100.`
      : `Within your configured risk tolerance threshold of ${userTolerance}/100.`,
    activeCompany?.keyRisks?.[0] || `Sector concentration exposure in ${holding.sector} (${countryName}).`,
    `Represents ${holding.allocationPct}% of total portfolio capital (${formatCurrency(
      holding.positionValue
    )}).`
  ];

  const suggestedAction = holding.isFlagged
    ? holding.riskScore > userTolerance + 20
      ? 'High Risk: Consider protective put options or reducing position weight below 15% to mitigate downside tail-risk.'
      : 'Caution: Consider hedging with options or setting a trailing stop-loss to limit drawdowns.'
    : 'Hold & Monitor: Position risk profile aligns with current portfolio parameters.';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] rounded-2xl shadow-2xl overflow-hidden text-slate-800 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#232A3D] bg-slate-50/50 dark:bg-[#161B2C]/50">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                holding.isFlagged
                  ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                  : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
              }`}
            >
              {holding.isFlagged ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <Briefcase className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="modal-title" className="text-base font-extrabold text-slate-900 dark:text-white">
                  ${holding.ticker}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                  {holding.name}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                <span>{holding.sector}</span>
                <span>&bull;</span>
                <span>{countryName}</span>
                <span>&bull;</span>
                <span>{holding.shares} Shares @ ${holding.price.toFixed(2)}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#232A3D] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D]">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                Position Value
              </span>
              <div className="text-sm font-black font-mono text-slate-900 dark:text-white mt-1">
                {formatCurrency(holding.positionValue)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D]">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                Portfolio Allocation
              </span>
              <div className="text-sm font-black font-mono text-blue-600 dark:text-blue-400 mt-1">
                {formatPercent(holding.allocationPct, 1)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D]">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                Risk Score
              </span>
              <div className="text-sm font-black font-mono mt-1 flex items-center gap-1.5">
                <span className={signal.textColor}>{holding.riskScore}</span>
                <span className="text-[10px] text-slate-400 font-normal">/ 100</span>
              </div>
            </div>
          </div>

          {/* Signal Status Banner */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              holding.isFlagged
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {holding.isFlagged ? (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              )}
              <span className="text-xs font-bold">
                {holding.isFlagged
                  ? `Position Flagged (Exceeds Tolerance ${userTolerance}/100)`
                  : 'Position Within Acceptable Risk Tolerance'}
              </span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${signal.badgeClass}`}
            >
              {holding.action || signal.label}
            </span>
          </div>

          {/* Contributing Factors */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
              Contributing Risk Factors
            </h4>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              {contributingFactors.map((factor, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">&bull;</span>
                  <span>{factor}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Suggested Action */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D]">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1">
              Suggested Risk Mitigation
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {suggestedAction}
            </p>
          </div>
        </div>

        {/* Footer CTAs */}
        <div className="p-4 border-t border-slate-200 dark:border-[#232A3D] bg-slate-50/50 dark:bg-[#161B2C]/50 flex flex-wrap items-center justify-end gap-2.5">
          {holding.isFlagged && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenHedgePlan(holding.ticker);
              }}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Review Hedge Plan
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigateToCompany(holding.ticker);
            }}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Company Intelligence
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-[#232A3D] text-slate-800 dark:text-slate-200 text-xs font-semibold hover:bg-slate-300 dark:hover:bg-[#2e374f] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
