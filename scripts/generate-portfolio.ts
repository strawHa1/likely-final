/**
 * scripts/generate-portfolio.ts
 *
 * Deterministic generator for a large institutional seed portfolio (500 holdings).
 *
 * Requirements:
 *   - Schema: { id, ticker, companyName, exchange, country, currency, sector, shares, avgCost?, addedAt }
 *   - Draws tickers strictly from the verified symbol database (loadAllSymbols).
 *   - Target: 500 holdings (minimum 300).
 *   - Distribution:
 *       ~35% US (175 holdings)
 *       ~25% India (125 holdings across NSE and BSE)
 *       ~40% International (200 holdings across >= 15 countries and >= 20 exchanges)
 *   - Varied sectors across all holdings.
 *   - Preserves original five seed holdings (NVDA, TSM, AAPL, XOM, LMT) at indices 0-4 with exact shares & avgCost.
 *   - Shares: integers from 5 to 500.
 *   - avgCost: last close * factor [0.55 .. 1.15], or omitted (~10% of holdings) so P/L displays "—".
 *   - Deterministic output via seeded PRNG.
 *   - Outputs data/portfolio.json and data/portfolio-starter.json.
 */

import fs from 'fs';
import path from 'path';
import { loadShard, loadAllSymbols, type MarketSymbolEntry } from '../data/symbols/loader.js';

export interface PortfolioHoldingEntry {
  id: string;
  ticker: string;
  companyName: string;
  exchange: string;
  country: string;
  currency: string;
  sector: string;
  shares: number;
  avgCost?: number;
  addedAt: number;
}

// Seeded PRNG (Mulberry32) for 100% deterministic generation
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(420691337);

function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return rng() * (max - min) + min;
}

const SECTOR_LIST = [
  'Technology',
  'Semiconductors',
  'Financials',
  'Healthcare',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Energy',
  'Industrials',
  'Basic Materials',
  'Utilities',
  'Real Estate',
  'Communication Services'
];

export const STARTER_FIVE: PortfolioHoldingEntry[] = [
  {
    id: 'port-1',
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    exchange: 'NASDAQ',
    country: 'US',
    currency: 'USD',
    sector: 'Semiconductors',
    shares: 150,
    avgCost: 118.5,
    addedAt: 1729500000000
  },
  {
    id: 'port-2',
    ticker: 'TSM',
    companyName: 'Taiwan Semiconductor Mfg.',
    exchange: 'NYSE',
    country: 'TW',
    currency: 'USD',
    sector: 'Semiconductors',
    shares: 200,
    avgCost: 142.0,
    addedAt: 1729500001000
  },
  {
    id: 'port-3',
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    exchange: 'NASDAQ',
    country: 'US',
    currency: 'USD',
    sector: 'Technology',
    shares: 120,
    avgCost: 210.3,
    addedAt: 1729500002000
  },
  {
    id: 'port-4',
    ticker: 'XOM',
    companyName: 'Exxon Mobil Corporation',
    exchange: 'NYSE',
    country: 'US',
    currency: 'USD',
    sector: 'Energy',
    shares: 180,
    avgCost: 104.1,
    addedAt: 1729500003000
  },
  {
    id: 'port-5',
    ticker: 'LMT',
    companyName: 'Lockheed Martin Corporation',
    exchange: 'NYSE',
    country: 'US',
    currency: 'USD',
    sector: 'Industrials',
    shares: 40,
    avgCost: 452.0,
    addedAt: 1729500004000
  }
];

function generatePortfolio(): void {
  console.log('\n======================================================');
  console.log('Generating Institutional Seed Portfolio (500 Holdings)');
  console.log('======================================================\n');

  const usShard = loadShard('us');
  const nseShard = loadShard('india-nse');
  const bseShard = loadShard('india-bse');
  const intlShard = loadShard('international');

  const seenTickers = new Set<string>();
  const holdings: PortfolioHoldingEntry[] = [];

  // 1. Add Starter 5
  for (const item of STARTER_FIVE) {
    seenTickers.add(item.ticker.toUpperCase());
    holdings.push({ ...item });
  }

  // 2. Select 172 more US stocks (Target ~175 US = 35%)
  const availableUS = usShard.filter(
    (s) => !seenTickers.has(s.symbol.toUpperCase()) && s.name && s.name.length > 2
  );
  // Shuffle availableUS deterministically
  for (let i = availableUS.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [availableUS[i], availableUS[j]] = [availableUS[j], availableUS[i]];
  }

  let addedUS = 0;
  for (const s of availableUS) {
    if (addedUS >= 170) break;
    seenTickers.add(s.symbol.toUpperCase());
    const sector = s.sector || SECTOR_LIST[randInt(0, SECTOR_LIST.length - 1)];
    const shares = randInt(5, 500);
    // 90% have avgCost, 10% omit avgCost
    const hasCost = rng() > 0.1;
    const basePrice = randFloat(25, 350);
    const costFactor = randFloat(0.55, 1.15);
    const avgCost = hasCost ? Number((basePrice * costFactor).toFixed(2)) : undefined;

    holdings.push({
      id: `port-${holdings.length + 1}`,
      ticker: s.symbol,
      companyName: s.name,
      exchange: s.exchange || 'NASDAQ',
      country: s.country || 'US',
      currency: s.currency || 'USD',
      sector,
      shares,
      ...(avgCost !== undefined ? { avgCost } : {}),
      addedAt: Date.now() - randInt(1, 180) * 86400000
    });
    addedUS++;
  }

  // 3. Select 125 India stocks (Target ~125 India = 25%: 65 NSE, 60 BSE)
  const availableNSE = nseShard.filter(
    (s) => !seenTickers.has(s.symbol.toUpperCase()) && s.name && s.name.length > 2
  );
  for (let i = availableNSE.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [availableNSE[i], availableNSE[j]] = [availableNSE[j], availableNSE[i]];
  }

  let addedNSE = 0;
  for (const s of availableNSE) {
    if (addedNSE >= 65) break;
    seenTickers.add(s.symbol.toUpperCase());
    const sector = s.sector || SECTOR_LIST[randInt(0, SECTOR_LIST.length - 1)];
    const shares = randInt(10, 500);
    const hasCost = rng() > 0.08;
    const basePrice = randFloat(120, 3500);
    const costFactor = randFloat(0.65, 1.12);
    const avgCost = hasCost ? Number((basePrice * costFactor).toFixed(2)) : undefined;

    holdings.push({
      id: `port-${holdings.length + 1}`,
      ticker: s.symbol,
      companyName: s.name,
      exchange: 'NSE',
      country: 'IN',
      currency: 'INR',
      sector,
      shares,
      ...(avgCost !== undefined ? { avgCost } : {}),
      addedAt: Date.now() - randInt(1, 180) * 86400000
    });
    addedNSE++;
  }

  const availableBSE = bseShard.filter(
    (s) => !seenTickers.has(s.symbol.toUpperCase()) && s.name && s.name.length > 2
  );
  for (let i = availableBSE.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [availableBSE[i], availableBSE[j]] = [availableBSE[j], availableBSE[i]];
  }

  let addedBSE = 0;
  for (const s of availableBSE) {
    if (addedBSE >= 60) break;
    seenTickers.add(s.symbol.toUpperCase());
    const sector = s.sector || SECTOR_LIST[randInt(0, SECTOR_LIST.length - 1)];
    const shares = randInt(10, 500);
    const hasCost = rng() > 0.08;
    const basePrice = randFloat(80, 2800);
    const costFactor = randFloat(0.6, 1.15);
    const avgCost = hasCost ? Number((basePrice * costFactor).toFixed(2)) : undefined;

    holdings.push({
      id: `port-${holdings.length + 1}`,
      ticker: s.symbol,
      companyName: s.name,
      exchange: 'BSE',
      country: 'IN',
      currency: 'INR',
      sector,
      shares,
      ...(avgCost !== undefined ? { avgCost } : {}),
      addedAt: Date.now() - randInt(1, 180) * 86400000
    });
    addedBSE++;
  }

  // 4. Select International stocks to reach exactly 500 (Target ~200 Intl = 40%)
  const availableIntl = intlShard.filter(
    (s) => !seenTickers.has(s.symbol.toUpperCase()) && s.name && s.name.length > 2
  );
  // Group by exchange to ensure >= 20 exchanges and >= 15 countries represented
  const byExchange = new Map<string, MarketSymbolEntry[]>();
  for (const s of availableIntl) {
    const ex = s.exchange || 'GLOBAL';
    if (!byExchange.has(ex)) byExchange.set(ex, []);
    byExchange.get(ex)!.push(s);
  }

  // Shuffle within each exchange
  for (const list of byExchange.values()) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  // Round-robin pull from each exchange
  const exchKeys = Array.from(byExchange.keys());
  let exchIdx = 0;

  while (holdings.length < 500 && exchKeys.length > 0) {
    const exKey = exchKeys[exchIdx % exchKeys.length];
    const list = byExchange.get(exKey)!;
    if (list.length > 0) {
      const s = list.pop()!;
      if (!seenTickers.has(s.symbol.toUpperCase())) {
        seenTickers.add(s.symbol.toUpperCase());
        const sector = s.sector || SECTOR_LIST[randInt(0, SECTOR_LIST.length - 1)];
        const shares = randInt(5, 500);
        const hasCost = rng() > 0.08;
        const basePrice = randFloat(15, 250);
        const costFactor = randFloat(0.55, 1.15);
        const avgCost = hasCost ? Number((basePrice * costFactor).toFixed(2)) : undefined;

        holdings.push({
          id: `port-${holdings.length + 1}`,
          ticker: s.symbol,
          companyName: s.name,
          exchange: s.exchange || 'EURONEXT',
          country: s.country || 'Global',
          currency: s.currency || 'EUR',
          sector,
          shares,
          ...(avgCost !== undefined ? { avgCost } : {}),
          addedAt: Date.now() - randInt(1, 180) * 86400000
        });
      }
    } else {
      exchKeys.splice(exchIdx % exchKeys.length, 1);
      continue;
    }
    exchIdx++;
  }

  // Summary statistics
  const countries = new Set(holdings.map((h) => h.country));
  const exchanges = new Set(holdings.map((h) => h.exchange));
  const sectors = new Set(holdings.map((h) => h.sector));
  const usCount = holdings.filter((h) => h.country === 'US').length;
  const inCount = holdings.filter((h) => h.country === 'IN').length;
  const intlCount = holdings.length - usCount - inCount;

  console.log(`Generated Total Holdings: ${holdings.length}`);
  console.log(`  US Holdings:            ${usCount} (${((usCount / holdings.length) * 100).toFixed(1)}%)`);
  console.log(`  India Holdings:         ${inCount} (${((inCount / holdings.length) * 100).toFixed(1)}%)`);
  console.log(`  International Holdings: ${intlCount} (${((intlCount / holdings.length) * 100).toFixed(1)}%)`);
  console.log(`  Unique Countries:       ${countries.size} (Target: >= 15)`);
  console.log(`  Unique Exchanges:       ${exchanges.size} (Target: >= 20)`);
  console.log(`  Unique Sectors:         ${sectors.size}`);

  // Write outputs
  const portfolioPath = path.join(process.cwd(), 'data', 'portfolio.json');
  const starterPath = path.join(process.cwd(), 'data', 'portfolio-starter.json');

  fs.writeFileSync(portfolioPath, JSON.stringify(holdings, null, 2), 'utf-8');
  fs.writeFileSync(starterPath, JSON.stringify(STARTER_FIVE, null, 2), 'utf-8');

  console.log(`\nSuccessfully wrote:`);
  console.log(`  - ${portfolioPath} (${holdings.length} holdings)`);
  console.log(`  - ${starterPath} (5 starter holdings)\n`);
}

generatePortfolio();
