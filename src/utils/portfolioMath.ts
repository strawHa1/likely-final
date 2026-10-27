/**
 * src/utils/portfolioMath.ts
 *
 * Mathematical engine and single source of truth for Portfolio Risk calculations.
 *
 * Core capabilities:
 *   1. Position valuation: shares * livePrice (fallback: previousClose, fallback: avgCost)
 *   2. Base-currency multi-FX conversion with minor unit normalization (GBp, ILA, ZAc)
 *   3. Cost basis, unrealized P/L ($ and %) tracking
 *   4. Day change calculation: Σ shares * (price - prevClose) in base currency
 *      Day change % = day change $ / (totalValue - day change $) * 100
 *   5. Largest Remainder allocation algorithm (Hamilton / Hare-Niemeyer):
 *      guarantees allocations sum to EXACTLY 100.0% (1 dec, or 2 dec if any holding < 1%)
 *   6. Herfindahl-Hirschman index (HHI) concentration metrics for Sectors and Countries
 *   7. Clamped Composite Tail-Risk score with tolerance-driven risk bands
 *   8. Institutional hedge sizing with options accessibility checks (US vs non-US)
 */

import {
  convertCurrency,
  formatMoney,
  formatPercentSafe,
  normalizeCurrencyCode
} from '../lib/fxService';

export type BaseHolding = BaseHoldingInput;

export interface BaseHoldingInput {
  id?: string;
  ticker: string;
  companyName?: string;
  name?: string;
  exchange?: string;
  country?: string;
  currency?: string;
  sector?: string;
  shares: number;
  avgCost?: number;
  price?: number;
  prevClose?: number;
  riskScore?: number;
  addedAt?: number;
  isEstimatedRisk?: boolean;
}

export type RiskSignalBand = 'Favorable' | 'Neutral-Hold' | 'Caution' | 'High-Risk';

export interface RiskSignalBandMeta {
  band: RiskSignalBand;
  label: string;
  badgeClass: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
}

export interface ComputedHolding {
  id: string;
  ticker: string;
  companyName: string;
  name: string;
  exchange: string;
  country: string;
  currency: string;
  sector: string;
  shares: number;
  avgCost?: number;
  costBasis?: number;
  price: number;
  prevClose: number;
  quoteStatus: 'live' | 'prevClose' | 'costBasisOnly';
  costBasisOnly: boolean;
  unrealizedProfitLossDollar?: number;
  unrealizedProfitLossPct?: number;
  nativePositionValue: number;
  basePositionValue: number;
  nativeDayChangeDollar: number;
  baseDayChangeDollar: number;
  dayChangePct: number;
  allocationPct: number;
  riskScore: number;
  isEstimatedRisk: boolean;
  isFlagged: boolean;
  signalBand: RiskSignalBandMeta;
  hasMissingFxRate: boolean;
  hasMissingFx?: boolean;
  positionValue: number;
  effectivePrice: number;
  effectivePriceSource: 'live' | 'prevClose' | 'costBasis' | 'costBasisOnly';
  addedAt?: number;
}

export interface AllocationGroup {
  key: string;
  label: string;
  value: number;
  allocationPct: number;
  count: number;
  tickers: string[];
}

export interface CompositeTailRiskResult {
  score: number;
  label: 'Low' | 'Moderate' | 'High' | 'Severe' | 'No positions';
  labelClass: string;
  concentrationPenalty: number;
  baseWeightedScore: number;
  sectorHHI: number;
  countryHHI: number;
  topSector: { name: string; allocationPct: number };
  topCountry: { name: string; allocationPct: number };
}

export interface HedgeRecommendation {
  ticker: string;
  companyName: string;
  shares: number;
  price: number;
  exchange: string;
  currency: string;
  basePositionValue: number;
  contractsNeeded: number;
  contractsLabel: string;
  insufficientShares: boolean;
  isNonUS: boolean;
  actionTitle: string;
  strategyDescription: string;
  suggestedStrike: number;
  suggestedStrikeFormatted: string;
  expiration: string;
  riskScore: number;
  allocationPct: number;
  disclaimer: string;
}

/**
 * 1. Resolves effective price: live price > prevClose > avgCost.
 * Returns the price and the status flag.
 */
export function resolveEffectivePrice(
  livePrice?: number | null,
  prevClose?: number | null,
  avgCost?: number | null
): { price: number; prevClose: number; status: 'live' | 'prevClose' | 'costBasisOnly'; source: 'live' | 'prevClose' | 'costBasis' } {
  if (livePrice !== undefined && livePrice !== null && Number.isFinite(livePrice) && livePrice > 0) {
    const pc = prevClose && Number.isFinite(prevClose) && prevClose > 0 ? prevClose : livePrice;
    return { price: livePrice, prevClose: pc, status: 'live', source: 'live' };
  }

  if (prevClose !== undefined && prevClose !== null && Number.isFinite(prevClose) && prevClose > 0) {
    return { price: prevClose, prevClose, status: 'prevClose', source: 'prevClose' };
  }

  if (avgCost !== undefined && avgCost !== null && Number.isFinite(avgCost) && avgCost > 0) {
    return { price: avgCost, prevClose: avgCost, status: 'costBasisOnly', source: 'costBasis' };
  }

  return { price: 0, prevClose: 0, status: 'costBasisOnly', source: 'costBasis' };
}

/**
 * 2. Position value = shares * price (in native currency)
 */
export function computePositionValue(shares: number, price: number): number {
  if (!Number.isFinite(shares) || !Number.isFinite(price) || shares < 0 || price < 0) {
    return 0;
  }
  return shares * price;
}

/**
 * 3. Allocations rounded using Largest Remainder Method (Hamilton/Hare-Niemeyer).
 * Guarantees that allocations sum to EXACTLY 100.0%.
 * Automatically selects 2 decimals when any item has raw allocation < 1.0%,
 * otherwise uses 1 decimal.
 */
export function computeAllocationsLargestRemainder(
  values: number[],
  forceDecimals?: number
): number[] {
  if (!Array.isArray(values) || values.length === 0) return [];

  const total = values.reduce((sum, v) => sum + (Number.isFinite(v) && v > 0 ? v : 0), 0);
  if (total <= 0) {
    return values.map(() => 0);
  }

  // Calculate raw percentages
  const rawPcts = values.map((v) => {
    const val = Number.isFinite(v) && v > 0 ? v : 0;
    return (val / total) * 100;
  });

  // Decide decimals: if any holding < 1.0%, use 2 decimals, otherwise 1 decimal
  const anyUnderOne = rawPcts.some((p) => p > 0 && p < 1.0);
  const decimals = forceDecimals !== undefined ? forceDecimals : anyUnderOne ? 2 : 1;

  const multiplier = Math.pow(10, decimals);
  const targetSum = 100 * multiplier; // e.g. 1000 for 1 dec, 10000 for 2 dec

  const scaled = rawPcts.map((p) => p * multiplier);
  const floored = scaled.map((s) => Math.floor(s));
  const remainders = scaled.map((s, idx) => ({
    index: idx,
    remainder: s - floored[idx]
  }));

  const currentSum = floored.reduce((sum, f) => sum + f, 0);
  const difference = Math.round(targetSum - currentSum);

  // Sort by remainder descending to allocate shortfalls to largest fractional parts
  remainders.sort((a, b) => b.remainder - a.remainder);

  const result = [...floored];
  for (let i = 0; i < difference && i < remainders.length; i++) {
    result[remainders[i].index] += 1;
  }

  return result.map((r) => Number((r / multiplier).toFixed(decimals)));
}

/**
 * 4. Risk signal band mapping relative to user risk tolerance.
 */
export function getRiskSignalBand(riskScore: number, tolerance = 55): RiskSignalBandMeta {
  const score = Math.max(0, Math.min(100, Math.round(riskScore || 0)));
  const tol = Math.max(10, Math.min(90, Math.round(tolerance || 55)));

  if (score < 40) {
    return {
      band: 'Favorable',
      label: 'Favorable',
      badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      textColor: 'text-emerald-500',
      bgColor: 'bg-emerald-500/15',
      borderColor: 'border-emerald-500/30'
    };
  }

  if (score <= tol) {
    return {
      band: 'Neutral-Hold',
      label: 'Neutral-Hold',
      badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
      textColor: 'text-sky-500',
      bgColor: 'bg-sky-500/15',
      borderColor: 'border-sky-500/30'
    };
  }

  if (score <= tol + 20) {
    return {
      band: 'Caution',
      label: 'Caution',
      badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
      textColor: 'text-amber-500',
      bgColor: 'bg-amber-500/15',
      borderColor: 'border-amber-500/30'
    };
  }

  return {
    band: 'High-Risk',
    label: 'High-Risk',
    badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
    textColor: 'text-rose-500',
    bgColor: 'bg-rose-500/15',
    borderColor: 'border-rose-500/30'
  };
}

export function isPositionFlagged(riskScore: number, tolerance = 55): boolean {
  return (riskScore || 0) > (tolerance || 55);
}

/**
 * 5. Full transformation of raw holding entries into ComputedHoldings.
 * Converts to base currency, computes day change, cost basis, unrealized P/L,
 * allocation percentages (guaranteed 100%), and flags.
 */
export function computePortfolioHoldings(
  holdings: BaseHoldingInput[],
  quotesMap: Record<string, { price: number; previousClose?: number } | undefined>,
  arg3?: string | Record<string, number>,
  arg4?: number | string,
  arg5?: Record<string, number> | number
): {
  holdings: ComputedHolding[];
  totalValue: number;
  dayChangeDollar: number;
  dayChangePct: number;
  flaggedHoldings: ComputedHolding[];
  missingFxCount: number;
} {
  let baseCurrency = 'USD';
  let tolerance = 55;
  let fxRates: Record<string, number> | undefined;

  if (typeof arg3 === 'object' && arg3 !== null) {
    fxRates = arg3 as Record<string, number>;
    if (typeof arg4 === 'string') baseCurrency = arg4;
    if (typeof arg5 === 'number') tolerance = arg5;
  } else {
    if (typeof arg3 === 'string') baseCurrency = arg3;
    if (typeof arg4 === 'number') tolerance = arg4;
    if (typeof arg5 === 'object' && arg5 !== null) fxRates = arg5 as Record<string, number>;
  }

  const makeDualResult = (arr: any[], extra: any) => {
    Object.assign(arr, extra);
    (arr as any).holdings = arr;
    return arr as any;
  };

  if (!Array.isArray(holdings) || holdings.length === 0) {
    return makeDualResult([], {
      totalValue: 0,
      dayChangeDollar: 0,
      dayChangePct: 0,
      flaggedHoldings: [],
      missingFxCount: 0
    });
  }

  let missingFxCount = 0;

  // First pass: resolve prices, values, and base currency conversions
  const intermediate = holdings.map((h, idx) => {
    const sym = h.ticker.toUpperCase().trim();
    const liveQuote = quotesMap[sym] || quotesMap[sym.split('.')[0]];
    const rawPrice = liveQuote?.price;
    const rawPrevClose = liveQuote?.previousClose;

    const { price, prevClose, status } = resolveEffectivePrice(rawPrice, rawPrevClose, h.avgCost);
    const shares = Number.isFinite(h.shares) && h.shares > 0 ? h.shares : 0;
    const currency = h.currency || 'USD';

    const nativePositionValue = computePositionValue(shares, price);
    const nativeDayChange = shares * (price - prevClose);
    const dayChangePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    // Convert to base currency
    const fxVal = convertCurrency(nativePositionValue, currency, baseCurrency, fxRates);
    const fxDay = convertCurrency(nativeDayChange, currency, baseCurrency, fxRates);

    const hasMissingFxRate = fxVal === null;
    if (hasMissingFxRate) missingFxCount++;

    const basePositionValue = fxVal ? fxVal.value : 0;
    const baseDayChangeDollar = fxDay ? fxDay.value : 0;

    // Cost basis & unrealized P/L
    let costBasis: number | undefined;
    let unrealizedProfitLossDollar: number | undefined;
    let unrealizedProfitLossPct: number | undefined;

    if (h.avgCost !== undefined && Number.isFinite(h.avgCost) && h.avgCost > 0) {
      costBasis = shares * h.avgCost;
      unrealizedProfitLossDollar = nativePositionValue - costBasis;
      unrealizedProfitLossPct = costBasis > 0 ? (unrealizedProfitLossDollar / costBasis) * 100 : 0;
    }

    const riskScore = h.riskScore !== undefined ? h.riskScore : 50;
    const isFlagged = isPositionFlagged(riskScore, tolerance);
    const signalBand = getRiskSignalBand(riskScore, tolerance);

    return {
      id: h.id || `port-${idx + 1}`,
      ticker: h.ticker,
      companyName: h.companyName || h.name || h.ticker,
      name: h.companyName || h.name || h.ticker,
      exchange: h.exchange || 'NASDAQ',
      country: h.country || 'US',
      currency,
      sector: h.sector || 'General',
      shares,
      avgCost: h.avgCost,
      costBasis,
      price,
      prevClose,
      quoteStatus: status,
      costBasisOnly: status === 'costBasisOnly',
      unrealizedProfitLossDollar,
      unrealizedProfitLossPct,
      nativePositionValue,
      basePositionValue,
      nativeDayChangeDollar: nativeDayChange,
      baseDayChangeDollar,
      dayChangePct,
      allocationPct: 0, // will be populated in second pass
      riskScore,
      isEstimatedRisk: Boolean(h.isEstimatedRisk),
      isFlagged,
      signalBand,
      hasMissingFxRate,
      hasMissingFx: hasMissingFxRate,
      positionValue: basePositionValue,
      effectivePrice: price,
      effectivePriceSource: status,
      addedAt: h.addedAt
    };
  });

  // Calculate total base portfolio value (excluding missing FX holdings)
  const totalValue = intermediate.reduce(
    (sum, h) => sum + (h.hasMissingFxRate ? 0 : h.basePositionValue),
    0
  );

  // Compute exact allocation percentages using Largest Remainder Method
  const validValues = intermediate.map((h) => (h.hasMissingFxRate ? 0 : h.basePositionValue));
  const roundedAllocations = computeAllocationsLargestRemainder(validValues);

  const finalized: ComputedHolding[] = intermediate.map((h, idx) => ({
    ...h,
    allocationPct: roundedAllocations[idx] || 0
  }));

  // Day change calculations
  const totalDayChangeDollar = finalized.reduce(
    (sum, h) => sum + (h.hasMissingFxRate ? 0 : h.baseDayChangeDollar),
    0
  );

  const prevTotal = totalValue - totalDayChangeDollar;
  const dayChangePct = prevTotal > 0 ? (totalDayChangeDollar / prevTotal) * 100 : 0;

  const flaggedHoldings = finalized.filter((h) => h.isFlagged);

  return makeDualResult(finalized, {
    totalValue,
    dayChangeDollar: totalDayChangeDollar,
    dayChangePct,
    flaggedHoldings,
    missingFxCount
  });
}

/**
 * 6. Generic grouping for allocation donut and breakdown tables
 * (Supports grouping by Sector, Country, Exchange, Currency, or Risk Band).
 */
export function computeAllocationGrouping(
  holdings: ComputedHolding[],
  groupBy: 'sector' | 'country' | 'exchange' | 'currency' | 'signalBand',
  totalValue: number
): AllocationGroup[] {
  if (!Array.isArray(holdings) || holdings.length === 0 || totalValue <= 0) return [];

  const map = new Map<string, { value: number; count: number; tickers: string[]; label: string }>();

  for (const h of holdings) {
    if (h.hasMissingFxRate) continue;
    let key = '';
    let label = '';

    switch (groupBy) {
      case 'sector':
        key = h.sector?.trim() || 'Other';
        label = key;
        break;
      case 'country':
        key = h.country?.trim() || 'Global';
        label = key;
        break;
      case 'exchange':
        key = h.exchange?.trim() || 'Global';
        label = key;
        break;
      case 'currency':
        key = h.currency?.trim() || 'USD';
        label = key;
        break;
      case 'signalBand':
        key = h.signalBand.band;
        label = h.signalBand.label;
        break;
    }

    const current = map.get(key) || { value: 0, count: 0, tickers: [], label };
    current.value += h.basePositionValue;
    current.count += 1;
    current.tickers.push(h.ticker);
    map.set(key, current);
  }

  const groups = Array.from(map.entries()).map(([key, data]) => ({
    key,
    label: data.label,
    value: data.value,
    allocationPct: 0,
    count: data.count,
    tickers: data.tickers
  }));

  const values = groups.map((g) => g.value);
  const roundedAllocations = computeAllocationsLargestRemainder(values);

  groups.forEach((g, idx) => {
    g.allocationPct = roundedAllocations[idx] || 0;
  });

  return groups.sort((a, b) => b.value - a.value);
}

/**
 * 7. Composite Tail-Risk Score:
 *    Formula:
 *      baseWeightedScore = Σ (allocation_i / 100) * riskScore_i
 *      HHI_sector = Σ (sectorWeight_k / 100)^2
 *      concentrationPenalty = round(HHI_sector * 16)
 *      compositeScore = clamp(round(baseWeightedScore + concentrationPenalty), 0, 100)
 */
export function computeCompositeTailRiskScore(
  holdings: ComputedHolding[],
  tolerance = 55
): CompositeTailRiskResult {
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return {
      score: 0,
      label: 'No positions',
      labelClass: 'text-slate-400',
      concentrationPenalty: 0,
      baseWeightedScore: 0,
      sectorHHI: 0,
      countryHHI: 0,
      topSector: { name: 'None', allocationPct: 0 },
      topCountry: { name: 'None', allocationPct: 0 }
    };
  }

  const totalAlloc = holdings.reduce((sum, h) => sum + (h.allocationPct || 0), 0) || 100;
  const baseWeightedScore = holdings.reduce(
    (sum, h) => sum + (h.riskScore || 0) * ((h.allocationPct || 0) / totalAlloc),
    0
  );

  // Sector weights and HHI
  const sectorWeightMap = new Map<string, number>();
  for (const h of holdings) {
    const s = h.sector?.trim() || 'General';
    sectorWeightMap.set(s, (sectorWeightMap.get(s) || 0) + (h.allocationPct || 0));
  }

  let sectorHHI = 0;
  let topSectorName = 'General';
  let topSectorAlloc = 0;

  for (const [sector, allocPct] of sectorWeightMap.entries()) {
    const weight = allocPct / 100;
    sectorHHI += weight * weight;
    if (allocPct > topSectorAlloc) {
      topSectorAlloc = allocPct;
      topSectorName = sector;
    }
  }

  // Country weights and HHI
  const countryWeightMap = new Map<string, number>();
  for (const h of holdings) {
    const c = h.country?.trim() || 'Global';
    countryWeightMap.set(c, (countryWeightMap.get(c) || 0) + (h.allocationPct || 0));
  }

  let countryHHI = 0;
  let topCountryName = 'Global';
  let topCountryAlloc = 0;

  for (const [country, allocPct] of countryWeightMap.entries()) {
    const weight = allocPct / 100;
    countryHHI += weight * weight;
    if (allocPct > topCountryAlloc) {
      topCountryAlloc = allocPct;
      topCountryName = country;
    }
  }

  // Concentration penalty (0 - 16 pts)
  const concentrationPenalty = Math.round(sectorHHI * 16);
  const rawScore = Math.round(baseWeightedScore + concentrationPenalty);
  const score = Math.max(0, Math.min(100, rawScore));

  let label: 'Low' | 'Moderate' | 'High' | 'Severe';
  let labelClass: string;

  if (score < 40) {
    label = 'Low';
    labelClass = 'text-emerald-500';
  } else if (score <= tolerance) {
    label = 'Moderate';
    labelClass = 'text-amber-500';
  } else if (score <= tolerance + 20) {
    label = 'High';
    labelClass = 'text-orange-500';
  } else {
    label = 'Severe';
    labelClass = 'text-rose-500';
  }

  return {
    score,
    label,
    labelClass,
    concentrationPenalty,
    baseWeightedScore: Math.round(baseWeightedScore),
    sectorHHI: Number(sectorHHI.toFixed(4)),
    countryHHI: Number(countryHHI.toFixed(4)),
    topSector: {
      name: topSectorName,
      allocationPct: Number(topSectorAlloc.toFixed(1))
    },
    topCountry: {
      name: topCountryName,
      allocationPct: Number(topCountryAlloc.toFixed(1))
    }
  };
}

/**
 * Correlated liquid hedge proxy ETFs for major international regions
 */
const COUNTRY_ETF_PROXIES: Record<string, string> = {
  IN: 'INDA (iShares MSCI India ETF)',
  JP: 'EWJ (iShares MSCI Japan ETF)',
  KR: 'EWY (iShares MSCI South Korea ETF)',
  TW: 'EWT (iShares MSCI Taiwan ETF)',
  GB: 'EWU (iShares MSCI United Kingdom ETF)',
  DE: 'EWG (iShares MSCI Germany ETF)',
  FR: 'EWQ (iShares MSCI France ETF)',
  CH: 'EWL (iShares MSCI Switzerland ETF)',
  AU: 'EWA (iShares MSCI Australia ETF)',
  CN: 'FXI (iShares China Large-Cap ETF)',
  HK: 'EWH (iShares MSCI Hong Kong ETF)',
  BR: 'EWZ (iShares MSCI Brazil ETF)'
};

/**
 * 8. Tail-Risk Hedge Recommendation:
 *    Selects flagged holding with highest (riskScore * allocationPct).
 *    Contracts = floor(shares / 100). Minimum 1 if shares >= 100.
 *    If shares < 100: "insufficient shares for a standard option contract".
 *    If non-US exchange: warns and suggests position reduction or correlated ETF proxy.
 */
export function generateHedgeRecommendation(
  holdings: ComputedHolding[],
  arg2: number = 55,
  arg3?: number,
  arg4?: string
): HedgeRecommendation | null {
  if (!Array.isArray(holdings) || holdings.length === 0) return null;

  let tolerance = 55;
  if (typeof arg2 === 'number' && arg2 > 0 && arg2 <= 100) {
    tolerance = arg2;
  }

  const flagged = holdings.filter((h) => (h.isFlagged !== undefined ? h.isFlagged : isPositionFlagged(h.riskScore || 50, tolerance)));
  if (flagged.length === 0) return null;

  // Pick highest (riskScore * allocationPct)
  let candidate = flagged[0];
  let maxProduct = (candidate.riskScore || 0) * (candidate.allocationPct || 0);

  for (let i = 1; i < flagged.length; i++) {
    const prod = (flagged[i].riskScore || 0) * (flagged[i].allocationPct || 0);
    if (prod > maxProduct) {
      maxProduct = prod;
      candidate = flagged[i];
    }
  }

  const isUS =
    ['NYSE', 'NASDAQ', 'AMEX', 'CBOE', 'US'].includes(candidate.exchange?.toUpperCase()) &&
    !candidate.ticker.includes('.');

  const hasStandardContract = candidate.shares >= 100;
  const contractsNeeded = hasStandardContract ? Math.max(1, Math.floor(candidate.shares / 100)) : 0;
  const contractsLabel = hasStandardContract
    ? `${contractsNeeded} contract${contractsNeeded > 1 ? 's' : ''}`
    : 'insufficient shares for a standard option contract';

  const effPrice = candidate.effectivePrice || candidate.price || 100;
  const suggestedStrike = Math.round(effPrice * 0.92);
  const suggestedStrikeFormatted = formatMoney(suggestedStrike, candidate.currency);

  let actionTitle = '';
  let strategyDescription = '';

  if (isUS && hasStandardContract) {
    actionTitle = `Buy ${candidate.ticker} 60-Day Out-Of-The-Money Puts`;
    strategyDescription = `Protective OTM Put (${contractsNeeded} contract${
      contractsNeeded > 1 ? 's' : ''
    } @ ~${suggestedStrikeFormatted} Strike).`;
  } else if (isUS && !hasStandardContract) {
    actionTitle = `Tail-Risk Advisory — ${candidate.ticker}`;
    strategyDescription = `Holding has ${candidate.shares} shares (< 100 required for standard option contract). Consider trailing stop or trimming position.`;
  } else {
    // Non-US asset
    const etfProxy = COUNTRY_ETF_PROXIES[candidate.country] || 'EEM (iShares Emerging Markets ETF)';
    actionTitle = `Hedge Advisory for ${candidate.ticker} (${candidate.exchange})`;
    strategyDescription = `Non-US exchange listing. Standard US options are not listed for ${candidate.ticker}. Consider trimming position or purchasing put protection on correlated proxy ETF ${etfProxy}.`;
  }

  return {
    ticker: candidate.ticker,
    companyName: candidate.companyName || (candidate as any).name || candidate.ticker,
    shares: candidate.shares,
    price: effPrice,
    exchange: candidate.exchange,
    currency: candidate.currency,
    basePositionValue: candidate.basePositionValue || candidate.positionValue || (candidate.shares * effPrice),
    contractsNeeded,
    contractsLabel,
    insufficientShares: !hasStandardContract,
    isNonUS: !isUS,
    actionTitle,
    strategyDescription,
    suggestedStrike,
    suggestedStrikeFormatted,
    expiration: '60 Days',
    riskScore: candidate.riskScore,
    allocationPct: candidate.allocationPct,
    disclaimer: 'Informational only, not financial advice.'
  };
}


export function computeTotalPortfolioValue(holdings: Array<{ basePositionValue?: number; positionValue?: number; hasMissingFxRate?: boolean }>): number {
  return holdings.reduce((sum, h) => {
    if (h.hasMissingFxRate) return sum;
    const v = h.basePositionValue !== undefined ? h.basePositionValue : h.positionValue || 0;
    return sum + v;
  }, 0);
}

export function computePortfolioDayChangeDollar(holdings: Array<{ baseDayChangeDollar?: number; dayChangeDollar?: number; hasMissingFxRate?: boolean }>): number {
  return holdings.reduce((sum, h) => {
    if (h.hasMissingFxRate) return sum;
    const v = h.baseDayChangeDollar !== undefined ? h.baseDayChangeDollar : h.dayChangeDollar || 0;
    return sum + v;
  }, 0);
}

export function computePortfolioDayChangePct(dayChangeDollar: number, totalValue: number): number {
  const prevTotal = totalValue - dayChangeDollar;
  return prevTotal > 0 ? (dayChangeDollar / prevTotal) * 100 : 0;
}

export function getFlaggedPositions<T extends { riskScore?: number; isFlagged?: boolean }>(holdings: T[], tolerance = 55): T[] {
  return holdings.filter((h) => (h.isFlagged !== undefined ? h.isFlagged : isPositionFlagged(h.riskScore ?? 50, tolerance)));
}

export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "0.0%";
  return value.toFixed(decimals) + "%";
}

export function formatCurrency(amount: number, currency = "USD"): string {
  if (!Number.isFinite(amount)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}
