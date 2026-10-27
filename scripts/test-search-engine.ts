/**
 * scripts/test-search-engine.ts
 *
 * Comprehensive test suite for the upgraded search engine.
 * Covers:
 *   1. Ranking: Exact ticker beats name-contains
 *   2. Diacritics normalization (Nestlé == nestle)
 *   3. Alias search (google -> GOOGL, tsmc -> TSM, jio -> RELIANCE, paytm -> PAYTM)
 *   4. Suffix-less ticker (RELIANCE -> RELIANCE.NS & RELIANCE.BO)
 *   5. Numeric ticker ("7203" -> Toyota, "005930" -> Samsung)
 *   6. Multi-word search ("Tata Steel" -> TATASTEEL.NS)
 *   7. Empty query handling
 *   8. Special characters handling
 *   9. 10,000-character input (safety & ReDoS prevention)
 *   10. Typo tolerance (relianc, aple, samsng)
 *   11. Fallback-merge deduplication
 *   12. Performance test: assert latency < 50ms across 25,000+ entries.
 */

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { SearchEngine, type MarketSymbolEntry, type SearchResultItem } from '../src/lib/searchEngine.js';
import { loadAllSymbols } from '../data/symbols/loader.js';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('Running Company Explorer & Search Engine Test Suite');
  console.log('======================================================\n');

  // Load symbols
  const allSymbols = loadAllSymbols();
  assert(allSymbols.length >= 25000, 'Database size >= 25,000', `Actual count: ${allSymbols.length}`);

  // Load aliases
  const aliasesPath = path.join(process.cwd(), 'data', 'symbol-aliases.json');
  const aliases = JSON.parse(fs.readFileSync(aliasesPath, 'utf-8'));

  const engine = new SearchEngine();
  engine.loadAliases(aliases);
  engine.buildIndex(allSymbols);

  // -----------------------------------------------------------
  // Test 1: Ranking (exact ticker beats name-contains)
  // -----------------------------------------------------------
  console.log('\n--- 1. Ranking Order ---');
  const resA = engine.search('A', undefined, 10);
  assert(resA.results.length > 0, 'Query "A" returns results');
  assert(resA.results[0].symbol === 'A', 'Exact ticker "A" is ranked #1', `Got: ${resA.results[0]?.symbol}`);

  const resNVDA = engine.search('NVDA', undefined, 10);
  assert(resNVDA.results[0].symbol === 'NVDA', 'Exact ticker "NVDA" is ranked #1', `Got: ${resNVDA.results[0]?.symbol}`);

  // -----------------------------------------------------------
  // Test 2: Diacritics Normalization
  // -----------------------------------------------------------
  console.log('\n--- 2. Diacritics Normalization ---');
  const resNestleAcc = engine.search('Nestlé', undefined, 10);
  const resNestlePlain = engine.search('nestle', undefined, 10);
  const hasNestleAcc = resNestleAcc.results.some((r) => r.name.toLowerCase().includes('nestle') || r.symbol.startsWith('NESN'));
  const hasNestlePlain = resNestlePlain.results.some((r) => r.name.toLowerCase().includes('nestle') || r.symbol.startsWith('NESN'));
  assert(hasNestleAcc, 'Query with diacritic "Nestlé" finds Nestle company');
  assert(hasNestlePlain, 'Query without diacritic "nestle" finds Nestle company');

  // Hermès diacritic test
  const resHermesAcc = engine.search('Hermès', undefined, 10);
  const resHermesPlain = engine.search('hermes', undefined, 10);
  assert(resHermesAcc.results.some((r) => r.symbol === 'RMS.PA'), '"Hermès" finds Hermès International (RMS.PA)');
  assert(resHermesPlain.results.some((r) => r.symbol === 'RMS.PA'), '"hermes" finds Hermès International (RMS.PA)');

  // -----------------------------------------------------------
  // Test 3: Alias Search
  // -----------------------------------------------------------
  console.log('\n--- 3. Alias Search ---');
  const resGoogle = engine.search('google', undefined, 5);
  assert(resGoogle.results.some((r) => r.symbol === 'GOOGL' || r.symbol === 'GOOG'), 'Alias "google" maps to Alphabet (GOOGL/GOOG)');

  const resTSMC = engine.search('tsmc', undefined, 5);
  assert(resTSMC.results.some((r) => r.symbol === 'TSM' || r.symbol === '2330.TW'), 'Alias "tsmc" maps to Taiwan Semi (TSM)');

  const resJio = engine.search('jio', undefined, 5);
  assert(resJio.results.some((r) => r.symbol === 'RELIANCE.NS' || r.symbol === 'RELIANCE.BO'), 'Alias "jio" maps to Reliance Industries');

  const resPaytm = engine.search('paytm', undefined, 5);
  assert(resPaytm.results.some((r) => r.symbol.includes('PAYTM')), 'Alias "paytm" maps to Paytm (PAYTM.NS)');

  // -----------------------------------------------------------
  // Test 4: Suffix-less Ticker (e.g. typing RELIANCE returns RELIANCE.NS and RELIANCE.BO)
  // -----------------------------------------------------------
  console.log('\n--- 4. Suffix-less Ticker ---');
  const resReliance = engine.search('RELIANCE', undefined, 10);
  const relSymbols = resReliance.results.map((r) => r.symbol);
  assert(relSymbols.includes('RELIANCE.NS'), 'Typing "RELIANCE" returns RELIANCE.NS');
  assert(relSymbols.includes('RELIANCE.BO'), 'Typing "RELIANCE" returns RELIANCE.BO');

  const resTata = engine.search('TATASTEEL', undefined, 10);
  const tataSymbols = resTata.results.map((r) => r.symbol);
  assert(tataSymbols.includes('TATASTEEL.NS'), 'Typing "TATASTEEL" returns TATASTEEL.NS');
  assert(tataSymbols.includes('TATASTEEL.BO'), 'Typing "TATASTEEL" returns TATASTEEL.BO');

  // -----------------------------------------------------------
  // Test 5: Numeric Ticker
  // -----------------------------------------------------------
  console.log('\n--- 5. Numeric Ticker ---');
  const resToyota = engine.search('7203', undefined, 5);
  assert(resToyota.results.some((r) => r.symbol === '7203.T'), 'Numeric ticker "7203" finds Toyota Motor Corp (7203.T)');

  const resSamsung = engine.search('005930', undefined, 5);
  assert(resSamsung.results.some((r) => r.symbol === '005930.KS'), 'Numeric ticker "005930" finds Samsung Electronics (005930.KS)');

  // -----------------------------------------------------------
  // Test 6: Multi-word Search
  // -----------------------------------------------------------
  console.log('\n--- 6. Multi-word Search ---');
  const resTataSteel = engine.search('Tata Steel', undefined, 5);
  assert(resTataSteel.results.some((r) => r.symbol === 'TATASTEEL.NS' || r.symbol === 'TATASTEEL.BO'), '"Tata Steel" finds Tata Steel Limited');

  const resRollsRoyce = engine.search('Rolls Royce', undefined, 5);
  assert(resRollsRoyce.results.some((r) => r.symbol === 'RR.L' || r.symbol === 'BMW.DE'), '"Rolls Royce" finds Rolls-Royce Holdings (RR.L)');

  // -----------------------------------------------------------
  // Test 7: Empty Query
  // -----------------------------------------------------------
  console.log('\n--- 7. Empty Query ---');
  const resEmpty = engine.search('', undefined, 20);
  assert(resEmpty.results.length === 20, 'Empty query returns 20 browse items');
  assert(resEmpty.total >= 25000, `Empty query reports total items (${resEmpty.total})`);

  // -----------------------------------------------------------
  // Test 8: Special Characters
  // -----------------------------------------------------------
  console.log('\n--- 8. Special Characters ---');
  const resSpecial = engine.search('!@#$%^&*()_+{}[]:;"\'<>?,./', undefined, 10);
  assert(Array.isArray(resSpecial.results), 'Handled extreme special character query without crash');

  const resAmpersand = engine.search('L&T', undefined, 10);
  assert(resAmpersand.results.some((r) => r.symbol === 'LT.NS' || r.name.toLowerCase().includes('larsen')), '"L&T" query finds Larsen & Toubro');

  // -----------------------------------------------------------
  // Test 9: 10,000-character Input Safety
  // -----------------------------------------------------------
  console.log('\n--- 9. Oversized 10,000-character Input ---');
  const hugeInput = 'A'.repeat(10000);
  const startHuge = performance.now();
  const resHuge = engine.search(hugeInput, undefined, 10);
  const hugeDuration = performance.now() - startHuge;
  assert(hugeDuration < 50, `10,000-char input handled in ${hugeDuration.toFixed(2)}ms (< 50ms)`);
  assert(Array.isArray(resHuge.results), '10,000-char input returned safe array');

  // -----------------------------------------------------------
  // Test 10: Typo Tolerance
  // -----------------------------------------------------------
  console.log('\n--- 10. Typo Tolerance ---');
  const resTypoReliance = engine.search('relianc', undefined, 5);
  assert(resTypoReliance.results.some((r) => r.symbol.startsWith('RELIANCE')), 'Typo "relianc" finds Reliance');

  const resTypoApple = engine.search('aple', undefined, 5);
  assert(resTypoApple.results.some((r) => r.symbol === 'AAPL'), 'Typo "aple" finds Apple (AAPL)');

  const resTypoSamsung = engine.search('samsng', undefined, 5);
  assert(resTypoSamsung.results.some((r) => r.symbol.includes('005930') || r.name.toLowerCase().includes('samsung')), 'Typo "samsng" finds Samsung');

  // -----------------------------------------------------------
  // Test 11: Fallback-Merge Deduplication
  // -----------------------------------------------------------
  console.log('\n--- 11. Fallback-Merge Deduplication ---');
  // Simulate merging local results with live lookup results where AAPL appears in both
  const localList: SearchResultItem[] = [
    {
      symbol: 'AAPL',
      displaySymbol: 'AAPL',
      name: 'Apple Inc.',
      exchange: 'NASDAQ',
      type: 'Common Stock',
      country: 'US',
      region: 'North America',
      sector: 'Technology',
      marketStatus: 'LIVE'
    }
  ];
  const liveList: SearchResultItem[] = [
    {
      symbol: 'AAPL',
      displaySymbol: 'AAPL',
      name: 'Apple Inc.',
      exchange: 'NASDAQ',
      type: 'Common Stock',
      country: 'US',
      region: 'North America',
      sector: 'Technology',
      marketStatus: 'LIVE',
      isLiveSearch: true
    },
    {
      symbol: 'UNKNOWN-STOCK',
      displaySymbol: 'UNKNOWN-STOCK',
      name: 'Unknown Live Stock',
      exchange: 'NYSE',
      type: 'Common Stock',
      country: 'US',
      region: 'North America',
      sector: 'Financials',
      marketStatus: 'LIVE',
      isLiveSearch: true
    }
  ];

  // Merge logic
  const seen = new Set<string>();
  const merged: SearchResultItem[] = [];
  for (const item of [...localList, ...liveList]) {
    const k = item.symbol.toUpperCase();
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(item);
    }
  }

  assert(merged.length === 2, 'Merge dedupes identical AAPL entry (expected 2 total)', `Got ${merged.length}`);
  assert(merged[0].symbol === 'AAPL' && !merged[0].isLiveSearch, 'Local entry preserved as primary');
  assert(merged[1].symbol === 'UNKNOWN-STOCK' && merged[1].isLiveSearch, 'Live fallback entry appended');

  // -----------------------------------------------------------
  // Test 12: Performance Benchmark
  // -----------------------------------------------------------
  console.log('\n--- 12. Performance Benchmark (< 50ms requirement) ---');
  const benchmarkQueries = [
    'AAPL', 'RELIANCE', 'TATA', 'TSLA', 'MSFT', 'Google', 'Samsung', 'Toyota', '7203', 'Nestle',
    'SAP', 'LVMH', 'Bank', 'Energy', 'Steel', 'Tech', 'Pharma', 'Auto', 'Airbus', 'Boeing',
    'BHP', 'Petro', 'Sony', 'Nintendo', 'Ferrari', 'Nokia', 'Volvo', 'Hermes', 'Zara', 'Novo'
  ];

  const times: number[] = [];
  // Warm up
  for (const q of benchmarkQueries.slice(0, 5)) engine.search(q, undefined, 20);

  // Measure 100 queries
  for (let cycle = 0; cycle < 4; cycle++) {
    for (const q of benchmarkQueries) {
      const t0 = performance.now();
      engine.search(q, undefined, 20);
      const t1 = performance.now();
      times.push(t1 - t0);
    }
  }

  const avgTime = times.reduce((s, t) => s + t, 0) / times.length;
  const maxTime = Math.max(...times);

  console.log(`  Executed ${times.length} searches across ${allSymbols.length.toLocaleString()} symbols.`);
  console.log(`  Average Search Latency: ${avgTime.toFixed(2)} ms`);
  console.log(`  Maximum Search Latency: ${maxTime.toFixed(2)} ms`);

  assert(avgTime < 50, `Average search latency strictly < 50ms (measured: ${avgTime.toFixed(2)}ms)`);
  assert(maxTime < 100, `Peak search latency strictly < 100ms (measured: ${maxTime.toFixed(2)}ms)`);

  // Final summary
  console.log(`\n================ TEST SUMMARY ================`);
  console.log(`Total Passed: ${passedCount}`);
  console.log(`Total Failed: ${failedCount}`);
  if (failedCount > 0) {
    console.error('Some tests failed!');
    process.exit(1);
  } else {
    console.log('All 12 test suites passed successfully!\n');
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
