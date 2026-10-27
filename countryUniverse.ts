import fs from 'fs';
import path from 'path';
import worldCountries, { type Country as WorldCountry } from 'world-countries';

export interface CountryBaseEntry {
  id: string;
  name: string;
  officialName: string;
  isoCode: string;
  cca3: string;
  flag: string;
  region: string;
  subregion: string;
  capital: string;
  demonym: string;
  coordinates: [number, number]; // [lng, lat]
  keywords: string[];
  isCurated?: boolean;
  isHotspot?: boolean;
  parentCountryId?: string;
}

interface RawOverrideEntry {
  id: string;
  name: string;
  isoCode: string;
  flag?: string;
  region?: string;
  keywords?: string[];
}

/**
 * Compute regional indicator flag emoji dynamically from a 2-letter ISO 3166-1 alpha-2 code.
 */
export function isoToFlagEmoji(isoCode: string): string {
  const clean = (isoCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(clean)) return '🌐';
  return String.fromCodePoint(
    0x1f1e6 + (clean.charCodeAt(0) - 65),
    0x1f1e6 + (clean.charCodeAt(1) - 65)
  );
}

/**
 * Map world-countries region & subregion to the app's region naming convention.
 */
export function mapDatasetRegion(region: string, subregion: string, isoCode: string): string {
  const iso = (isoCode || '').toUpperCase();
  const sub = (subregion || '').trim();
  const reg = (region || '').trim();

  // Middle East overrides for countries grouped under Southern/Western Asia or North Africa
  if (iso === 'IR') return 'Middle East';
  if (sub === 'Western Asia') return 'Middle East';

  if (sub === 'Eastern Asia') return 'East Asia';
  if (sub === 'South-Eastern Asia') return 'Southeast Asia';
  if (sub === 'Southern Asia') return 'South Asia';
  if (sub === 'Central Asia') return 'Central Asia';

  if (sub === 'Western Europe') return 'Western Europe';
  if (sub === 'Northern Europe') {
    if (iso === 'GB' || iso === 'IE') return 'Western Europe';
    return 'Northern Europe';
  }
  if (sub === 'Southern Europe') return 'Southern Europe';
  if (sub === 'Eastern Europe' || sub === 'Central Europe' || sub === 'Southeast Europe') {
    return 'Eastern Europe';
  }

  if (sub === 'North America' || sub === 'Northern America') return 'North America';
  if (sub === 'Central America' || sub === 'Caribbean') return 'Central America & Caribbean';
  if (sub === 'South America') return 'South America';

  if (sub === 'Northern Africa') return 'North Africa';
  if (reg === 'Africa') return 'Sub-Saharan Africa';

  if (reg === 'Oceania') return 'Oceania';
  if (reg === 'Europe') return 'Western Europe';
  if (reg === 'Asia') return 'East Asia';
  if (reg === 'Americas') return 'South America';
  if (reg === 'Antarctic') return 'Antarctic';

  return 'Global';
}

const SAFE_SHORT_ALIASES: Record<string, string[]> = {
  US: ['u.s.', 'u.s.a.', 'usa', 'united states of america', 'america', 'american', 'washington dc'],
  GB: ['uk', 'u.k.', 'britain', 'great britain', 'england', 'united kingdom', 'british', 'scottish', 'welsh'],
  AE: ['uae', 'u.a.e.', 'emirates', 'dubai', 'abu dhabi'],
  KR: ['south korea', 'rok', 'seoul', 'korean'],
  KP: ['north korea', 'dprk', 'pyongyang'],
  TW: ['taiwan', 'roc', 'taipei', 'taiwanese', 'formosa'],
  CN: ['china', 'prc', 'beijing', 'shanghai', 'chinese'],
  HK: ['hong kong', 'hkex'],
  RU: ['russia', 'russian federation', 'moscow', 'russian'],
  CD: ['drc', 'dr congo', 'democratic republic of the congo', 'kinshasa'],
  CG: ['republic of the congo', 'congo-brazzaville', 'brazzaville'],
  CZ: ['czechia', 'czech republic', 'prague', 'czech'],
  TR: ['turkey', 'turkiye', 'türkiye', 'ankara', 'istanbul', 'turkish'],
  VN: ['vietnam', 'viet nam', 'hanoi', 'ho chi minh', 'vietnamese'],
  NL: ['netherlands', 'holland', 'amsterdam', 'dutch'],
  CH: ['switzerland', 'swiss', 'zurich', 'bern', 'geneva'],
  SA: ['saudi arabia', 'saudi', 'ksa', 'riyadh'],
  ZA: ['south africa', 'johannesburg', 'pretoria', 'cape town', 'south african'],
  BR: ['brazil', 'brasil', 'brasilia', 'sao paulo', 'brazilian'],
  NG: ['nigeria', 'abuja', 'lagos', 'nigerian'],
  IN: ['india', 'new delhi', 'delhi', 'mumbai', 'bengaluru', 'indian']
};

// Common English words that happen to be 2-3 letter altSpellings and must not be used as bare keywords
const AMBIGUOUS_SHORT_WORDS = new Set([
  'in', 'it', 'is', 'at', 'as', 'be', 'by', 'do', 'go', 'id', 'la', 'ma', 'me',
  'my', 'no', 'om', 'or', 'pa', 'pe', 'pl', 'so', 'to', 'us', 'am', 'an', 'on',
  'au', 'br', 'ca', 'ch', 'cn', 'co', 'cu', 'de', 'dk', 'eg', 'es', 'ET', 'et',
  'fi', 'fr', 'ge', 'gr', 'hk', 'hr', 'hu', 'ie', 'il', 'iq', 'ir', 'jp', 'ke',
  'kr', 'kw', 'kz', 'lb', 'lk', 'lt', 'lu', 'lv', 'ly', 'ma', 'md', 'mm', 'mn',
  'mx', 'my', 'ng', 'nl', 'no', 'np', 'nz', 'om', 'pa', 'pe', 'ph', 'pk', 'pl',
  'pr', 'pt', 'py', 'qa', 'ro', 'rs', 'ru', 'sa', 'sd', 'se', 'sg', 'si', 'sk',
  'sy', 'th', 'tn', 'tr', 'tw', 'tz', 'ua', 'ug', 'uy', 'uz', 've', 'vn', 'ye',
  'za', 'zm', 'zw', 'And', 'and', 'The', 'the', 'can', 'man', 'are', 'per', 'col'
]);

function normalizeKeyword(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function generateKeywordsForCountry(entry: WorldCountry): string[] {
  const iso = (entry.cca2 || '').toUpperCase();
  const set = new Set<string>();

  const add = (val?: string) => {
    if (!val) return;
    const rawLower = val.toLowerCase().trim();
    const asciiLower = normalizeKeyword(val);
    for (const candidate of [rawLower, asciiLower]) {
      if (!candidate) continue;
      if (candidate.length <= 2 && candidate !== 'uk') continue;
      if (candidate.length === 3 && AMBIGUOUS_SHORT_WORDS.has(candidate)) continue;
      if (/^[a-z]{2,3}$/.test(candidate) && candidate === entry.cca2?.toLowerCase()) continue;
      if (/^[a-z]{2,3}$/.test(candidate) && candidate === entry.cca3?.toLowerCase()) continue;
      set.add(candidate);
    }
  };

  add(entry.name?.common);
  add(entry.name?.official);

  if (Array.isArray(entry.capital)) {
    for (const cap of entry.capital) {
      if (cap && cap.length >= 4) add(cap);
    }
  }

  const demonymM = entry.demonyms?.eng?.m;
  const demonymF = entry.demonyms?.eng?.f;
  if (demonymM && demonymM.length >= 4) add(demonymM);
  if (demonymF && demonymF.length >= 4) add(demonymF);

  if (Array.isArray(entry.altSpellings)) {
    for (const alt of entry.altSpellings) {
      if (!alt) continue;
      // Only include multi-word alt spellings or full names (>= 4 chars, not bare ISO codes)
      if (alt.length >= 4 && alt.toUpperCase() !== iso && alt.toUpperCase() !== entry.cca3) {
        add(alt);
      }
    }
  }

  const extraAliases = SAFE_SHORT_ALIASES[iso] || [];
  for (const alias of extraAliases) {
    set.add(alias.toLowerCase());
  }

  return Array.from(set);
}

function loadCuratedOverrides(): RawOverrideEntry[] {
  try {
    const p = path.join(process.cwd(), 'data', 'countries-base.json');
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as RawOverrideEntry[];
    }
  } catch {
    /* ignore */
  }
  return [];
}

let cachedUniverse: CountryBaseEntry[] | null = null;
let cachedByIso: Map<string, CountryBaseEntry> | null = null;
let cachedById: Map<string, CountryBaseEntry> | null = null;

/**
 * Builds the complete universe of all ~250 ISO 3166-1 alpha-2 countries & territories
 * merged with the curated overrides from `data/countries-base.json`.
 *
 * - Keeps plain countries (e.g. "Oman", id: "cnt-om") intact
 * - Preserves geopolitical hotspots (e.g. "Oman / Strait of Hormuz", id: "cnt-om-hormuz")
 *   as layered hotspot entries without breaking the plain country entry
 * - Curated keywords ("tsmc", "strait", "hormuz", "tanker", etc.) are merged on top
 *   of generated keywords and never lost.
 */
export function getAllCountriesUniverse(): CountryBaseEntry[] {
  if (cachedUniverse) return cachedUniverse;

  const byIso = new Map<string, CountryBaseEntry>();
  const byId = new Map<string, CountryBaseEntry>();
  const list: CountryBaseEntry[] = [];

  for (const wc of worldCountries) {
    const isoCode = (wc.cca2 || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(isoCode)) continue;

    const id = `cnt-${isoCode.toLowerCase()}`;
    const name = wc.name?.common || isoCode;
    const officialName = wc.name?.official || name;
    const flag = isoToFlagEmoji(isoCode);
    const region = mapDatasetRegion(wc.region || '', wc.subregion || '', isoCode);
    const subregion = wc.subregion || wc.region || 'Global';
    const capital = wc.capital?.[0] || '';
    const demonym = wc.demonyms?.eng?.m || '';
    const coordinates: [number, number] =
      Array.isArray(wc.latlng) && wc.latlng.length === 2
        ? [Number(wc.latlng[1]) || 0, Number(wc.latlng[0]) || 0]
        : [0, 0];
    const keywords = generateKeywordsForCountry(wc);

    const entry: CountryBaseEntry = {
      id,
      name,
      officialName,
      isoCode,
      cca3: (wc.cca3 || '').toUpperCase(),
      flag,
      region,
      subregion,
      capital,
      demonym,
      coordinates,
      keywords,
      isCurated: false,
      isHotspot: false
    };

    byIso.set(isoCode, entry);
    byId.set(id, entry);
    list.push(entry);
  }

  // Merge curated overrides from data/countries-base.json
  const overrides = loadCuratedOverrides();
  for (const ov of overrides) {
    const isoCode = (ov.isoCode || '').trim().toUpperCase();
    const existing = byIso.get(isoCode) || byId.get(ov.id);
    const curatedKeywords = (ov.keywords || []).map((k) => k.toLowerCase());

    const isHotspotEntry =
      ov.name.includes('/') ||
      (existing &&
        ov.name.toLowerCase() !== existing.name.toLowerCase() &&
        /strait|canal|sea|gulf|chokepoint|corridor/i.test(ov.name));

    if (existing && isHotspotEntry) {
      // 1. Keep plain country ("Oman", id: "cnt-om") intact and enrich its region & keywords
      if (ov.region) existing.region = ov.region;
      existing.keywords = Array.from(new Set([...curatedKeywords, ...existing.keywords]));
      existing.isCurated = true;

      // 2. Also layer the geopolitical hotspot entry (e.g., "Oman / Strait of Hormuz")
      const hotspotId = `${existing.id}-hormuz`;
      const hotspotEntry: CountryBaseEntry = {
        ...existing,
        id: hotspotId,
        name: ov.name,
        flag: isoToFlagEmoji(isoCode),
        region: ov.region || existing.region,
        keywords: Array.from(new Set([...curatedKeywords, ...existing.keywords])),
        isCurated: true,
        isHotspot: true,
        parentCountryId: existing.id
      };
      byId.set(hotspotId, hotspotEntry);
      list.push(hotspotEntry);
    } else if (existing) {
      // Standard curated country override: overrides win on conflict, keywords merge
      existing.id = ov.id || existing.id;
      existing.name = ov.name || existing.name;
      existing.flag = isoToFlagEmoji(isoCode);
      if (ov.region) existing.region = ov.region;
      existing.keywords = Array.from(new Set([...curatedKeywords, ...existing.keywords]));
      existing.isCurated = true;
      byId.set(existing.id, existing);
    } else if (isoCode) {
      const fallbackEntry: CountryBaseEntry = {
        id: ov.id || `cnt-${isoCode.toLowerCase()}`,
        name: ov.name,
        officialName: ov.name,
        isoCode,
        cca3: isoCode,
        flag: isoToFlagEmoji(isoCode),
        region: ov.region || 'Global',
        subregion: ov.region || 'Global',
        capital: '',
        demonym: '',
        coordinates: [0, 0],
        keywords: curatedKeywords,
        isCurated: true,
        isHotspot: isHotspotEntry
      };
      byIso.set(isoCode, fallbackEntry);
      byId.set(fallbackEntry.id, fallbackEntry);
      list.push(fallbackEntry);
    }
  }

  list.sort((a, b) => a.name.localeCompare(b.name));
  cachedUniverse = list;
  cachedByIso = byIso;
  cachedById = byId;
  return list;
}

/**
 * Check if a text matches a country keyword with safe word-boundary awareness
 * so short names like "oman", "iran", "mali", "niger", "peru", "chad" do not
 * false-positive inside unrelated words (e.g. "woman", "romania", "nigeria", "performance").
 */
const keywordRegexCache = new Map<string, RegExp>();

export function matchesCountryKeyword(textLower: string, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  if (!kw) return false;
  if (!textLower.includes(kw.trim())) return false;

  // Preserve trailing space semantics if curated keyword had one (e.g. "fed ")
  if (kw.endsWith(' ')) {
    return textLower.includes(kw);
  }

  let regex = keywordRegexCache.get(kw);
  if (!regex) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match on non-letter boundaries so "u.s.", "taiwan", "oman", "tsmc" match whole tokens
    regex = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i');
    keywordRegexCache.set(kw, regex);
  }
  return regex.test(textLower);
}

/**
 * Exchange suffix / code to ISO 3166-1 alpha-2 country code mapping for global stocks.
 */
const EXCHANGE_TO_ISO: Record<string, string> = {
  // Suffixes
  NS: 'IN',
  BO: 'IN',
  NSE: 'IN',
  BSE: 'IN',
  NSI: 'IN',
  BOM: 'IN',
  L: 'GB',
  LSE: 'GB',
  LON: 'GB',
  IL: 'GB',
  TO: 'CA',
  V: 'CA',
  CN: 'CA',
  NE: 'CA',
  TSX: 'CA',
  TOR: 'CA',
  VAN: 'CA',
  HK: 'HK',
  HKG: 'HK',
  HKEX: 'HK',
  T: 'JP',
  TSE: 'JP',
  TYO: 'JP',
  JPX: 'JP',
  F: 'DE',
  DE: 'DE',
  BE: 'DE',
  MU: 'DE',
  DU: 'DE',
  HM: 'DE',
  HA: 'DE',
  XETRA: 'DE',
  GER: 'DE',
  FRA: 'DE',
  PA: 'FR',
  PAR: 'FR',
  EPA: 'FR',
  AS: 'NL',
  AMS: 'NL',
  BR: 'BE',
  BRU: 'BE',
  LS: 'PT',
  LIS: 'PT',
  MC: 'ES',
  BME: 'ES',
  MAD: 'ES',
  MI: 'IT',
  MIL: 'IT',
  SW: 'CH',
  VX: 'CH',
  EBS: 'CH',
  SIX: 'CH',
  VI: 'AT',
  VIE: 'AT',
  ST: 'SE',
  STO: 'SE',
  OL: 'NO',
  OSL: 'NO',
  CO: 'DK',
  CPH: 'DK',
  HE: 'FI',
  HEL: 'FI',
  IR: 'IE',
  ISE: 'IE',
  WA: 'PL',
  WSE: 'PL',
  PR: 'CZ',
  BD: 'HU',
  AT: 'GR',
  IS: 'TR',
  IST: 'TR',
  ME: 'RU',
  MOEX: 'RU',
  KS: 'KR',
  KQ: 'KR',
  KRX: 'KR',
  KSC: 'KR',
  KOE: 'KR',
  TW: 'TW',
  TWO: 'TW',
  TWSE: 'TW',
  TAI: 'TW',
  TPEX: 'TW',
  SS: 'CN',
  SZ: 'CN',
  SSE: 'CN',
  SZSE: 'CN',
  SHH: 'CN',
  SHZ: 'CN',
  SI: 'SG',
  SGX: 'SG',
  SES: 'SG',
  KL: 'MY',
  KLS: 'MY',
  BK: 'TH',
  SET: 'TH',
  JK: 'ID',
  IDX: 'ID',
  JKT: 'ID',
  PS: 'PH',
  PSE: 'PH',
  VN: 'VN',
  HOSE: 'VN',
  AX: 'AU',
  ASX: 'AU',
  NZ: 'NZ',
  NZX: 'NZ',
  NZE: 'NZ',
  SA: 'BR',
  B3: 'BR',
  SAO: 'BR',
  MX: 'MX',
  BMV: 'MX',
  MEX: 'MX',
  BA: 'AR',
  BUE: 'AR',
  SN: 'CL',
  SGO: 'CL',
  CL: 'CO',
  LM: 'PE',
  JO: 'ZA',
  JSE: 'ZA',
  JNB: 'ZA',
  CA: 'EG',
  EGX: 'EG',
  LG: 'NG',
  NGX: 'NG',
  NR: 'KE',
  SR: 'SA',
  TADAWUL: 'SA',
  SAU: 'SA',
  QA: 'QA',
  DSM: 'QA',
  DU_AE: 'AE',
  AD: 'AE',
  DFM: 'AE',
  ADX: 'AE',
  KW: 'KW',
  TA: 'IL',
  TASE: 'IL',
  TLV: 'IL',
  // US Exchanges
  US: 'US',
  NYSE: 'US',
  NASDAQ: 'US',
  'NASDAQ/NYSE': 'US',
  NMS: 'US',
  NGM: 'US',
  NCM: 'US',
  NYQ: 'US',
  ASE: 'US',
  PCX: 'US',
  BTS: 'US',
  PNK: 'US',
  OTC: 'US'
};

/**
 * Resolve any country name, ISO-2, ISO-3, or exchange/ticker suffix to a canonical CountryBaseEntry.
 */
export function resolveCountryEntry(
  countryOrIso?: string,
  symbol?: string,
  exchange?: string
): CountryBaseEntry {
  getAllCountriesUniverse();

  // 1. Try explicit country name or ISO code
  if (countryOrIso && countryOrIso !== 'Unknown' && countryOrIso !== 'Global') {
    const raw = countryOrIso.trim();
    const upper = raw.toUpperCase();
    const lower = raw.toLowerCase();

    if (cachedByIso?.has(upper)) {
      return cachedByIso.get(upper)!;
    }
    if (cachedById?.has(lower)) {
      return cachedById.get(lower)!;
    }
    if (cachedById?.has(`cnt-${lower}`)) {
      return cachedById.get(`cnt-${lower}`)!;
    }

    // Match by cca3 or common/official name or alias
    for (const c of cachedUniverse || []) {
      if (c.isHotspot) continue;
      if (
        c.cca3 === upper ||
        c.name.toLowerCase() === lower ||
        c.officialName.toLowerCase() === lower
      ) {
        return c;
      }
    }

    for (const c of cachedUniverse || []) {
      if (c.isHotspot) continue;
      if (c.keywords.includes(lower)) {
        return c;
      }
    }
  }

  // 2. Try symbol suffix (e.g. TATASTEEL.NS -> IN, 005930.KS -> KR, NESN.SW -> CH)
  if (symbol && symbol.includes('.')) {
    const suffix = symbol.split('.').pop()?.toUpperCase() || '';
    const mappedIso = EXCHANGE_TO_ISO[suffix];
    if (mappedIso && cachedByIso?.has(mappedIso)) {
      return cachedByIso.get(mappedIso)!;
    }
  }

  // 3. Try exchange code (e.g. NSE, BSE, LSE, KRX, SIX, TSX, NYSE, NASDAQ)
  if (exchange) {
    const exUpper = exchange.trim().toUpperCase();
    const mappedIso = EXCHANGE_TO_ISO[exUpper];
    if (mappedIso && cachedByIso?.has(mappedIso)) {
      return cachedByIso.get(mappedIso)!;
    }
    if (exUpper.includes('NSE') || exUpper.includes('BSE') || exUpper.includes('INDIA')) {
      return cachedByIso?.get('IN')!;
    }
    if (exUpper.includes('LSE') || exUpper.includes('LONDON')) {
      return cachedByIso?.get('GB')!;
    }
    if (exUpper.includes('TOKYO') || exUpper.includes('TSE') || exUpper.includes('JPX')) {
      return cachedByIso?.get('JP')!;
    }
    if (exUpper.includes('KOREA') || exUpper.includes('KRX') || exUpper.includes('KOSPI')) {
      return cachedByIso?.get('KR')!;
    }
    if (exUpper.includes('SWISS') || exUpper.includes('SIX') || exUpper.includes('ZURICH')) {
      return cachedByIso?.get('CH')!;
    }
    if (exUpper.includes('TORONTO') || exUpper.includes('TSX')) {
      return cachedByIso?.get('CA')!;
    }
    if (exUpper.includes('FRANKFURT') || exUpper.includes('XETRA') || exUpper.includes('GER')) {
      return cachedByIso?.get('DE')!;
    }
    if (exUpper.includes('PARIS') || exUpper.includes('EURONEXT')) {
      return cachedByIso?.get('FR')!;
    }
    if (exUpper.includes('HONG KONG') || exUpper.includes('HKEX')) {
      return cachedByIso?.get('HK')!;
    }
    if (exUpper.includes('TAIWAN') || exUpper.includes('TWSE')) {
      return cachedByIso?.get('TW')!;
    }
    if (exUpper.includes('AUSTRALIA') || exUpper.includes('ASX')) {
      return cachedByIso?.get('AU')!;
    }
  }

  // Default fallback to United States for standard un-suffixed tickers
  return cachedByIso?.get('US') || cachedUniverse![0];
}
