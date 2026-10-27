/**
 * scripts/validate-symbols.ts
 *
 * Data quality gate for market symbols database.
 * Validates:
 *   1. Valid JSON format
 *   2. Required fields present: symbol, name, exchange, type
 *   3. Unique symbols (no duplicates)
 *   4. Suffix matches exchange
 *   5. No empty or whitespace-only names or symbols
 *   6. Aliases point to existing symbols in the database (>= 150 aliases)
 *   7. Prints counts per exchange and country
 * Exits non-zero on failure.
 */

import fs from 'fs';
import path from 'path';

interface SymbolEntry {
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

const SUFFIX_TO_EXCHANGE: Record<string, string[]> = {
  NS: ['NSE'],
  BO: ['BSE'],
  L: ['LSE'],
  T: ['TSE'],
  KS: ['KRX'],
  KQ: ['KRX'],
  PA: ['EURONEXT'],
  AS: ['EURONEXT'],
  BR: ['EURONEXT'],
  LS: ['EURONEXT'],
  MI: ['EURONEXT'],
  DE: ['XETRA'],
  F: ['XETRA', 'FRA'],
  SW: ['SIX'],
  MC: ['BME'],
  ST: ['NASDAQ OMX'],
  CO: ['NASDAQ OMX'],
  HE: ['NASDAQ OMX'],
  OL: ['OSL'],
  HK: ['HKEX'],
  AX: ['ASX'],
  NZ: ['NZX'],
  TW: ['TWSE'],
  TWO: ['TPEX'],
  SS: ['SSE'],
  SZ: ['SZSE'],
  SI: ['SGX'],
  KL: ['BURSA'],
  BK: ['SET'],
  JK: ['IDX'],
  TO: ['TSX'],
  V: ['TSXV'],
  SA: ['B3'],
  MX: ['BMV'],
  JO: ['JSE'],
  SR: ['TADAWUL'],
  TA: ['TASE'],
  IS: ['BIST'],
  WA: ['WSE'],
  VI: ['VSE'],
  AT: ['ATHEX'],
  IR: ['ISE']
};

const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'CBOE', 'OTC', 'US', 'TXSE']);

function runValidation() {
  console.log('\n======================================================');
  console.log('Running Symbol Database Quality Gate');
  console.log('======================================================\n');

  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check required JSON files exist and are parseable
  const requiredFiles = [
    'data/symbols/us.json',
    'data/symbols/india-nse.json',
    'data/symbols/india-bse.json',
    'data/symbols/international.json',
    'data/symbols/manifest.json',
    'data/symbol-aliases.json',
    'data/market-symbols-extra.json'
  ];

  for (const relPath of requiredFiles) {
    const fullPath = path.join(process.cwd(), relPath);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Missing required file: ${relPath}`);
      continue;
    }
    try {
      JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    } catch (e: any) {
      errors.push(`Invalid JSON syntax in ${relPath}: ${e.message}`);
    }
  }

  if (errors.length > 0) {
    console.error('Initial JSON format checks failed:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  // 2. Load symbols and check properties
  const allSymbols: SymbolEntry[] = [];
  const symbolSet = new Set<string>();
  const duplicateSymbols = new Set<string>();

  const shardPaths = [
    'data/symbols/us.json',
    'data/symbols/india-nse.json',
    'data/symbols/india-bse.json',
    'data/symbols/international.json'
  ];

  for (const relPath of shardPaths) {
    const fullPath = path.join(process.cwd(), relPath);
    const shard: SymbolEntry[] = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

    for (let i = 0; i < shard.length; i++) {
      const entry = shard[i];
      const loc = `${relPath}[${i}]`;

      // Check required fields
      if (!entry.symbol || typeof entry.symbol !== 'string' || !entry.symbol.trim()) {
        errors.push(`${loc}: Missing or empty required field 'symbol'`);
      }
      if (!entry.name || typeof entry.name !== 'string' || !entry.name.trim()) {
        errors.push(`${loc}: Missing or whitespace-only required field 'name' (${entry.symbol})`);
      }
      if (!entry.exchange || typeof entry.exchange !== 'string' || !entry.exchange.trim()) {
        errors.push(`${loc}: Missing or empty required field 'exchange' (${entry.symbol})`);
      }
      if (!entry.type || typeof entry.type !== 'string' || !entry.type.trim()) {
        errors.push(`${loc}: Missing or empty required field 'type' (${entry.symbol})`);
      }

      const sym = (entry.symbol || '').toUpperCase().trim();

      // Check uniqueness
      if (symbolSet.has(sym)) {
        duplicateSymbols.add(sym);
      } else {
        symbolSet.add(sym);
      }

      // Check suffix matches exchange
      if (sym.includes('.')) {
        const suffix = sym.split('.').pop() || '';
        const allowedExchanges = SUFFIX_TO_EXCHANGE[suffix];
        if (allowedExchanges && !allowedExchanges.includes(entry.exchange)) {
          errors.push(
            `${loc}: Suffix .${suffix} does not match exchange ${entry.exchange} (expected one of: ${allowedExchanges.join(', ')}) for symbol ${sym}`
          );
        }
      } else {
        // No suffix -> expect US exchange
        if (!US_EXCHANGES.has(entry.exchange)) {
          warnings.push(`${loc}: Symbol ${sym} has no suffix but exchange is ${entry.exchange}`);
        }
      }

      allSymbols.push(entry);
    }
  }

  if (duplicateSymbols.size > 0) {
    const sample = Array.from(duplicateSymbols).slice(0, 10).join(', ');
    errors.push(`Found ${duplicateSymbols.size} duplicate symbols! Sample: ${sample}`);
  }

  // 3. Validate aliases map
  const aliasesPath = path.join(process.cwd(), 'data', 'symbol-aliases.json');
  const aliases: Record<string, string[]> = JSON.parse(fs.readFileSync(aliasesPath, 'utf-8'));
  const aliasKeys = Object.keys(aliases);

  if (aliasKeys.length < 150) {
    errors.push(`Symbol aliases count is ${aliasKeys.length}, but at least 150 are required!`);
  }

  let invalidAliasTargets = 0;
  for (const [alias, targets] of Object.entries(aliases)) {
    if (!Array.isArray(targets) || targets.length === 0) {
      errors.push(`Alias "${alias}" has no target symbols.`);
      continue;
    }
    for (const t of targets) {
      if (!symbolSet.has(t.toUpperCase())) {
        errors.push(`Alias "${alias}" references target "${t}" which does NOT exist in the symbol database!`);
        invalidAliasTargets++;
      }
    }
  }

  // 4. Counts per exchange and country
  const exchangeCounts: Record<string, number> = {};
  const countryCounts: Record<string, number> = {};

  for (const item of allSymbols) {
    exchangeCounts[item.exchange] = (exchangeCounts[item.exchange] || 0) + 1;
    const c = item.country || 'Unknown';
    countryCounts[c] = (countryCounts[c] || 0) + 1;
  }

  console.log(`\n----------------- COUNTS PER EXCHANGE -----------------`);
  const sortedExchanges = Object.entries(exchangeCounts).sort((a, b) => b[1] - a[1]);
  for (const [ex, count] of sortedExchanges) {
    console.log(`  ${ex.padEnd(16)}: ${count.toString().padStart(6)}`);
  }

  console.log(`\n----------------- COUNTS PER COUNTRY ------------------`);
  const sortedCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);
  for (const [c, count] of sortedCountries.slice(0, 25)) {
    console.log(`  ${c.padEnd(16)}: ${count.toString().padStart(6)}`);
  }
  if (sortedCountries.length > 25) {
    console.log(`  ... and ${sortedCountries.length - 25} more countries.`);
  }

  console.log(`\n---------------- SUMMARY STATISTICS -------------------`);
  console.log(`Total Symbols Validated: ${allSymbols.length.toLocaleString()}`);
  console.log(`Unique Symbols:          ${symbolSet.size.toLocaleString()}`);
  console.log(`Total Exchanges:         ${sortedExchanges.length}`);
  console.log(`Total Countries:         ${sortedCountries.length}`);
  console.log(`Total Aliases:           ${aliasKeys.length}`);

  if (warnings.length > 0) {
    console.log(`\nQuality Warnings (${warnings.length}):`);
    for (const w of warnings.slice(0, 5)) console.log(`  ! ${w}`);
  }

  if (errors.length > 0) {
    console.error(`\n================ QUALITY GATE FAILED (${errors.length} errors) ================`);
    for (const err of errors.slice(0, 20)) {
      console.error(`  X ${err}`);
    }
    if (errors.length > 20) {
      console.error(`  ... and ${errors.length - 20} more errors.`);
    }
    process.exit(1);
  }

  console.log(`\n================ QUALITY GATE PASSED ================`);
  console.log('All criteria satisfied: Valid JSON, required fields present, unique symbols,');
  console.log('correct exchange-suffix mappings, non-empty names, and >= 150 valid aliases.\n');
}

runValidation();
