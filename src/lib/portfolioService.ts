/**
 * Client-side portfolio store backing the AI Assistant's invest / withdraw flow
 * and the Portfolio Risk page.
 *
 * Persists in localStorage and syncs with the server backend (/api/portfolio)
 * so server endpoints also know about user holdings.
 */

import { PortfolioItem } from '../types';
import { INITIAL_PORTFOLIO } from '../data/mockData';
import { computeAllocationsLargestRemainder } from '../utils/portfolioMath';

const HOLDINGS_KEY = 'bs-portfolio-holdings';
const CASH_KEY = 'bs-portfolio-cash';
const TRANSACTIONS_KEY = 'bs-portfolio-transactions';

/** Fired after any mutation so open pages can refresh without a global store. */
export const PORTFOLIO_UPDATED_EVENT = 'bs-portfolio-updated';

/** Starting settlement cash for the demo account. */
export const DEFAULT_CASH_BALANCE = 250_000;

const MAX_TRANSACTIONS = 50;

export type TradeAction = 'invest' | 'withdraw';

export interface PortfolioTransaction {
  id: string;
  action: TradeAction;
  ticker: string;
  companyName: string;
  amount: number;
  price: number;
  shares: number;
  cashAfter: number;
  createdAt: string;
}

export interface TradeRequest {
  action: TradeAction;
  ticker: string;
  companyName: string;
  amount: number;
  price: number;
  riskScore?: number;
  sector?: string;
  country?: string;
  region?: string;
  countryIso?: string;
  countryFlag?: string;
  recommendedAction?: string;
}

export interface TradeResult {
  ok: boolean;
  error?: string;
  transaction?: PortfolioTransaction;
  holding?: PortfolioItem;
  cashBalance: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* corrupted entry — fall through to default */
  }
  return fallback;
}

/**
 * Derive action from risk score: Safe, Monitor, Review, Hedge, Reduce
 */
export function deriveActionFromRiskScore(riskScore: number): string {
  if (riskScore >= 80) return 'Reduce';
  if (riskScore >= 70) return 'Hedge';
  if (riskScore >= 55) return 'Review';
  if (riskScore >= 40) return 'Monitor';
  return 'Safe';
}

/**
 * Allocation percentages are derived using Largest Remainder Method,
 * ensuring they sum to exactly 100.0%.
 */
function recalcAllocations(holdings: PortfolioItem[]): PortfolioItem[] {
  const values = holdings.map((h) => h.shares * (h.price ?? h.avgCost ?? h.costBasis ?? 0));
  const rounded = computeAllocationsLargestRemainder(values, 1);
  return holdings.map((h, idx) => ({
    ...h,
    allocationPct: rounded[idx] ?? 0
  }));
}

function persist(holdings: PortfolioItem[], cash: number): void {
  localStorage.setItem(HOLDINGS_KEY, JSON.stringify(holdings));
  localStorage.setItem(CASH_KEY, JSON.stringify(Number(cash.toFixed(2))));
  window.dispatchEvent(new CustomEvent(PORTFOLIO_UPDATED_EVENT));

  // Sync to server backend asynchronously
  fetch('/api/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holdings, cash })
  }).catch(() => {});
}

export function getHoldings(): PortfolioItem[] {
  const stored = readJson<PortfolioItem[] | null>(HOLDINGS_KEY, null);
  if (stored && Array.isArray(stored) && stored.length > 0) {
    const hydrated = stored.map((item) => {
      const seed = INITIAL_PORTFOLIO.find(
        (s) => s.ticker.toUpperCase() === item.ticker?.toUpperCase()
      );
      const price = item.price ?? item.avgCost ?? item.costBasis ?? seed?.price ?? 100;
      const prevClose = item.prevClose ?? seed?.prevClose ?? price;
      const riskScore = item.riskScore ?? seed?.riskScore ?? 50;
      return {
        ...item,
        name: item.name || item.companyName || seed?.name || item.ticker,
        companyName: item.companyName || item.name || seed?.companyName || item.ticker,
        sector: item.sector || seed?.sector || 'Diversified',
        country: item.country || seed?.country || 'Global',
        region: item.region || seed?.region || 'Global',
        price,
        prevClose,
        shares: item.shares ?? seed?.shares ?? 0,
        riskScore,
        action: item.action || item.recommendedAction || deriveActionFromRiskScore(riskScore)
      };
    });
    return recalcAllocations(hydrated);
  }
  // First run: seed from the existing mock portfolio
  return recalcAllocations(INITIAL_PORTFOLIO.map((h) => ({ ...h })));
}

export function getCashBalance(): number {
  const stored = readJson<number | null>(CASH_KEY, null);
  return typeof stored === 'number' && Number.isFinite(stored) ? stored : DEFAULT_CASH_BALANCE;
}

export function getTransactions(): PortfolioTransaction[] {
  return readJson<PortfolioTransaction[]>(TRANSACTIONS_KEY, []);
}

export function getHolding(ticker: string): PortfolioItem | undefined {
  const upper = ticker.toUpperCase();
  return getHoldings().find((h) => h.ticker.toUpperCase() === upper);
}

/**
 * Applies an invest (buy) or withdraw (sell) order at the supplied live price.
 */
export function executeTrade(request: TradeRequest): TradeResult {
  const {
    action,
    companyName,
    amount,
    price,
    riskScore,
    sector,
    country,
    region,
    countryIso,
    countryFlag,
    recommendedAction
  } = request;
  const ticker = request.ticker.toUpperCase();
  const holdings = getHoldings();
  const cash = getCashBalance();

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Enter an amount greater than $0.', cashBalance: cash };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: `No live price is available for $${ticker} right now.`, cashBalance: cash };
  }

  const index = holdings.findIndex((h) => h.ticker.toUpperCase() === ticker);
  const existing = index >= 0 ? holdings[index] : undefined;
  const shares = Number((amount / price).toFixed(4));
  let nextHoldings: PortfolioItem[];
  let nextCash: number;

  const score = riskScore ?? existing?.riskScore ?? 50;
  const holdingAction = recommendedAction || deriveActionFromRiskScore(score);

  if (action === 'invest') {
    if (amount > cash) {
      return {
        ok: false,
        error: `Insufficient funds. Your available cash is $${cash.toLocaleString(undefined, {
          maximumFractionDigits: 2
        })}, but this order needs $${amount.toLocaleString()}.`,
        cashBalance: cash
      };
    }

    if (existing) {
      // Blend purchase into average cost
      const totalShares = existing.shares + shares;
      const totalCost = existing.shares * (existing.avgCost || existing.costBasis || price) + amount;
      nextHoldings = [...holdings];
      nextHoldings[index] = {
        ...existing,
        shares: Number(totalShares.toFixed(4)),
        avgCost: Number((totalCost / totalShares).toFixed(2)),
        price: Number(price.toFixed(2)),
        riskScore: score,
        action: holdingAction
      };
    } else {
      nextHoldings = [
        ...holdings,
        {
          id: `port-${ticker.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
          ticker,
          companyName,
          name: companyName,
          sector: sector || 'Diversified',
          country: country || 'Global',
          region: region || 'Global',
          countryIso,
          countryFlag,
          shares,
          price: Number(price.toFixed(2)),
          prevClose: Number(price.toFixed(2)),
          avgCost: Number(price.toFixed(2)),
          allocationPct: 0,
          riskScore: score,
          action: holdingAction
        }
      ];
    }
    nextCash = cash - amount;
  } else {
    if (!existing) {
      return { ok: false, error: `You do not hold any $${ticker} to withdraw from.`, cashBalance: cash };
    }

    const positionValue = existing.shares * price;
    if (amount > positionValue) {
      return {
        ok: false,
        error: `Your $${ticker} position is only worth $${positionValue.toLocaleString(undefined, {
          maximumFractionDigits: 2
        })} at the current price, so $${amount.toLocaleString()} cannot be withdrawn.`,
        cashBalance: cash
      };
    }

    const remainingShares = Number((existing.shares - shares).toFixed(4));
    nextHoldings = [...holdings];
    if (remainingShares <= 0.0001) {
      nextHoldings.splice(index, 1); // Fully closed
    } else {
      nextHoldings[index] = { ...existing, shares: remainingShares };
    }
    nextCash = cash + amount;
  }

  nextHoldings = recalcAllocations(nextHoldings);

  const transaction: PortfolioTransaction = {
    id: `tx-${Date.now()}`,
    action,
    ticker,
    companyName,
    amount: Number(amount.toFixed(2)),
    price: Number(price.toFixed(2)),
    shares,
    cashAfter: Number(nextCash.toFixed(2)),
    createdAt: new Date().toISOString()
  };

  persist(nextHoldings, nextCash);
  localStorage.setItem(
    TRANSACTIONS_KEY,
    JSON.stringify([transaction, ...getTransactions()].slice(0, MAX_TRANSACTIONS))
  );

  return {
    ok: true,
    transaction,
    holding: nextHoldings.find((h) => h.ticker === ticker),
    cashBalance: nextCash
  };
}