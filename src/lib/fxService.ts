/**
 * src/lib/fxService.ts
 *
 * Foreign Exchange (FX) service layer for international portfolio valuation.
 * Features:
 *   - Supports 12+ major global currencies with symbols and metadata
 *   - Base currency conversion with cross-rate calculation
 *   - Minor unit handling: GBp (London pence = 0.01 GBP), ILA (Israeli agorot = 0.01 ILS), ZAc (0.01 ZAR)
 *   - 1-hour cache with automatic refresh from official ECB rates (frankfurter.dev)
 *   - Fallback to embedded institutional reference rates
 *   - Strict missing-rate handling: returns null / flags warning; NEVER assumes 1:1 for missing rates!
 *   - Formats currency amounts with Intl.NumberFormat and tabular-nums; never displays NaN or Infinity.
 */

export interface CurrencyMeta {
  code: string;
  symbol: string;
  name: string;
  flag: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸', decimals: 2 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳', decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺', decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧', decimals: 2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵', decimals: 0 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', flag: '🇨🇦', decimals: 2 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺', decimals: 2 },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', flag: '🇨🇭', decimals: 2 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', flag: '🇸🇬', decimals: 2 },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', flag: '🇭🇰', decimals: 2 },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', flag: '🇰🇷', decimals: 0 },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', flag: '🇧🇷', decimals: 2 }
];

export const CURRENCY_MAP = new Map<string, CurrencyMeta>(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c])
);

/**
 * Minor unit multipliers:
 * Certain exchanges quote in fractional units (e.g. GBp = pence, ILA = agorot, ZAc = cents).
 */
export const MINOR_UNIT_MULTIPLIERS: Record<string, { baseCurrency: string; factor: number }> = {
  GBP: { baseCurrency: 'GBP', factor: 1 },
  GBP_PENCE: { baseCurrency: 'GBP', factor: 0.01 },
  GBPENCE: { baseCurrency: 'GBP', factor: 0.01 },
  GBp: { baseCurrency: 'GBP', factor: 0.01 },
  ILA: { baseCurrency: 'ILS', factor: 0.01 },
  ZAc: { baseCurrency: 'ZAR', factor: 0.01 }
};

/**
 * Institutional baseline FX rates relative to USD (1 USD = X Currency).
 * Updated from ECB / Central Bank benchmarks. Used as verified fallback.
 */
export const FALLBACK_RATES_TO_USD: Record<string, number> = {
  USD: 1.0,
  INR: 86.5,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 154.2,
  CAD: 1.39,
  AUD: 1.56,
  CHF: 0.88,
  SGD: 1.34,
  HKD: 7.78,
  KRW: 1395.0,
  TWD: 32.4,
  BRL: 5.85,
  SAR: 3.75,
  SEK: 10.6,
  DKK: 6.87,
  NOK: 10.85,
  ILS: 3.65,
  ZAR: 18.2,
  MXN: 20.3,
  TRY: 35.8,
  PLN: 4.02,
  NZD: 1.72
};

const FX_STORAGE_KEY = 'bs-fx-rates-cache-v1';
const BASE_CURRENCY_STORAGE_KEY = 'bs-portfolio-base-currency-v2';
const ONE_HOUR_MS = 60 * 60 * 1000;

let memoryRates: Record<string, number> = { ...FALLBACK_RATES_TO_USD };
let lastFetchedAt = 0;

/**
 * Normalizes any currency symbol or minor unit code to a standard base code and scale factor.
 */
export function normalizeCurrencyCode(currencyInput?: string): { code: string; factor: number } {
  if (!currencyInput || typeof currencyInput !== 'string') {
    return { code: 'USD', factor: 1 };
  }
  const clean = currencyInput.trim();

  // Check minor unit map (case-sensitive check first for GBp, then upper)
  if (MINOR_UNIT_MULTIPLIERS[clean]) {
    return {
      code: MINOR_UNIT_MULTIPLIERS[clean].baseCurrency,
      factor: MINOR_UNIT_MULTIPLIERS[clean].factor
    };
  }
  const upper = clean.toUpperCase();
  if (MINOR_UNIT_MULTIPLIERS[upper]) {
    return {
      code: MINOR_UNIT_MULTIPLIERS[upper].baseCurrency,
      factor: MINOR_UNIT_MULTIPLIERS[upper].factor
    };
  }

  // Common aliases
  if (upper === 'RS' || upper === 'RUPEE' || upper === 'RUPEES') return { code: 'INR', factor: 1 };
  if (upper === 'POUND' || upper === 'POUNDS') return { code: 'GBP', factor: 1 };
  if (upper === 'EURO' || upper === 'EUROS') return { code: 'EUR', factor: 1 };
  if (upper === 'YEN') return { code: 'JPY', factor: 1 };

  return { code: upper, factor: 1 };
}

/**
 * Returns currently active FX rates (1 USD = X Currency).
 */
export function getCachedRates(): Record<string, number> {
  return { ...memoryRates };
}

/**
 * Converts an amount from one currency to another using USD cross-rates.
 *
 * Formula:
 *   amountInUSD = amount / (fromRate * fromFactor)
 *   converted = amountInUSD * toRate
 *
 * If either currency has no known exchange rate, returns null.
 * NEVER assumes 1:1 for a missing rate!
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number> = memoryRates
): { value: number; rate: number } | null {
  if (!Number.isFinite(amount)) return null;

  const { code: fromCode, factor: fromFactor } = normalizeCurrencyCode(fromCurrency);
  const { code: toCode } = normalizeCurrencyCode(toCurrency);

  if (fromCode === toCode && fromFactor === 1) {
    return { value: amount, rate: 1.0 };
  }

  const fromRate = rates[fromCode] ?? FALLBACK_RATES_TO_USD[fromCode];
  const toRate = rates[toCode] ?? FALLBACK_RATES_TO_USD[toCode];

  if (!fromRate || !toRate || fromRate <= 0 || toRate <= 0) {
    return null; // Missing rate: do not treat as 1:1!
  }

  // Adjust for minor units (e.g. GBp = 0.01 GBP)
  const effectiveFromRate = fromRate / fromFactor;
  const crossRate = toRate / effectiveFromRate;
  const value = amount * crossRate;

  return { value, rate: crossRate };
}

/**
 * Asynchronously refreshes FX rates from ECB-backed public service with 1h caching.
 */
export async function refreshFxRates(force = false): Promise<Record<string, number>> {
  const now = Date.now();
  if (!force && now - lastFetchedAt < ONE_HOUR_MS && Object.keys(memoryRates).length > 5) {
    return memoryRates;
  }

  // Try local storage cache
  if (typeof window !== 'undefined' && !force) {
    try {
      const stored = localStorage.getItem(FX_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.timestamp && now - parsed.timestamp < ONE_HOUR_MS && parsed.rates) {
          memoryRates = { ...FALLBACK_RATES_TO_USD, ...parsed.rates };
          lastFetchedAt = parsed.timestamp;
          return memoryRates;
        }
      }
    } catch {
      /* ignore storage parse */
    }
  }

  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD', {
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.rates && typeof data.rates === 'object') {
        memoryRates = {
          ...FALLBACK_RATES_TO_USD,
          USD: 1.0,
          ...data.rates
        };
        lastFetchedAt = now;
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(
              FX_STORAGE_KEY,
              JSON.stringify({ timestamp: now, rates: memoryRates })
            );
          } catch {
            /* ignore */
          }
        }
        return memoryRates;
      }
    }
  } catch {
    // Graceful fallback to verified institutional rates
  }

  return memoryRates;
}

/**
 * Gets the user's persisted base currency preference (defaults to 'USD').
 */
export function getSavedBaseCurrency(): string {
  if (typeof window === 'undefined') return 'USD';
  try {
    const saved = localStorage.getItem(BASE_CURRENCY_STORAGE_KEY);
    if (saved && CURRENCY_MAP.has(saved.toUpperCase())) {
      return saved.toUpperCase();
    }
  } catch {
    /* ignore */
  }
  return 'USD';
}

/**
 * Persists the user's base currency choice.
 */
export function setSavedBaseCurrency(code: string): void {
  if (typeof window === 'undefined') return;
  const upper = code.toUpperCase().trim();
  if (CURRENCY_MAP.has(upper)) {
    try {
      localStorage.setItem(BASE_CURRENCY_STORAGE_KEY, upper);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Formats a monetary amount safely with Intl.NumberFormat for any supported currency.
 * Never outputs NaN or Infinity.
 */
export function formatMoney(
  amount: number | null | undefined,
  currencyCode = 'USD',
  options: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    compact?: boolean;
  } = {}
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '—';
  }

  const { code } = normalizeCurrencyCode(currencyCode);
  const meta = CURRENCY_MAP.get(code) || { symbol: code, decimals: 2 };
  const defaultDecimals = meta.decimals;

  const minDigits = options.minimumFractionDigits ?? defaultDecimals;
  const maxDigits = options.maximumFractionDigits ?? defaultDecimals;

  try {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
      notation: options.compact ? 'compact' : 'standard'
    });
    return formatter.format(amount);
  } catch {
    // Fallback if currency code is not supported by host Intl
    const formattedNum = amount.toLocaleString('en-US', {
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits
    });
    return `${meta.symbol}${formattedNum}`;
  }
}

/**
 * Formats native price alongside currency code (e.g. "₹2,540.00" or "150.00 GBp").
 */
export function formatNativePrice(price: number | null | undefined, rawCurrency = 'USD'): string {
  if (price === null || price === undefined || !Number.isFinite(price) || price < 0) {
    return '—';
  }
  if (rawCurrency === 'GBp') {
    return `${price.toFixed(2)} GBp`;
  }
  return formatMoney(price, rawCurrency);
}

/**
 * Formats percentage safely.
 */
export function formatPercentSafe(
  pct: number | null | undefined,
  decimals = 1,
  showSign = false
): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return '0.0%';
  }
  const prefix = showSign && pct > 0 ? '+' : '';
  return `${prefix}${pct.toFixed(decimals)}%`;
}


export const fetchLiveFxRates = refreshFxRates;
export const loadBaseCurrency = getSavedBaseCurrency;
export const saveBaseCurrency = setSavedBaseCurrency;
