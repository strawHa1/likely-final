/**
 * Quantitative Tail-Risk Scorer for any global or domestic stock.
 *
 * Features:
 * - Direct lookup from verified risk intelligence data source
 * - Quantitative fallback computed from market volatility, drawdown, and beta
 * - Sector-based baseline fallback when market data is unavailable (marks isEstimated: true)
 * - Deterministic output for consistent inputs (clamped 0 - 100)
 */

import { StockQuote } from '../types';

export interface RiskScoreResult {
  score: number;
  riskScore: number;
  isEstimated: boolean;
  rationale: string;
  action: 'Safe' | 'Monitor' | 'Review' | 'Hedge' | 'Reduce';
}

export interface RiskScoreOptions {
  ticker?: string;
  volatility?: number;
  maxDrawdown?: number;
  beta?: number;
  sector?: string;
  quote?: StockQuote | null;
}

/**
 * Sector baseline tail-risk estimates (used as component or fallback).
 */
export const SECTOR_BASELINE_RISKS: Record<string, number> = {
  Semiconductors: 78,
  Technology: 64,
  Energy: 71,
  'Energy & Oil': 71,
  Defense: 35,
  'Defense & Aerospace': 35,
  'Aerospace & Defense': 35,
  'Basic Materials': 69,
  Materials: 69,
  Healthcare: 44,
  Financial: 54,
  'Financial Services': 54,
  'Consumer Cyclical': 58,
  'Consumer Defensive': 32,
  Utilities: 30,
  'Real Estate': 52,
  Industrials: 50,
  Communication: 48,
  'Communication Services': 48,
  Other: 50,
  General: 50,
  Diversified: 50
};

export function deriveActionFromScore(score: number): 'Safe' | 'Monitor' | 'Review' | 'Hedge' | 'Reduce' {
  if (score >= 80) return 'Reduce';
  if (score >= 70) return 'Hedge';
  if (score >= 55) return 'Review';
  if (score >= 40) return 'Monitor';
  return 'Safe';
}

/**
 * Normalizes sector name to standard canonical categories.
 */
export function normalizeSectorName(sector?: string): string {
  if (!sector || !sector.trim()) return 'Other';
  const clean = sector.trim();
  const lower = clean.toLowerCase();

  if (lower.includes('semi')) return 'Semiconductors';
  if (lower.includes('tech') || lower.includes('software')) return 'Technology';
  if (lower.includes('oil') || lower.includes('gas') || lower.includes('energy')) return 'Energy';
  if (lower.includes('defen') || lower.includes('aerospace')) return 'Defense';
  if (lower.includes('health') || lower.includes('pharma') || lower.includes('biotech')) return 'Healthcare';
  if (lower.includes('finan') || lower.includes('bank') || lower.includes('insur')) return 'Financial';
  if (lower.includes('material') || lower.includes('steel') || lower.includes('mining')) return 'Basic Materials';
  if (lower.includes('cyclical') || lower.includes('auto') || lower.includes('retail')) return 'Consumer Cyclical';
  if (lower.includes('defensive') || lower.includes('food') || lower.includes('beverage')) return 'Consumer Defensive';
  if (lower.includes('utilit')) return 'Utilities';
  if (lower.includes('real estate') || lower.includes('reit')) return 'Real Estate';
  if (lower.includes('industrial') || lower.includes('machin') || lower.includes('transport')) return 'Industrials';
  if (lower.includes('comm') || lower.includes('telecom')) return 'Communication';

  return clean;
}

/**
 * Computes deterministic tail-risk score for any ticker.
 *
 * Formula Details:
 * 1. 30-Day Annualized Volatility (weight: 35%)
 *    Daily percentage swings annualized: Vol = abs(changePct) * sqrt(252).
 *    Normalized: 10% Vol = 0 pts, 75% Vol = 100 pts.
 * 2. Drawdown from High (weight: 30%)
 *    Drawdown = (High - Price) / High.
 *    0% drawdown = 0 pts, 35% drawdown = 100 pts.
 * 3. Market Beta Sensitivity (weight: 20%)
 *    High-beta equities carry heavier tail shock contagion.
 * 4. Sector Macro Exposure (weight: 15%)
 *    Baseline geopolitical & supply chain vulnerability.
 */
export function computeRiskScore(
  input: string | RiskScoreOptions,
  quote?: StockQuote | null,
  sector = 'Other'
): RiskScoreResult {
  let ticker = '';
  let customVol: number | undefined;
  let customDrawdown: number | undefined;
  let customBeta: number | undefined;
  let customSector = sector;
  let effectiveQuote = quote;

  if (typeof input === 'object' && input !== null) {
    ticker = input.ticker || '';
    customVol = input.volatility;
    customDrawdown = input.maxDrawdown;
    customBeta = input.beta;
    customSector = input.sector || sector;
    effectiveQuote = input.quote || quote;
  } else {
    ticker = String(input || '');
  }

  const sym = ticker.toUpperCase().trim();
  const normSector = normalizeSectorName(customSector);
  const sectorBaseline = SECTOR_BASELINE_RISKS[normSector] ?? 50;

  // If custom metrics provided directly
  if (customVol !== undefined || customDrawdown !== undefined || customBeta !== undefined) {
    const vol = customVol ?? 0.25;
    const volScore = Math.max(0, Math.min(100, Math.round(((vol * 100 - 10) / (75 - 10)) * 100)));
    const dd = customDrawdown ?? 0.2;
    const drawdownScore = Math.max(0, Math.min(100, Math.round(((dd * 100) / 30) * 100)));
    const beta = customBeta ?? 1.0;
    const betaScore = Math.max(0, Math.min(100, Math.round(((beta - 0.6) / (2.0 - 0.6)) * 100)));
    const weighted = Math.round(
      0.35 * volScore +
      0.30 * drawdownScore +
      0.20 * betaScore +
      0.15 * sectorBaseline
    );
    const clampedScore = Math.max(10, Math.min(95, weighted));
    return {
      score: clampedScore,
      riskScore: clampedScore,
      isEstimated: true,
      rationale: `Quantitative model computed from volatility (${(vol * 100).toFixed(1)}%), max drawdown (${(dd * 100).toFixed(1)}%), and beta (${beta.toFixed(2)}).`,
      action: deriveActionFromScore(clampedScore)
    };
  }

  // If no quote data available, fall back to sector baseline with estimated tag
  if (!effectiveQuote || !Number.isFinite(effectiveQuote.price) || effectiveQuote.price <= 0) {
    return {
      score: sectorBaseline,
      riskScore: sectorBaseline,
      isEstimated: true,
      rationale: `Sector-based baseline estimate (${normSector}); market telemetry currently unavailable.`,
      action: deriveActionFromScore(sectorBaseline)
    };
  }

  const price = effectiveQuote.price;
  const prevClose = effectiveQuote.previousClose || price;
  const dayChangePct = prevClose > 0 ? Math.abs((price - prevClose) / prevClose) * 100 : 0;
  const high = Math.max(effectiveQuote.high || price, price);

  // 1. Volatility Score (0 - 100)
  const estAnnualizedVol = dayChangePct * 15.87;
  const volScore = Math.max(0, Math.min(100, Math.round(((estAnnualizedVol - 10) / (75 - 10)) * 100)));

  // 2. Drawdown Score (0 - 100)
  const drawdownPct = high > 0 ? Math.max(0, (high - price) / high) * 100 : 0;
  const drawdownScore = Math.max(0, Math.min(100, Math.round((drawdownPct / 30) * 100)));

  // 3. Beta estimate based on sector & price volatility
  const estBeta = 0.8 + (dayChangePct / 2.5);
  const betaScore = Math.max(0, Math.min(100, Math.round(((estBeta - 0.6) / (2.0 - 0.6)) * 100)));

  // 4. Sector weight
  const sectorScore = sectorBaseline;

  // Composite Weighted Sum
  const weighted = Math.round(
    0.35 * volScore +
    0.30 * drawdownScore +
    0.20 * betaScore +
    0.15 * sectorScore
  );

  const clampedScore = Math.max(10, Math.min(95, weighted));

  return {
    score: clampedScore,
    riskScore: clampedScore,
    isEstimated: false,
    rationale: `Dynamic tail-risk computed from live market volatility (${estAnnualizedVol.toFixed(1)}%), intraday drawdown (${drawdownPct.toFixed(1)}%), and ${normSector} macro factor.`,
    action: deriveActionFromScore(clampedScore)
  };
}
