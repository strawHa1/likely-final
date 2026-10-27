/**
 * src/lib/portfolioReducer.ts
 *
 * Centralized State Reducer, Validation Gate & Migration Manager for Portfolio Risk.
 *
 * Features:
 *   - Supports large portfolios up to 1,000 holdings
 *   - Discards legacy stored fields (allocationPct, riskScore, action)
 *   - Pure holding schema: { id, ticker, companyName, exchange, country, currency, sector, shares, avgCost?, addedAt }
 *   - Safe versioned localStorage persistence with corruption fallback
 *   - Full action suite: ADD, REMOVE, REPLACE, EDIT, BULK_ADD, BULK_REMOVE, IMPORT, RESET, HYDRATE, RESTORE_DELETED, SET_BASE_CURRENCY, SET_TOLERANCE
 *   - 5-second undo buffer for deletions
 */

import { PortfolioHolding } from '../types';
import seedGlobalPortfolio from '../../data/portfolio.json';
import starterPortfolio from '../../data/portfolio-starter.json';
import { getSavedBaseCurrency, setSavedBaseCurrency } from './fxService';

export const PORTFOLIO_STORAGE_KEY_V3 = 'bs-portfolio-holdings-v3';
export const PORTFOLIO_STORAGE_KEY_V2 = 'bs-portfolio-holdings-v2';
export const PORTFOLIO_STORAGE_KEY_V1 = 'bs-portfolio-holdings';
export const TOLERANCE_STORAGE_KEY_V2 = 'bs-portfolio-risk-tolerance-v2';
export const MAX_PORTFOLIO_HOLDINGS = 1000;

export interface DeletedHoldingBackup {
  holding: PortfolioHolding;
  index: number;
  timestamp: number;
}

export interface PortfolioState {
  holdings: PortfolioHolding[];
  baseCurrency: string;
  tolerance: number;
  deletedBackup: DeletedHoldingBackup | null;
  error: string | null;
  lastActionMessage: string | null;
}

export type PortfolioAction =
  | {
      type: 'ADD';
      payload: {
        ticker: string;
        companyName: string;
        exchange?: string;
        country?: string;
        currency?: string;
        sector?: string;
        shares: number;
        avgCost?: number;
      };
    }
  | {
      type: 'REMOVE';
      payload: { ticker: string };
    }
  | {
      type: 'REPLACE';
      payload: {
        oldTicker: string;
        newTicker: string;
        newCompanyName: string;
        newExchange?: string;
        newCountry?: string;
        newCurrency?: string;
        newSector?: string;
        newPrice?: number;
        mode: 'same-value' | 'same-shares';
        oldBaseValue?: number;
        newBasePrice?: number;
      };
    }
  | {
      type: 'EDIT';
      payload: {
        ticker: string;
        shares: number;
        avgCost?: number;
      };
    }
  | {
      type: 'BULK_ADD';
      payload: {
        holdings: Array<{
          ticker: string;
          companyName: string;
          exchange?: string;
          country?: string;
          currency?: string;
          sector?: string;
          shares: number;
          avgCost?: number;
        }>;
      };
    }
  | {
      type: 'BULK_REMOVE';
      payload: { tickers: string[] };
    }
  | {
      type: 'IMPORT';
      payload: {
        holdings: PortfolioHolding[];
        mode: 'replace' | 'merge';
      };
    }
  | {
      type: 'RESET';
      payload?: { sample: 'starter' | 'global' };
    }
  | {
      type: 'HYDRATE';
      payload: PortfolioHolding[];
    }
  | {
      type: 'RESTORE_DELETED';
    }
  | {
      type: 'SET_BASE_CURRENCY';
      payload: { currency: string };
    }
  | {
      type: 'SET_TOLERANCE';
      payload: { tolerance: number };
    }
  | {
      type: 'CLEAR_ERROR';
    }
  | {
      type: 'CLEAR_BACKUP';
    };

/**
 * Migration helper: reads any raw holding object (v1, v2, or legacy),
 * strips stale fields (allocationPct, riskScore, action),
 * and maps to clean PortfolioHolding schema.
 */
export function migrateRawHolding(raw: any, index = 0): PortfolioHolding | null {
  if (!raw || typeof raw !== 'object') return null;

  const rawTicker = raw.ticker || raw.symbol;
  if (!rawTicker || typeof rawTicker !== 'string') return null;
  const ticker = rawTicker.toUpperCase().trim();
  if (!ticker) return null;

  const companyName = String(raw.companyName || raw.name || ticker).trim();
  const shares = Number(raw.shares);
  if (!Number.isFinite(shares) || shares <= 0) return null;

  let avgCost: number | undefined;
  if (raw.avgCost !== undefined && Number.isFinite(Number(raw.avgCost)) && Number(raw.avgCost) > 0) {
    avgCost = Number(Number(raw.avgCost).toFixed(2));
  } else if (raw.costBasis !== undefined && Number.isFinite(Number(raw.costBasis)) && Number(raw.costBasis) > 0) {
    avgCost = Number((Number(raw.costBasis) / shares).toFixed(2));
  }

  // Derive exchange and currency if missing
  let exchange = String(raw.exchange || '').toUpperCase().trim();
  let currency = String(raw.currency || '').trim();
  let country = String(raw.country || '').toUpperCase().trim();

  if (ticker.endsWith('.NS')) {
    exchange = exchange || 'NSE';
    currency = currency || 'INR';
    country = country || 'IN';
  } else if (ticker.endsWith('.BO')) {
    exchange = exchange || 'BSE';
    currency = currency || 'INR';
    country = country || 'IN';
  } else if (ticker.endsWith('.L')) {
    exchange = exchange || 'LSE';
    currency = currency || 'GBp';
    country = country || 'GB';
  } else if (ticker.endsWith('.PA') || ticker.endsWith('.AS') || ticker.endsWith('.BR')) {
    exchange = exchange || 'EURONEXT';
    currency = currency || 'EUR';
    country = country || 'FR';
  } else if (ticker.endsWith('.DE')) {
    exchange = exchange || 'XETRA';
    currency = currency || 'EUR';
    country = country || 'DE';
  } else if (ticker.endsWith('.T')) {
    exchange = exchange || 'TSE';
    currency = currency || 'JPY';
    country = country || 'JP';
  } else if (ticker.endsWith('.KS')) {
    exchange = exchange || 'KRX';
    currency = currency || 'KRW';
    country = country || 'KR';
  } else if (ticker.endsWith('.SW')) {
    exchange = exchange || 'SIX';
    currency = currency || 'CHF';
    country = country || 'CH';
  } else if (ticker.endsWith('.AX')) {
    exchange = exchange || 'ASX';
    currency = currency || 'AUD';
    country = country || 'AU';
  } else {
    exchange = exchange || 'NASDAQ';
    currency = currency || 'USD';
    country = country || 'US';
  }

  const sector = String(raw.sector || 'General').trim();
  const id = String(raw.id || `port-${index + 1}`);
  const addedAt = typeof raw.addedAt === 'number' ? raw.addedAt : Date.now();

  return {
    id,
    ticker,
    companyName,
    exchange,
    country,
    currency,
    sector,
    shares,
    ...(avgCost !== undefined ? { avgCost } : {}),
    addedAt
  };
}

/**
 * Validates an array of holdings, deduplicates by ticker, and strips stale fields.
 * Safely falls back to starter portfolio if corrupted.
 */
export function validateHoldingsArray(raw: unknown): PortfolioHolding[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return (seedGlobalPortfolio as any[]).map((h, i) => migrateRawHolding(h, i)!);
  }

  const seen = new Set<string>();
  const valid: PortfolioHolding[] = [];

  for (let i = 0; i < raw.length; i++) {
    const migrated = migrateRawHolding(raw[i], i);
    if (migrated && !seen.has(migrated.ticker)) {
      seen.add(migrated.ticker);
      valid.push(migrated);
      if (valid.length >= MAX_PORTFOLIO_HOLDINGS) break;
    }
  }

  if (valid.length === 0) {
    return (seedGlobalPortfolio as any[]).map((h, i) => migrateRawHolding(h, i)!);
  }

  return valid;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    return null;
  }
  return null;
}

/**
 * Safely loads holdings from localStorage with automatic schema migration across versions.
 */
export function loadStoredHoldings(): PortfolioHolding[] {
  const storage = getStorage();
  if (!storage) {
    return (seedGlobalPortfolio as any[]).map((h, i) => migrateRawHolding(h, i)!);
  }

  try {
    // 1. Check v3 storage key
    const rawV3 = storage.getItem(PORTFOLIO_STORAGE_KEY_V3);
    if (rawV3) {
      const parsed = JSON.parse(rawV3);
      return validateHoldingsArray(parsed);
    }

    // 2. Fall back to v2 / v1 storage key with migration
    const rawV2 = storage.getItem(PORTFOLIO_STORAGE_KEY_V2) || storage.getItem(PORTFOLIO_STORAGE_KEY_V1);
    if (rawV2) {
      const parsedOld = JSON.parse(rawV2);
      const migrated = validateHoldingsArray(parsedOld);
      try {
        storage.setItem(PORTFOLIO_STORAGE_KEY_V3, JSON.stringify(migrated));
      } catch {
        /* ignore */
      }
      return migrated;
    }
  } catch (err) {
    console.warn('[Portfolio] Failed to read from localStorage, using institutional seed:', err);
  }

  return (seedGlobalPortfolio as any[]).map((h, i) => migrateRawHolding(h, i)!);
}

/**
 * Persists holdings cleanly to localStorage under version 3 key.
 */
export function persistHoldings(holdings: PortfolioHolding[]): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    const cleanHoldings = holdings.map((h) => ({
      id: h.id,
      ticker: h.ticker,
      companyName: h.companyName,
      exchange: h.exchange,
      country: h.country,
      currency: h.currency,
      sector: h.sector,
      shares: h.shares,
      ...(h.avgCost !== undefined ? { avgCost: h.avgCost } : {}),
      addedAt: h.addedAt || Date.now()
    }));

    const json = JSON.stringify(cleanHoldings);
    storage.setItem(PORTFOLIO_STORAGE_KEY_V3, json);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bs-portfolio-updated'));
    }
  } catch (err) {
    console.warn('[Portfolio] Failed to persist holdings to localStorage:', err);
  }
}

export function loadSavedTolerance(): number {
  const storage = getStorage();
  if (!storage) return 55;
  try {
    const saved = storage.getItem(TOLERANCE_STORAGE_KEY_V2);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (Number.isFinite(parsed) && parsed >= 20 && parsed <= 90) return parsed;
    }
  } catch {
    /* ignore */
  }
  return 55;
}

export const initialPortfolioState: PortfolioState = {
  holdings: loadStoredHoldings(),
  baseCurrency: getSavedBaseCurrency(),
  tolerance: loadSavedTolerance(),
  deletedBackup: null,
  error: null,
  lastActionMessage: null
};

/**
 * Pure reducer for all portfolio state modifications.
 */
export function portfolioReducer(state: PortfolioState, action: PortfolioAction): PortfolioState {
  switch (action.type) {
    case 'ADD': {
      const {
        ticker: rawTicker,
        companyName,
        exchange = 'NASDAQ',
        country = 'US',
        currency = 'USD',
        sector = 'General',
        shares,
        avgCost
      } = action.payload;

      const ticker = (rawTicker || '').toUpperCase().trim();

      if (!ticker) {
        return { ...state, error: 'Ticker symbol is required.' };
      }
      if (!Number.isFinite(shares) || shares <= 0) {
        return { ...state, error: 'Shares must be a positive number greater than 0.' };
      }

      // Duplicate check
      const existing = state.holdings.find((h) => h.ticker.toUpperCase() === ticker);
      if (existing) {
        return {
          ...state,
          error: `Ticker "${ticker}" already exists in portfolio (${existing.shares} shares). Edit its shares instead.`
        };
      }

      // Limit check
      if (state.holdings.length >= MAX_PORTFOLIO_HOLDINGS) {
        return {
          ...state,
          error: `Portfolio holdings limit reached (maximum ${MAX_PORTFOLIO_HOLDINGS.toLocaleString()} holdings).`
        };
      }

      const newHolding: PortfolioHolding = {
        id: `port-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ticker,
        companyName: companyName || ticker,
        exchange,
        country,
        currency,
        sector,
        shares: Number(shares.toFixed(4)),
        ...(avgCost !== undefined && Number.isFinite(avgCost) && avgCost > 0
          ? { avgCost: Number(avgCost.toFixed(2)) }
          : {}),
        addedAt: Date.now()
      };

      const updated = [newHolding, ...state.holdings];
      persistHoldings(updated);

      return {
        ...state,
        holdings: updated,
        error: null,
        lastActionMessage: `Added ${ticker} (${shares} shares)`
      };
    }

    case 'REMOVE': {
      const targetTicker = action.payload.ticker.toUpperCase().trim();
      const targetIndex = state.holdings.findIndex((h) => h.ticker.toUpperCase() === targetTicker);

      if (targetIndex === -1) return state;

      const removedHolding = state.holdings[targetIndex];
      const updated = state.holdings.filter((h) => h.ticker.toUpperCase() !== targetTicker);

      persistHoldings(updated);

      return {
        ...state,
        holdings: updated,
        deletedBackup: {
          holding: removedHolding,
          index: targetIndex,
          timestamp: Date.now()
        },
        error: null,
        lastActionMessage: `Removed ${targetTicker}`
      };
    }

    case 'REPLACE': {
      const {
        oldTicker: rawOld,
        newTicker: rawNew,
        newCompanyName,
        newExchange = 'NASDAQ',
        newCountry = 'US',
        newCurrency = 'USD',
        newSector = 'General',
        mode,
        oldBaseValue = 0,
        newBasePrice = 1
      } = action.payload;

      const oldTicker = rawOld.toUpperCase().trim();
      const newTicker = rawNew.toUpperCase().trim();

      const oldIndex = state.holdings.findIndex((h) => h.ticker.toUpperCase() === oldTicker);
      if (oldIndex === -1) return { ...state, error: `Position ${oldTicker} not found.` };

      const oldHolding = state.holdings[oldIndex];

      // Calculate shares based on mode
      let newShares = oldHolding.shares;
      if (mode === 'same-value') {
        const effectivePrice = newBasePrice > 0 ? newBasePrice : 100;
        newShares = Math.max(1, Math.round(oldBaseValue / effectivePrice));
      }

      const replacedHolding: PortfolioHolding = {
        id: `port-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ticker: newTicker,
        companyName: newCompanyName || newTicker,
        exchange: newExchange,
        country: newCountry,
        currency: newCurrency,
        sector: newSector,
        shares: newShares,
        addedAt: Date.now()
      };

      const updated = [...state.holdings];
      updated[oldIndex] = replacedHolding;

      persistHoldings(updated);

      return {
        ...state,
        holdings: updated,
        error: null,
        lastActionMessage: `Replaced ${oldTicker} with ${newTicker}`
      };
    }

    case 'EDIT': {
      const { ticker: rawTicker, shares, avgCost } = action.payload;
      const ticker = rawTicker.toUpperCase().trim();

      if (!Number.isFinite(shares) || shares <= 0) {
        return { ...state, error: 'Shares must be greater than 0.' };
      }

      const updated = state.holdings.map((h) => {
        if (h.ticker.toUpperCase() !== ticker) return h;
        return {
          ...h,
          shares: Number(shares.toFixed(4)),
          ...(avgCost !== undefined && Number.isFinite(avgCost) && avgCost > 0
            ? { avgCost: Number(avgCost.toFixed(2)) }
            : avgCost === undefined
            ? {}
            : { avgCost: undefined })
        };
      });

      persistHoldings(updated);

      return {
        ...state,
        holdings: updated,
        error: null,
        lastActionMessage: `Updated ${ticker}`
      };
    }

    case 'BULK_ADD': {
      const seen = new Set(state.holdings.map((h) => h.ticker.toUpperCase()));
      const toAdd: PortfolioHolding[] = [];

      for (const item of action.payload.holdings) {
        const t = (item.ticker || '').toUpperCase().trim();
        if (t && !seen.has(t) && Number.isFinite(item.shares) && item.shares > 0) {
          seen.add(t);
          toAdd.push({
            id: `port-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            ticker: t,
            companyName: item.companyName || t,
            exchange: item.exchange || 'NASDAQ',
            country: item.country || 'US',
            currency: item.currency || 'USD',
            sector: item.sector || 'General',
            shares: Number(item.shares.toFixed(4)),
            ...(item.avgCost !== undefined && item.avgCost > 0
              ? { avgCost: Number(item.avgCost.toFixed(2)) }
              : {}),
            addedAt: Date.now()
          });
          if (state.holdings.length + toAdd.length >= MAX_PORTFOLIO_HOLDINGS) break;
        }
      }

      if (toAdd.length === 0) {
        return { ...state, error: 'No new unique holdings to add.' };
      }

      const updated = [...toAdd, ...state.holdings];
      persistHoldings(updated);

      return {
        ...state,
        holdings: updated,
        error: null,
        lastActionMessage: `Added ${toAdd.length} companies`
      };
    }

    case 'BULK_REMOVE': {
      const removeSet = new Set(action.payload.tickers.map((t) => t.toUpperCase().trim()));
      const updated = state.holdings.filter((h) => !removeSet.has(h.ticker.toUpperCase()));

      persistHoldings(updated);

      return {
        ...state,
        holdings: updated,
        error: null,
        lastActionMessage: `Removed ${removeSet.size} positions`
      };
    }

    case 'IMPORT': {
      const { holdings: imported, mode } = action.payload;
      let updated: PortfolioHolding[] = [];

      if (mode === 'replace') {
        updated = validateHoldingsArray(imported);
      } else {
        // Merge mode
        const map = new Map<string, PortfolioHolding>();
        for (const h of state.holdings) map.set(h.ticker.toUpperCase(), h);
        for (const h of imported) {
          const migrated = migrateRawHolding(h);
          if (migrated) map.set(migrated.ticker.toUpperCase(), migrated);
        }
        updated = Array.from(map.values()).slice(0, MAX_PORTFOLIO_HOLDINGS);
      }

      persistHoldings(updated);

      return {
        ...state,
        holdings: updated,
        error: null,
        lastActionMessage: `Imported ${updated.length} holdings`
      };
    }

    case 'RESET': {
      const sample = action.payload?.sample || 'global';
      const source = sample === 'starter' ? starterPortfolio : seedGlobalPortfolio;
      const resetHoldings = (source as any[]).map((h, i) => migrateRawHolding(h, i)!);

      persistHoldings(resetHoldings);

      return {
        ...state,
        holdings: resetHoldings,
        deletedBackup: null,
        error: null,
        lastActionMessage: `Reset to ${sample === 'starter' ? 'Starter (5)' : 'Global (500)'} portfolio`
      };
    }

    case 'HYDRATE': {
      const valid = validateHoldingsArray(action.payload);
      return {
        ...state,
        holdings: valid,
        error: null
      };
    }

    case 'RESTORE_DELETED': {
      if (!state.deletedBackup) return state;
      const { holding, index } = state.deletedBackup;

      const updated = [...state.holdings];
      const insertIdx = Math.min(index, updated.length);
      updated.splice(insertIdx, 0, holding);

      persistHoldings(updated);

      return {
        ...state,
        holdings: updated,
        deletedBackup: null,
        error: null,
        lastActionMessage: `Restored ${holding.ticker}`
      };
    }

    case 'SET_BASE_CURRENCY': {
      const currency = action.payload.currency.toUpperCase().trim();
      setSavedBaseCurrency(currency);
      return {
        ...state,
        baseCurrency: currency
      };
    }

    case 'SET_TOLERANCE': {
      const tol = Math.max(20, Math.min(90, Math.round(action.payload.tolerance)));
      const storage = getStorage();
      if (storage) {
        try {
          storage.setItem(TOLERANCE_STORAGE_KEY_V2, String(tol));
        } catch {
          /* ignore */
        }
      }
      return {
        ...state,
        tolerance: tol
      };
    }

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'CLEAR_BACKUP':
      return { ...state, deletedBackup: null };

    default:
      return state;
  }
}
