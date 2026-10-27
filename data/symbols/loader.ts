/**
 * data/symbols/loader.ts
 *
 * Efficient loader module for sharded market symbols.
 * Prevents client bundle bloat by only loading server-side or on demand.
 */
import fs from 'fs';
import path from 'path';

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

const SYMBOLS_DIR = path.join(process.cwd(), 'data', 'symbols');

let memoryUniverse: MarketSymbolEntry[] | null = null;
let lastLoaded = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function safeLoadJson<T>(filePath: string): T | null {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch (err) {
    console.error(`[Symbols Loader] Error reading ${filePath}:`, err);
  }
  return null;
}

export function loadShard(shardName: 'us' | 'india-nse' | 'india-bse' | 'international'): MarketSymbolEntry[] {
  const filePath = path.join(SYMBOLS_DIR, `${shardName}.json`);
  return safeLoadJson<MarketSymbolEntry[]>(filePath) || [];
}

export function loadManifest(): any {
  return safeLoadJson(path.join(SYMBOLS_DIR, 'manifest.json'));
}

export function loadAllSymbols(forceReload = false): MarketSymbolEntry[] {
  if (memoryUniverse && !forceReload && Date.now() - lastLoaded < CACHE_TTL) {
    return memoryUniverse;
  }

  // Load each shard
  const us = loadShard('us');
  const nse = loadShard('india-nse');
  const bse = loadShard('india-bse');
  const intl = loadShard('international');

  const map = new Map<string, MarketSymbolEntry>();

  for (const item of intl) map.set(item.symbol.toUpperCase(), item);
  for (const item of bse) map.set(item.symbol.toUpperCase(), item);
  for (const item of nse) map.set(item.symbol.toUpperCase(), item);
  for (const item of us) map.set(item.symbol.toUpperCase(), item);

  // Also include any user-discovered runtime symbols if present
  const discoveredPath = path.join(process.cwd(), 'data', 'symbols-discovered.json');
  const discovered = safeLoadJson<MarketSymbolEntry[]>(discoveredPath);
  if (discovered && Array.isArray(discovered)) {
    for (const d of discovered) {
      if (d.symbol && !map.has(d.symbol.toUpperCase())) {
        map.set(d.symbol.toUpperCase(), d);
      }
    }
  }

  memoryUniverse = Array.from(map.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  lastLoaded = Date.now();
  return memoryUniverse;
}

export function clearSymbolMemoryCache(): void {
  memoryUniverse = null;
  lastLoaded = 0;
}
