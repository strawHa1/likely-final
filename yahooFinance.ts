/**
 * Yahoo Finance global symbol search, profile metadata, and quotes — no API key required.
 */
import { setCachedQuote, type CachedQuote } from './quoteCache.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; BlackSwan/1.0)' };

export interface YahooSearchMatch {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  sector?: string;
  industry?: string;
}

const YAHOO_EXCHANGE_NORMALIZE: Record<string, string> = {
  NSI: 'NSE',
  NSE: 'NSE',
  BOM: 'BSE',
  BSE: 'BSE',
  NMS: 'NASDAQ',
  NGM: 'NASDAQ',
  NCM: 'NASDAQ',
  NAS: 'NASDAQ',
  NYQ: 'NYSE',
  NYS: 'NYSE',
  ASE: 'NYSE',
  PCX: 'NYSE',
  BTS: 'NYSE',
  LSE: 'LSE',
  LON: 'LSE',
  IOB: 'LSE',
  JPX: 'TSE',
  TYO: 'TSE',
  OSA: 'TSE',
  KSC: 'KRX',
  KOE: 'KRX',
  PAR: 'EURONEXT',
  AMS: 'EURONEXT',
  BRU: 'EURONEXT',
  LIS: 'EURONEXT',
  MIL: 'EURONEXT',
  EBS: 'SIX',
  VTX: 'SIX',
  GER: 'XETRA',
  FRA: 'FRA',
  TOR: 'TSX',
  VAN: 'TSXV',
  CNQ: 'CSE',
  HKG: 'HKEX',
  ASX: 'ASX',
  TAI: 'TWSE',
  TWO: 'TPEX',
  SHH: 'SSE',
  SHZ: 'SZSE',
  SES: 'SGX',
  SAO: 'B3',
  MEX: 'BMV',
  JNB: 'JSE',
  SAU: 'TADAWUL',
  TAE: 'TASE',
  TLV: 'TASE'
};

export function normalizeExchangeCode(rawExchange?: string, exchDisp?: string, symbol?: string): string {
  const sym = (symbol || '').toUpperCase();
  if (sym.includes('.')) {
    const suffix = sym.split('.').pop() || '';
    const suffixMap: Record<string, string> = {
      NS: 'NSE',
      BO: 'BSE',
      L: 'LSE',
      T: 'TSE',
      KS: 'KRX',
      KQ: 'KRX',
      PA: 'EURONEXT',
      AS: 'EURONEXT',
      BR: 'EURONEXT',
      LS: 'EURONEXT',
      MI: 'EURONEXT',
      SW: 'SIX',
      DE: 'XETRA',
      F: 'FRA',
      TO: 'TSX',
      V: 'TSXV',
      HK: 'HKEX',
      AX: 'ASX',
      TW: 'TWSE',
      TWO: 'TPEX',
      SS: 'SSE',
      SZ: 'SZSE',
      SI: 'SGX',
      SA: 'B3',
      MX: 'BMV',
      JO: 'JSE',
      SR: 'TADAWUL',
      TA: 'TASE',
      MC: 'BME',
      ST: 'NASDAQ OMX',
      OL: 'OSL',
      CO: 'NASDAQ OMX',
      HE: 'NASDAQ OMX'
    };
    if (suffixMap[suffix]) return suffixMap[suffix];
  }

  const code = (rawExchange || '').trim().toUpperCase();
  if (YAHOO_EXCHANGE_NORMALIZE[code]) return YAHOO_EXCHANGE_NORMALIZE[code];

  const disp = (exchDisp || '').trim().toUpperCase();
  if (disp.includes('NASDAQ')) return 'NASDAQ';
  if (disp.includes('NYSE') || disp.includes('NEW YORK')) return 'NYSE';
  if (disp.includes('NSE') || disp.includes('NATIONAL STOCK EXCHANGE OF INDIA')) return 'NSE';
  if (disp.includes('BSE') || disp.includes('BOMBAY')) return 'BSE';
  if (disp.includes('LONDON') || disp === 'LSE') return 'LSE';
  if (disp.includes('TOKYO') || disp === 'TSE' || disp === 'JPX') return 'TSE';
  if (disp.includes('KOREA') || disp.includes('KOSDAQ') || disp.includes('KOSPI')) return 'KRX';
  if (disp.includes('EURONEXT') || disp.includes('PARIS') || disp.includes('AMSTERDAM')) return 'EURONEXT';
  if (disp.includes('SWISS') || disp.includes('ZURICH') || disp === 'SIX') return 'SIX';
  if (disp.includes('XETRA') || disp.includes('FRANKFURT')) return 'XETRA';
  if (disp.includes('TORONTO') || disp === 'TSX') return 'TSX';
  if (disp.includes('HONG KONG') || disp === 'HKEX') return 'HKEX';
  if (disp.includes('AUSTRALIAN') || disp === 'ASX') return 'ASX';

  return code || disp || 'NYSE/NASDAQ';
}

function formatTimestamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const yahooMetaCache = new Map<string, { data: YahooSearchMatch; ts: number }>();
const META_TTL_MS = 15 * 60 * 1000;

export async function fetchYahooSearch(query: string): Promise<YahooSearchMatch[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=40&newsCount=0&listsCount=0`,
      { headers: UA, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    const quotes = data?.quotes || [];
    const results: YahooSearchMatch[] = quotes
      .filter((q: any) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
      .map((q: any) => {
        const symbol = String(q.symbol).toUpperCase();
        const item: YahooSearchMatch = {
          symbol,
          name: q.longname || q.shortname || symbol,
          exchange: normalizeExchangeCode(q.exchange, q.exchDisp, symbol),
          type: q.quoteType === 'EQUITY' ? 'Common Stock' : q.quoteType,
          sector: q.sectorDisp || q.sector || undefined,
          industry: q.industryDisp || q.industry || undefined
        };
        yahooMetaCache.set(symbol, { data: item, ts: Date.now() });
        return item;
      });
    return results;
  } catch {
    return [];
  }
}

export async function fetchYahooCompanyMeta(symbol: string): Promise<YahooSearchMatch | null> {
  const sym = symbol.toUpperCase().trim();
  const cached = yahooMetaCache.get(sym);
  if (cached && Date.now() - cached.ts < META_TTL_MS) {
    return cached.data;
  }

  const matches = await fetchYahooSearch(sym);
  if (matches.length === 0) return null;

  const exact =
    matches.find((m) => m.symbol.toUpperCase() === sym) ||
    matches.find((m) => m.symbol.toUpperCase().split('.')[0] === sym.split('.')[0]) ||
    matches[0];

  if (exact) {
    yahooMetaCache.set(sym, { data: exact, ts: Date.now() });
  }
  return exact || null;
}

export async function fetchYahooQuote(symbol: string): Promise<CachedQuote | null> {
  const sym = symbol.toUpperCase().trim();
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
      { headers: UA, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;

    const price = Number(meta.regularMarketPrice);
    const prev = Number(meta.chartPreviousClose || meta.previousClose || price);
    const change = price - prev;
    const pct = prev ? (change / prev) * 100 : 0;

    return setCachedQuote(sym, {
      symbol: sym,
      price: Number(price.toFixed(2)),
      change: Number(change.toFixed(2)),
      percentChange: Number(pct.toFixed(2)),
      high: Number((meta.regularMarketDayHigh || price).toFixed(2)),
      low: Number((meta.regularMarketDayLow || price).toFixed(2)),
      previousClose: Number(prev.toFixed(2)),
      volume: meta.regularMarketVolume || 0,
      lastUpdated: formatTimestamp(),
      isMarketOpen: meta.marketState === 'REGULAR'
    });
  } catch {
    return null;
  }
}
