/**
 * scripts/build-symbols.ts
 *
 * Deterministic build script for global market symbols database.
 * Supports online fetching with cache in data/raw/ and --offline mode.
 * Targets:
 *   - US: >= 6,000 (SEC, Nasdaq Trader, Other Listed)
 *   - India NSE: >= 1,800 (EQUITY_L.csv)
 *   - India BSE: >= 4,000 (BSE Bhavcopy / scrips)
 *   - International: >= 1,500 across >= 30 exchanges
 *
 * Outputs:
 *   - data/symbols/us.json
 *   - data/symbols/india-nse.json
 *   - data/symbols/india-bse.json
 *   - data/symbols/international.json
 *   - data/symbols/manifest.json
 *   - data/market-symbols-extra.json (backward compatible merged entry)
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { buildCuratedInternational } from './build-curated-international.js';

dotenv.config();

export interface MarketSymbolEntry {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  country?: string;
  currency?: string;
  sector?: string;
  industry?: string;
  aliases?: string[];
  isin?: string;
}

const RAW_DIR = path.join(process.cwd(), 'data', 'raw');
const SYMBOLS_DIR = path.join(process.cwd(), 'data', 'symbols');
const EXTRA_SYMBOLS_PATH = path.join(process.cwd(), 'data', 'market-symbols-extra.json');

const UA = { 'User-Agent': 'CompanyExplorer Research/1.0 (contact: admin@local.test)' };

function ensureDirs() {
  if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });
  if (!fs.existsSync(SYMBOLS_DIR)) fs.mkdirSync(SYMBOLS_DIR, { recursive: true });
}

function cleanCompanyName(rawName: string): string {
  if (!rawName) return '';
  return rawName
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*Common Stock/i, '')
    .replace(/\s*Common Stock/i, '')
    .replace(/\s*Ordinary Shares/i, '')
    .replace(/\s*Class A$/i, ' Class A')
    .replace(/\s*Class B$/i, ' Class B')
    .trim();
}

function normalizeExchangeName(raw: string, symbol?: string): string {
  const sym = (symbol || '').toUpperCase().trim();
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
      DE: 'XETRA',
      F: 'FRA',
      SW: 'SIX',
      MC: 'BME',
      ST: 'NASDAQ OMX',
      CO: 'NASDAQ OMX',
      HE: 'NASDAQ OMX',
      OL: 'OSL',
      HK: 'HKEX',
      AX: 'ASX',
      NZ: 'NZX',
      TW: 'TWSE',
      TWO: 'TPEX',
      SS: 'SSE',
      SZ: 'SZSE',
      SI: 'SGX',
      KL: 'BURSA',
      BK: 'SET',
      JK: 'IDX',
      TO: 'TSX',
      V: 'TSXV',
      SA: 'B3',
      MX: 'BMV',
      JO: 'JSE',
      SR: 'TADAWUL',
      TA: 'TASE',
      IS: 'BIST',
      WA: 'WSE',
      VI: 'VSE',
      AT: 'ATHEX',
      IR: 'ISE'
    };
    if (suffixMap[suffix]) return suffixMap[suffix];
  }

  const ex = (raw || '').trim().toUpperCase();
  if (ex.includes('NASDAQ OMX') || ex === 'STO' || ex === 'CPH' || ex === 'HEL') return 'NASDAQ OMX';
  if (ex.includes('NASDAQ') || ex === 'NMS' || ex === 'NGM' || ex === 'NCM') return 'NASDAQ';
  if (ex.includes('NYSE') || ex === 'NYQ' || ex === 'NYS') return 'NYSE';
  if (ex.includes('AMEX') || ex === 'ASE') return 'AMEX';
  if (ex.includes('ARCA') || ex === 'PCX') return 'NYSE';
  if (ex.includes('BATS') || ex === 'CBOE') return 'CBOE';
  if (ex.includes('NSE') || ex === 'NSI') return 'NSE';
  if (ex.includes('BSE') || ex === 'BOM') return 'BSE';
  if (ex.includes('LSE') || ex === 'LON') return 'LSE';
  if (ex.includes('EURONEXT') || ex === 'PAR' || ex === 'AMS' || ex === 'BRU' || ex === 'LIS' || ex === 'MIL') return 'EURONEXT';
  if (ex.includes('XETRA') || ex === 'GER' || ex === 'DB') return 'XETRA';
  if (ex.includes('SIX') || ex === 'VTX' || ex === 'EBS') return 'SIX';
  if (ex.includes('TSE') || ex === 'TYO' || ex === 'JPX') return 'TSE';
  if (ex.includes('KRX') || ex === 'KSC' || ex === 'KOE') return 'KRX';
  if (ex.includes('HKEX') || ex === 'HKG') return 'HKEX';
  if (ex.includes('ASX')) return 'ASX';
  if (ex.includes('TSXV') || ex === 'VAN') return 'TSXV';
  if (ex.includes('TSX') || ex === 'TOR') return 'TSX';
  if (ex.includes('TWSE') || ex === 'TAI') return 'TWSE';
  if (ex.includes('TPEX') || ex === 'TWO') return 'TPEX';
  if (ex.includes('SSE') || ex === 'SHH') return 'SSE';
  if (ex.includes('SZSE') || ex === 'SHZ') return 'SZSE';
  if (ex.includes('SGX') || ex === 'SES') return 'SGX';
  if (ex.includes('B3') || ex === 'SAO') return 'B3';
  if (ex.includes('BMV') || ex === 'MEX') return 'BMV';
  if (ex.includes('JSE') || ex === 'JNB') return 'JSE';
  if (ex.includes('TADAWUL') || ex === 'SAU') return 'TADAWUL';
  if (ex.includes('TASE') || ex === 'TLV') return 'TASE';
  if (ex.includes('BME') || ex === 'MC') return 'BME';
  if (ex.includes('OSL')) return 'OSL';
  if (ex.includes('BIST')) return 'BIST';
  if (ex.includes('BURSA') || ex === 'KLS') return 'BURSA';
  if (ex.includes('SET') || ex === 'BKK') return 'SET';
  if (ex.includes('IDX') || ex === 'JKT') return 'IDX';
  if (ex.includes('NZX')) return 'NZX';
  if (ex.includes('WSE')) return 'WSE';
  if (ex.includes('VSE')) return 'VSE';
  if (ex.includes('ATHEX')) return 'ATHEX';
  if (ex.includes('ISE')) return 'ISE';
  return ex || 'US';
}

function detectType(symbol: string, name: string, isEtfFlag?: boolean): string {
  const upperName = (name || '').toUpperCase();
  if (isEtfFlag || upperName.includes(' ETF') || upperName.includes('INDEX FUND') || upperName.includes('TRUST ETF')) {
    return 'ETF';
  }
  if (upperName.includes(' ADR') || upperName.includes('AMERICAN DEPOSITARY') || upperName.includes(' ADS')) {
    return 'ADR';
  }
  if (upperName.includes(' REIT') || upperName.includes('REAL ESTATE INVESTMENT TRUST')) {
    return 'REIT';
  }
  return 'Common Stock';
}

// -------------------------------------------------------------
// US Data Fetchers & Parsers
// -------------------------------------------------------------
async function getSecTickers(isOffline: boolean): Promise<any[]> {
  const cacheFile = path.join(RAW_DIR, 'sec_company_tickers_exchange.json');
  if (!isOffline) {
    try {
      const res = await fetch('https://www.sec.gov/files/company_tickers_exchange.json', {
        headers: UA,
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) {
        const text = await res.text();
        fs.writeFileSync(cacheFile, text, 'utf-8');
      }
    } catch {
      /* fallback to cached */
    }
  }

  if (fs.existsSync(cacheFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      return Array.isArray(data?.data) ? data.data : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function getNasdaqListed(isOffline: boolean): Promise<string[]> {
  const cacheFile = path.join(RAW_DIR, 'nasdaqlisted.txt');
  if (!isOffline) {
    try {
      const res = await fetch('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt', {
        headers: UA,
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) {
        const text = await res.text();
        fs.writeFileSync(cacheFile, text, 'utf-8');
      }
    } catch {
      /* fallback to cached */
    }
  }

  if (fs.existsSync(cacheFile)) {
    return fs.readFileSync(cacheFile, 'utf-8').split('\n');
  }
  return [];
}

async function getOtherListed(isOffline: boolean): Promise<string[]> {
  const cacheFile = path.join(RAW_DIR, 'otherlisted.txt');
  if (!isOffline) {
    try {
      const res = await fetch('https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt', {
        headers: UA,
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) {
        const text = await res.text();
        fs.writeFileSync(cacheFile, text, 'utf-8');
      }
    } catch {
      /* fallback to cached */
    }
  }

  if (fs.existsSync(cacheFile)) {
    return fs.readFileSync(cacheFile, 'utf-8').split('\n');
  }
  return [];
}

function parseUsSymbols(
  secRows: any[],
  nasdaqLines: string[],
  otherLines: string[]
): { items: MarketSymbolEntry[]; sourceCount: number } {
  const map = new Map<string, MarketSymbolEntry>();

  // 1. Process SEC rows: [cik, name, ticker, exchange]
  for (const row of secRows) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const rawTicker = String(row[2] || '').trim().toUpperCase();
    const rawName = String(row[1] || '').trim();
    const rawExch = String(row[3] || '').trim();

    if (!rawTicker || !rawName) continue;
    if (rawTicker.length > 5 && rawTicker.includes('.')) continue; // ignore weird share classes
    if (rawTicker.includes('^') || rawTicker.includes('/')) continue; // drop preferreds/units

    const exchange = normalizeExchangeName(rawExch);
    const type = detectType(rawTicker, rawName);

    map.set(rawTicker, {
      symbol: rawTicker,
      name: cleanCompanyName(rawName),
      exchange,
      type,
      country: 'US',
      currency: 'USD'
    });
  }

  // 2. Process Nasdaq Listed: Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
  for (let i = 1; i < nasdaqLines.length; i++) {
    const line = nasdaqLines[i].trim();
    if (!line || line.startsWith('File Creation Time:')) continue;
    const parts = line.split('|');
    if (parts.length < 7) continue;

    const sym = parts[0].trim().toUpperCase();
    const name = parts[1].trim();
    const testIssue = parts[3].trim();
    const isEtf = parts[6].trim() === 'Y';

    if (testIssue === 'Y' || !sym || !name) continue;
    // Drop test issues, warrants, rights, units
    if (sym.includes('.') || sym.includes('$') || sym.endsWith('W') || sym.endsWith('R') || sym.endsWith('U')) {
      if (sym.length > 4) continue;
    }

    const type = detectType(sym, name, isEtf);
    const existing = map.get(sym);
    if (!existing) {
      map.set(sym, {
        symbol: sym,
        name: cleanCompanyName(name),
        exchange: 'NASDAQ',
        type,
        country: 'US',
        currency: 'USD'
      });
    } else {
      if (isEtf) existing.type = 'ETF';
    }
  }

  // 3. Process Other Listed: ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
  for (let i = 1; i < otherLines.length; i++) {
    const line = otherLines[i].trim();
    if (!line || line.startsWith('File Creation Time:')) continue;
    const parts = line.split('|');
    if (parts.length < 7) continue;

    const sym = parts[0].trim().toUpperCase();
    const name = parts[1].trim();
    const exchCode = parts[2].trim();
    const isEtf = parts[4].trim() === 'Y';
    const testIssue = parts[6].trim();

    if (testIssue === 'Y' || !sym || !name) continue;
    if (sym.includes('.') || sym.includes('$') || sym.endsWith('W') || sym.endsWith('R') || sym.endsWith('U')) {
      if (sym.length > 4) continue;
    }

    let exch = 'NYSE';
    if (exchCode === 'A') exch = 'AMEX';
    else if (exchCode === 'P') exch = 'NYSE';
    else if (exchCode === 'Z') exch = 'CBOE';

    const type = detectType(sym, name, isEtf);
    const existing = map.get(sym);
    if (!existing) {
      map.set(sym, {
        symbol: sym,
        name: cleanCompanyName(name),
        exchange: exch,
        type,
        country: 'US',
        currency: 'USD'
      });
    } else {
      if (isEtf) existing.type = 'ETF';
    }
  }

  return { items: Array.from(map.values()), sourceCount: map.size };
}

// -------------------------------------------------------------
// India NSE Data Fetcher & Parser
// -------------------------------------------------------------
async function getNseEquity(isOffline: boolean): Promise<string> {
  const cacheFile = path.join(RAW_DIR, 'nse_equity_l.csv');
  if (!isOffline) {
    try {
      const res = await fetch('https://archives.nseindia.com/content/equities/EQUITY_L.csv', {
        headers: UA,
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) {
        const text = await res.text();
        fs.writeFileSync(cacheFile, text, 'utf-8');
      }
    } catch {
      /* fallback to cached */
    }
  }

  if (fs.existsSync(cacheFile)) {
    return fs.readFileSync(cacheFile, 'utf-8');
  }
  return '';
}

function parseNseCsv(csvText: string): MarketSymbolEntry[] {
  if (!csvText) return [];
  const lines = csvText.split('\n');
  const items: MarketSymbolEntry[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Format: SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE
    const parts = line.split(',');
    if (parts.length < 7) continue;

    const rawSym = parts[0].trim().toUpperCase();
    const name = parts[1].trim();
    const series = parts[2].trim().toUpperCase();
    const isin = parts[6].trim().toUpperCase();

    if (!rawSym || !name) continue;
    // Keep EQ (standard equity), BE (trade for trade), SM (SME)
    if (series !== 'EQ' && series !== 'BE' && series !== 'SM') continue;

    const symbol = `${rawSym}.NS`;
    if (seen.has(symbol)) continue;
    seen.add(symbol);

    items.push({
      symbol,
      name: cleanCompanyName(name),
      exchange: 'NSE',
      type: 'Common Stock',
      country: 'IN',
      currency: 'INR',
      isin: isin || undefined,
      aliases: [rawSym]
    });
  }

  return items;
}

// -------------------------------------------------------------
// India BSE Data Fetcher & Parser
// -------------------------------------------------------------
async function getBseBhavcopy(isOffline: boolean): Promise<string> {
  const cacheFile = path.join(RAW_DIR, 'bse_bhavcopy.csv');
  if (!isOffline) {
    const today = new Date();
    // Try last 7 trading days
    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(today);
      d.setDate(today.getDate() - offset);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}${mm}${dd}`;
      const url = `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${dateStr}_F_0000.CSV`;
      try {
        const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const text = await res.text();
          if (text.length > 50000 && text.includes('TradDt')) {
            fs.writeFileSync(cacheFile, text, 'utf-8');
            break;
          }
        }
      } catch {
        /* continue */
      }
    }
  }

  if (fs.existsSync(cacheFile)) {
    return fs.readFileSync(cacheFile, 'utf-8');
  }
  return '';
}

function parseBseCsv(csvText: string): MarketSymbolEntry[] {
  if (!csvText) return [];
  const lines = csvText.split('\n');
  const items: MarketSymbolEntry[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Format: TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm...
    const parts = line.split(',');
    if (parts.length < 14) continue;

    const instType = parts[4].trim().toUpperCase();
    const scripCode = parts[5].trim();
    const isin = parts[6].trim().toUpperCase();
    const rawTicker = parts[7].trim().toUpperCase();
    const name = parts[13].trim();

    // STK = Stocks, ETP = Exchange Traded Products
    if (instType !== 'STK' && instType !== 'ETP') continue;
    if (!name || (!rawTicker && !scripCode)) continue;

    const cleanTicker = (rawTicker || scripCode).replace(/[^A-Za-z0-9]/g, '');
    const symbol = `${cleanTicker}.BO`;
    if (seen.has(symbol)) continue;
    seen.add(symbol);

    const aliases = [cleanTicker];
    if (scripCode && scripCode !== cleanTicker) {
      aliases.push(scripCode);
      aliases.push(`${scripCode}.BO`);
    }

    items.push({
      symbol,
      name: cleanCompanyName(name),
      exchange: 'BSE',
      type: instType === 'ETP' ? 'ETF' : 'Common Stock',
      country: 'IN',
      currency: 'INR',
      isin: isin || undefined,
      aliases
    });
  }

  return items;
}

// -------------------------------------------------------------
// Existing Base Symbols (Watchlist & Current Extra)
// -------------------------------------------------------------
function loadExistingSymbols(): MarketSymbolEntry[] {
  const items: MarketSymbolEntry[] = [];

  // Existing market-symbols-extra.json
  if (fs.existsSync(EXTRA_SYMBOLS_PATH)) {
    try {
      const extra = JSON.parse(fs.readFileSync(EXTRA_SYMBOLS_PATH, 'utf-8'));
      if (Array.isArray(extra)) {
        for (const e of extra) {
          if (!e.symbol || !e.name) continue;
          items.push({
            symbol: e.symbol.toUpperCase().trim(),
            name: cleanCompanyName(e.name),
            exchange: normalizeExchangeName(e.exchange, e.symbol),
            type: e.type || 'Common Stock',
            sector: e.sector,
            country: e.country,
            currency: e.currency,
            aliases: e.aliases
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Watchlist
  const watchlistPath = path.join(process.cwd(), 'data', 'watchlist.json');
  if (fs.existsSync(watchlistPath)) {
    try {
      const wl = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8'));
      if (Array.isArray(wl)) {
        for (const w of wl) {
          if (!w.ticker || !w.companyName) continue;
          items.push({
            symbol: w.ticker.toUpperCase().trim(),
            name: cleanCompanyName(w.companyName),
            exchange: normalizeExchangeName(w.exchange),
            type: 'Common Stock',
            sector: w.sector,
            country: w.country === 'United States' ? 'US' : w.country === 'India' ? 'IN' : undefined,
            currency: w.exchange === 'NSE' || w.exchange === 'BSE' ? 'INR' : 'USD'
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  return items;
}

// -------------------------------------------------------------
// Main Build Pipeline
// -------------------------------------------------------------
export async function buildSymbolsDatabase(options: { offline?: boolean } = {}) {
  ensureDirs();
  const isOffline = Boolean(options.offline);
  console.log(`\n======================================================`);
  console.log(`Building Market Symbols Database (Mode: ${isOffline ? 'OFFLINE' : 'ONLINE'})`);
  console.log(`======================================================\n`);

  const failedSources: string[] = [];

  // 1. Fetch & parse US
  console.log('[1/4] Processing US symbols (SEC, NASDAQ, NYSE, AMEX)...');
  const secRows = await getSecTickers(isOffline);
  const nasdaqLines = await getNasdaqListed(isOffline);
  const otherLines = await getOtherListed(isOffline);

  if (secRows.length === 0) failedSources.push('SEC company_tickers_exchange.json');
  if (nasdaqLines.length === 0) failedSources.push('nasdaqtrader nasdaqlisted.txt');
  if (otherLines.length === 0) failedSources.push('nasdaqtrader otherlisted.txt');

  const { items: usItems } = parseUsSymbols(secRows, nasdaqLines, otherLines);
  console.log(`  -> US Valid symbols extracted: ${usItems.length}`);

  // 2. Fetch & parse India NSE
  console.log('[2/4] Processing India NSE symbols...');
  const nseText = await getNseEquity(isOffline);
  if (!nseText) failedSources.push('NSE archives EQUITY_L.csv');
  const nseItems = parseNseCsv(nseText);
  console.log(`  -> NSE Valid symbols extracted: ${nseItems.length}`);

  // 3. Fetch & parse India BSE
  console.log('[3/4] Processing India BSE symbols...');
  const bseText = await getBseBhavcopy(isOffline);
  if (!bseText) failedSources.push('BSE Bhavcopy CSV');
  const bseItems = parseBseCsv(bseText);
  console.log(`  -> BSE Valid symbols extracted: ${bseItems.length}`);

  // 4. International Curated Database
  console.log('[4/4] Processing International Curated Fallback symbols...');
  const internationalItems = buildCuratedInternational();
  console.log(`  -> International Valid symbols extracted: ${internationalItems.length}`);

  // 5. Existing base symbols
  const existingItems = loadExistingSymbols();

  // Deduplicate and merge
  const mergedMap = new Map<string, MarketSymbolEntry>();

  const add = (entry: MarketSymbolEntry) => {
    const sym = entry.symbol.toUpperCase().trim();
    if (!sym || !entry.name) return;

    if (!mergedMap.has(sym)) {
      mergedMap.set(sym, {
        symbol: sym,
        name: cleanCompanyName(entry.name),
        exchange: normalizeExchangeName(entry.exchange, sym),
        type: entry.type || 'Common Stock',
        country: entry.country,
        currency: entry.currency,
        sector: entry.sector,
        industry: entry.industry,
        aliases: entry.aliases ? [...new Set(entry.aliases)] : undefined,
        isin: entry.isin
      });
    } else {
      // Merge metadata if existing has missing fields
      const existing = mergedMap.get(sym)!;
      if (!existing.sector && entry.sector) existing.sector = entry.sector;
      if (!existing.country && entry.country) existing.country = entry.country;
      if (!existing.currency && entry.currency) existing.currency = entry.currency;
      if (!existing.isin && entry.isin) existing.isin = entry.isin;
      if (entry.aliases) {
        existing.aliases = [...new Set([...(existing.aliases || []), ...entry.aliases])];
      }
    }
  };

  // Add in precedence order: base existing -> international -> NSE -> BSE -> US
  for (const item of existingItems) add(item);
  for (const item of internationalItems) add(item);
  for (const item of nseItems) add(item);
  for (const item of bseItems) add(item);
  for (const item of usItems) add(item);

  const allSymbols = Array.from(mergedMap.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));

  // Shard into categories
  const usShards: MarketSymbolEntry[] = [];
  const nseShards: MarketSymbolEntry[] = [];
  const bseShards: MarketSymbolEntry[] = [];
  const intlShards: MarketSymbolEntry[] = [];

  const exchangeCounts: Record<string, number> = {};
  const countryCounts: Record<string, number> = {};

  for (const item of allSymbols) {
    exchangeCounts[item.exchange] = (exchangeCounts[item.exchange] || 0) + 1;
    if (item.country) countryCounts[item.country] = (countryCounts[item.country] || 0) + 1;

    if (item.exchange === 'NSE' || item.symbol.endsWith('.NS')) {
      nseShards.push(item);
    } else if (item.exchange === 'BSE' || item.symbol.endsWith('.BO')) {
      bseShards.push(item);
    } else if (['NASDAQ', 'NYSE', 'AMEX', 'CBOE', 'OTC'].includes(item.exchange) && !item.symbol.includes('.')) {
      usShards.push(item);
    } else {
      intlShards.push(item);
    }
  }

  // Write sharded files
  fs.writeFileSync(path.join(SYMBOLS_DIR, 'us.json'), JSON.stringify(usShards, null, 2), 'utf-8');
  fs.writeFileSync(path.join(SYMBOLS_DIR, 'india-nse.json'), JSON.stringify(nseShards, null, 2), 'utf-8');
  fs.writeFileSync(path.join(SYMBOLS_DIR, 'india-bse.json'), JSON.stringify(bseShards, null, 2), 'utf-8');
  fs.writeFileSync(path.join(SYMBOLS_DIR, 'international.json'), JSON.stringify(intlShards, null, 2), 'utf-8');

  // Write manifest
  const manifest = {
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    totalSymbols: allSymbols.length,
    countsByShard: {
      us: usShards.length,
      nse: nseShards.length,
      bse: bseShards.length,
      international: intlShards.length
    },
    countsByExchange: exchangeCounts,
    countsByCountry: countryCounts,
    failedSources
  };
  fs.writeFileSync(path.join(SYMBOLS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  // Also write data/market-symbols-extra.json for 100% backward compatibility
  fs.writeFileSync(EXTRA_SYMBOLS_PATH, JSON.stringify(allSymbols, null, 2), 'utf-8');

  // Summary report
  console.log(`\n================ BUILD REPORT ================`);
  console.log(`Total Symbols:           ${allSymbols.length.toLocaleString()}`);
  console.log(`US Listings:             ${usShards.length.toLocaleString()} (Target: >= 6,000)`);
  console.log(`NSE Listings (.NS):      ${nseShards.length.toLocaleString()} (Target: >= 1,800)`);
  console.log(`BSE Listings (.BO):      ${bseShards.length.toLocaleString()} (Target: >= 4,000)`);
  console.log(`International Listings:  ${intlShards.length.toLocaleString()} (Target: >= 1,500)`);
  console.log(`Total Exchanges Covered: ${Object.keys(exchangeCounts).length} (Target: >= 30)`);
  console.log(`----------------------------------------------`);
  console.log(`Exchanges Breakdown:`);
  for (const [ex, count] of Object.entries(exchangeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ex.padEnd(12)}: ${count.toString().padStart(6)}`);
  }
  console.log(`----------------------------------------------`);
  if (failedSources.length > 0) {
    console.warn(`WARNING: The following sources failed or were unreachable:`);
    for (const f of failedSources) console.warn(`  - ${f}`);
  } else {
    console.log(`All primary sources fetched and parsed successfully!`);
  }
  console.log(`==============================================\n`);

  return {
    total: allSymbols.length,
    us: usShards.length,
    nse: nseShards.length,
    bse: bseShards.length,
    international: intlShards.length,
    exchanges: Object.keys(exchangeCounts).length,
    failedSources
  };
}

if (process.argv[1] && process.argv[1].endsWith('build-symbols.ts')) {
  const isOffline = process.argv.includes('--offline');
  buildSymbolsDatabase({ offline: isOffline }).catch((err) => {
    console.error('Fatal build error:', err);
    process.exit(1);
  });
}
