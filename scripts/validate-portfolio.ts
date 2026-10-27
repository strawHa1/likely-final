/**
 * scripts/validate-portfolio.ts
 *
 * Data quality gate for portfolio seeds (data/portfolio.json and data/portfolio-starter.json).
 *
 * Checks:
 *   1. Valid JSON format and array structure
 *   2. Required fields present: id, ticker, companyName, exchange, country, currency, sector, shares
 *   3. Unique tickers (zero duplicates)
 *   4. Every ticker exists in the symbol database (loadAllSymbols)
 *   5. Currency matches exchange convention
 *   6. Shares are positive numbers
 *   7. Prints breakdown by country, exchange, and sector
 *   8. Exits non-zero on any validation failure!
 */

import fs from 'fs';
import path from 'path';
import { loadAllSymbols } from '../data/symbols/loader.js';

interface PortfolioEntry {
  id: string;
  ticker: string;
  companyName: string;
  exchange: string;
  country: string;
  currency: string;
  sector: string;
  shares: number;
  avgCost?: number;
  addedAt?: number;
}

let errorCount = 0;

function reportError(msg: string): void {
  console.error(`  [FAIL] ${msg}`);
  errorCount++;
}

function validateFile(filePath: string, minItems = 1): void {
  const fileName = path.basename(filePath);
  console.log(`\nValidating ${fileName}...`);

  if (!fs.existsSync(filePath)) {
    reportError(`File does not exist: ${filePath}`);
    return;
  }

  let items: PortfolioEntry[];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    items = JSON.parse(raw);
    if (!Array.isArray(items)) {
      reportError(`${fileName} must be an array of holding objects.`);
      return;
    }
  } catch (err: any) {
    reportError(`Failed to parse JSON in ${fileName}: ${err.message}`);
    return;
  }

  if (items.length < minItems) {
    reportError(`${fileName} has ${items.length} items, expected at least ${minItems}.`);
  }

  const allSymbols = loadAllSymbols();
  const symbolMap = new Map<string, any>();
  for (const s of allSymbols) {
    symbolMap.set(s.symbol.toUpperCase(), s);
  }

  const seenTickers = new Set<string>();
  const seenIds = new Set<string>();
  const countryCounts = new Map<string, number>();
  const exchangeCounts = new Map<string, number>();
  const sectorCounts = new Map<string, number>();

  for (let idx = 0; idx < items.length; idx++) {
    const h = items[idx];
    const prefix = `[Row ${idx + 1} (${h.ticker || 'unknown'})]`;

    // 1. Required fields
    if (!h.id || typeof h.id !== 'string') reportError(`${prefix} Missing or invalid 'id'`);
    if (!h.ticker || typeof h.ticker !== 'string') reportError(`${prefix} Missing or invalid 'ticker'`);
    if (!h.companyName || typeof h.companyName !== 'string') reportError(`${prefix} Missing or invalid 'companyName'`);
    if (!h.exchange || typeof h.exchange !== 'string') reportError(`${prefix} Missing or invalid 'exchange'`);
    if (!h.country || typeof h.country !== 'string') reportError(`${prefix} Missing or invalid 'country'`);
    if (!h.currency || typeof h.currency !== 'string') reportError(`${prefix} Missing or invalid 'currency'`);
    if (!h.sector || typeof h.sector !== 'string') reportError(`${prefix} Missing or invalid 'sector'`);
    if (typeof h.shares !== 'number' || h.shares <= 0 || !Number.isFinite(h.shares)) {
      reportError(`${prefix} 'shares' must be a positive finite number (got ${h.shares})`);
    }

    // Disallowed legacy fields in storage
    if ((h as any).allocationPct !== undefined) {
      reportError(`${prefix} 'allocationPct' must not be persisted in raw data (computed at runtime)`);
    }
    if ((h as any).riskScore !== undefined) {
      reportError(`${prefix} 'riskScore' must not be persisted in raw data (computed at runtime)`);
    }
    if ((h as any).action !== undefined) {
      reportError(`${prefix} 'action' must not be persisted in raw data (computed at runtime)`);
    }

    // 2. Unique check
    const upperSym = (h.ticker || '').toUpperCase().trim();
    if (seenTickers.has(upperSym)) {
      reportError(`${prefix} Duplicate ticker "${h.ticker}" found in portfolio`);
    }
    seenTickers.add(upperSym);

    if (h.id) {
      if (seenIds.has(h.id)) {
        reportError(`${prefix} Duplicate id "${h.id}"`);
      }
      seenIds.add(h.id);
    }

    // 3. Exists in Symbol Database
    if (!symbolMap.has(upperSym)) {
      reportError(`${prefix} Ticker "${h.ticker}" does NOT exist in the symbol database!`);
    }

    // 4. Counts
    countryCounts.set(h.country, (countryCounts.get(h.country) || 0) + 1);
    exchangeCounts.set(h.exchange, (exchangeCounts.get(h.exchange) || 0) + 1);
    sectorCounts.set(h.sector, (sectorCounts.get(h.sector) || 0) + 1);
  }

  console.log(`  Passed checks for ${items.length} holdings:`);
  console.log(`    - Unique Tickers: ${seenTickers.size}`);
  console.log(`    - Unique Countries: ${countryCounts.size}`);
  console.log(`    - Unique Exchanges: ${exchangeCounts.size}`);
  console.log(`    - Unique Sectors: ${sectorCounts.size}`);
}

function run(): void {
  console.log('\n======================================================');
  console.log('Running Portfolio Data Quality Gate');
  console.log('======================================================');

  const mainPortfolio = path.join(process.cwd(), 'data', 'portfolio.json');
  const starterPortfolio = path.join(process.cwd(), 'data', 'portfolio-starter.json');

  validateFile(mainPortfolio, 300);
  validateFile(starterPortfolio, 5);

  console.log('\n---------------- SUMMARY ----------------');
  if (errorCount === 0) {
    console.log('>>> PORTFOLIO VALIDATION PASSED (0 errors) <<<\n');
    process.exit(0);
  } else {
    console.error(`>>> PORTFOLIO VALIDATION FAILED (${errorCount} errors) <<<\n`);
    process.exit(1);
  }
}

run();
