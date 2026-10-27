/**
 * src/components/portfolio/HedgePlanModal.tsx
 *
 * Tail-Risk Hedge Advisory Modal.
 * Supports both US options contracts and non-US / fractional advisory.
 */

import React, { useEffect } from 'react';
import {
  X,
  ShieldAlert,
  Info,
  CheckCircle2,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import { HedgeRecommendation } from '../../utils/portfolioMath';
import { formatMoney } from '../../lib/fxService';

interface HedgePlanModalProps {
  hedge: HedgeRecommendation;
  onClose: () => void;
  onNavigateToCompany: (ticker: string) => void;
  baseCurrency?: string;
}

export const HedgePlanModal: React.FC<HedgePlanModalProps> = ({
  hedge,
  onClose,
  onNavigateToCompany,
  baseCurrency = 'USD'
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const estimatedPremiumPerShare = Number((hedge.price * 0.028).toFixed(2));
  const totalEstimatedCost = Math.round(estimatedPremiumPerShare * hedge.shares);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hedge-plan-title"
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-[#0F1420] border border-slate-200 dark:border-[#232A3D] rounded-2xl shadow-2xl overflow-hidden text-slate-800 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-[#232A3D] bg-purple-500/10 dark:bg-purple-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 id="hedge-plan-title" className="text-base font-extrabold text-slate-900 dark:text-white">
                Hedge Plan — ${hedge.ticker}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {hedge.companyName} &bull; Tail-Risk Mitigation Protocol
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

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Strategy Card */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D] space-y-2">
            <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
              Recommended Protective Strategy
            </div>
            <div className="text-base font-extrabold text-slate-900 dark:text-white">
              {hedge.actionTitle}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {hedge.strategyDescription}
            </p>
          </div>

          {/* Sizing & Parameters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D]">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                Position Value
              </span>
              <div className="text-sm font-black font-mono text-slate-900 dark:text-white mt-1">
                {formatMoney(hedge.basePositionValue, baseCurrency)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D]">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                Shares Held
              </span>
              <div className="text-sm font-black font-mono text-purple-600 dark:text-purple-400 mt-1">
                {hedge.shares} shs
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D]">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                Strike Target
              </span>
              <div className="text-sm font-black font-mono text-slate-900 dark:text-white mt-1">
                ~{hedge.suggestedStrikeFormatted}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D]">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                Target Horizon
              </span>
              <div className="text-sm font-black font-mono text-slate-900 dark:text-white mt-1">
                {hedge.expiration}
              </div>
            </div>
          </div>

          {/* Execution Guidance */}
          {hedge.isNonUS ? (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5 text-amber-800 dark:text-amber-200">
              <div className="font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>International Asset Advisory</span>
              </div>
              <p className="leading-relaxed text-[11px]">
                {hedge.ticker} trades on {hedge.exchange} outside standard US equity options exchanges. To hedge downside risk, consider utilizing index put options on correlated regional ETFs, or reducing exposure to your target risk band.
              </p>
            </div>
          ) : hedge.insufficientShares ? (
            <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs space-y-1.5 text-sky-800 dark:text-sky-200">
              <div className="font-bold flex items-center gap-2">
                <Info className="w-4 h-4 text-sky-500" />
                <span>Fractional Position Advisory</span>
              </div>
              <p className="leading-relaxed text-[11px]">
                Standard exchange-traded equity put contracts represent 100 shares. Since your position holds {hedge.shares} shares, a standard contract would over-hedge your position. We recommend setting a downside stop-loss order or trimming high-beta exposure.
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs space-y-1.5">
              <div className="font-bold text-blue-600 dark:text-blue-300 flex items-center justify-between">
                <span>Estimated Premium Budget</span>
                <span className="font-mono">
                  ~{formatMoney(totalEstimatedCost, hedge.currency)} (~2.8% of notional)
                </span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
                Target {hedge.contractsNeeded} protective put contract{hedge.contractsNeeded > 1 ? 's' : ''} expiring in ~60 days. If an adverse event causes a sharp decline, the options offset holding losses below the strike price.
              </p>
            </div>
          )}

          {/* Disclaimer */}
          <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#161B2C] border border-slate-200 dark:border-[#232A3D] text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
            <span>{hedge.disclaimer}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-[#232A3D] bg-slate-50/50 dark:bg-[#161B2C]/50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigateToCompany(hedge.ticker);
            }}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            Open ${hedge.ticker} Details →
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-colors shadow-sm"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
};
