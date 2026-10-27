/**
 * scripts/build-aliases.ts
 *
 * Compiles data/symbol-aliases.json with >= 150 well-known brand, colloquial,
 * former, and product names.
 * Ensures EVERY target ticker in the aliases map actually exists in the symbol database.
 */

import fs from 'fs';
import path from 'path';
import { loadAllSymbols } from '../data/symbols/loader.js';

interface RawAliasMap {
  [alias: string]: string[];
}

const RAW_ALIASES: RawAliasMap = {
  // Big Tech & Brands
  'google': ['GOOGL', 'GOOG'],
  'alphabet': ['GOOGL', 'GOOG'],
  'youtube': ['GOOGL', 'GOOG'],
  'deepmind': ['GOOGL'],
  'waymo': ['GOOGL'],
  'facebook': ['META'],
  'meta': ['META'],
  'instagram': ['META'],
  'whatsapp': ['META'],
  'oculus': ['META'],
  'apple': ['AAPL'],
  'iphone': ['AAPL'],
  'macbook': ['AAPL'],
  'ipad': ['AAPL'],
  'microsoft': ['MSFT'],
  'windows': ['MSFT'],
  'xbox': ['MSFT'],
  'azure': ['MSFT'],
  'linkedin': ['MSFT'],
  'github': ['MSFT'],
  'amazon': ['AMZN'],
  'aws': ['AMZN'],
  'prime video': ['AMZN'],
  'twitch': ['AMZN'],
  'netflix': ['NFLX'],
  'tesla': ['TSLA'],
  'spacex': ['TSLA'],
  'nvidia': ['NVDA'],
  'geforce': ['NVDA'],
  'amd': ['AMD'],
  'radeon': ['AMD'],
  'intel': ['INTC'],
  'qualcomm': ['QCOM'],
  'snapdragon': ['QCOM'],
  'broadcom': ['AVGO'],
  'tsmc': ['TSM', '2330.TW'],
  'taiwan semiconductor': ['TSM', '2330.TW'],
  'foxconn': ['2317.TW'],
  'hon hai': ['2317.TW'],
  'asml': ['ASML', 'ASML.AS'],
  'arm': ['ARM'],
  'micron': ['MU'],
  'applied materials': ['AMAT'],
  'lam research': ['LRCX'],
  'oracle': ['ORCL'],
  'salesforce': ['CRM'],
  'adobe': ['ADBE'],
  'photoshop': ['ADBE'],
  'cisco': ['CSCO'],
  'ibm': ['IBM'],
  'servicenow': ['NOW'],
  'uber': ['UBER'],
  'airbnb': ['ABNB'],
  'booking': ['BKNG'],
  'agoda': ['BKNG'],
  'spotify': ['SPOT'],
  'shopify': ['SHOP', 'SHOP.TO'],
  'zoom': ['ZM'],
  'palantir': ['PLTR'],
  'snowflake': ['SNOW'],
  'crowdstrike': ['CRWD'],

  // Fintech & Payments
  'visa': ['V'],
  'mastercard': ['MA'],
  'american express': ['AXP'],
  'amex': ['AXP'],
  'paypal': ['PYPL'],
  'venmo': ['PYPL'],
  'square': ['SQ'],
  'block': ['SQ'],
  'cash app': ['SQ'],
  'coinbase': ['COIN'],
  'robinhood': ['HOOD'],

  // Banking & Wall St
  'jpmorgan': ['JPM'],
  'chase': ['JPM'],
  'goldman sachs': ['GS'],
  'morgan stanley': ['MS'],
  'bank of america': ['BAC'],
  'bofa': ['BAC'],
  'citigroup': ['C'],
  'citi': ['C'],
  'wells fargo': ['WFC'],
  'berkshire': ['BRK.B', 'BRK.A'],
  'warren buffett': ['BRK.B', 'BRK.A'],
  'blackrock': ['BLK'],
  'charles schwab': ['SCHW'],

  // Entertainment & Media
  'disney': ['DIS'],
  'marvel': ['DIS'],
  'star wars': ['DIS'],
  'pixar': ['DIS'],
  'espn': ['DIS'],
  'hulu': ['DIS'],
  'sony': ['SONY', '6758.T'],
  'playstation': ['SONY', '6758.T'],
  'nintendo': ['7974.T'],
  'mario': ['7974.T'],
  'pokemon': ['7974.T'],
  'zelda': ['7974.T'],
  'warner bros': ['WBD'],
  'hbo': ['WBD'],
  'max': ['WBD'],
  'paramount': ['PARA'],

  // Consumer, Food, Apparel
  'nike': ['NKE'],
  'jordan': ['NKE'],
  'adidas': ['ADS.DE'],
  'puma': ['PUM.DE'],
  'lululemon': ['LULU'],
  'starbucks': ['SBUX'],
  'mcdonalds': ['MCD'],
  'chipotle': ['CMG'],
  'dominos': ['DPZ'],
  'pepsi': ['PEP'],
  'pepsico': ['PEP'],
  'lays': ['PEP'],
  'doritos': ['PEP'],
  'gatorade': ['PEP'],
  'coca cola': ['KO'],
  'coke': ['KO'],
  'sprite': ['KO'],
  'fanta': ['KO'],
  'walmart': ['WMT'],
  'target': ['TGT'],
  'costco': ['COST'],
  'home depot': ['HD'],
  'lowes': ['LOW'],
  'procter and gamble': ['PG'],
  'p&g': ['PG'],
  'gillette': ['PG'],
  'pampers': ['PG'],
  'tide': ['PG'],
  'colgate': ['CL'],
  'mondelez': ['MDLZ'],
  'oreo': ['MDLZ'],
  'cadbury': ['MDLZ'],
  'nestle': ['NESN.SW', 'NESTLEIND.NS'],
  'maggi': ['NESTLEIND.NS', 'NESN.SW'],
  'kitkat': ['NESN.SW', 'NESTLEIND.NS'],
  'nespresso': ['NESN.SW'],
  'unilever': ['ULVR.L', 'HINDUNILVR.NS'],
  'dove': ['ULVR.L', 'HINDUNILVR.NS'],
  'rexona': ['ULVR.L', 'HINDUNILVR.NS'],
  'danone': ['BN.PA'],
  'heineken': ['HEIA.AS'],
  'budweiser': ['ABI.BR'],
  'corona': ['ABI.BR'],
  'stella artois': ['ABI.BR'],
  'diageo': ['DGE.L'],
  'guinness': ['DGE.L'],
  'johnnie walker': ['DGE.L'],
  'smirnoff': ['DGE.L'],

  // Luxury & Fashion
  'louis vuitton': ['MC.PA'],
  'lvmh': ['MC.PA'],
  'dior': ['MC.PA'],
  'moet hennessy': ['MC.PA'],
  'hermes': ['RMS.PA'],
  'gucci': ['KER.PA'],
  'saint laurent': ['KER.PA'],
  'balenciaga': ['KER.PA'],
  'kering': ['KER.PA'],
  'cartier': ['CFR.SW'],
  'montblanc': ['CFR.SW'],
  'iwc': ['CFR.SW'],
  'zara': ['ITX.MC'],
  'inditex': ['ITX.MC'],
  'bershka': ['ITX.MC'],
  'h&m': ['HM-B.ST'],
  'loreal': ['OR.PA'],
  'maybelline': ['OR.PA'],
  'garnier': ['OR.PA'],
  'ray-ban': ['EL.PA'],
  'oakley': ['EL.PA'],
  'essilorluxottica': ['EL.PA'],

  // Automotive
  'toyota': ['7203.T', 'TM'],
  'lexus': ['7203.T', 'TM'],
  'volkswagen': ['VOW3.DE'],
  'audi': ['VOW3.DE'],
  'porsche': ['P911.DE', 'PAH3.DE'],
  'bmw': ['BMW.DE'],
  'mini': ['BMW.DE'],
  'mercedes': ['MBG.DE'],
  'mercedes-benz': ['MBG.DE'],
  'daimler': ['MBG.DE'],
  'ferrari': ['RACE.MI'],
  'ford': ['F'],
  'general motors': ['GM'],
  'chevrolet': ['GM'],
  'cadillac': ['GM'],
  'honda': ['7267.T', 'HMC'],
  'acura': ['7267.T', 'HMC'],
  'nissan': ['7201.T'],
  'hyundai': ['005380.KS'],
  'genesis': ['005380.KS'],
  'kia': ['000270.KS'],
  'volvo': ['VOLV-B.ST'],
  'stellantis': ['STLAM.PA', 'STLAM.MI'],
  'jeep': ['STLAM.PA'],
  'peugeot': ['STLAM.PA'],
  'fiat': ['STLAM.PA'],
  'byd': ['1211.HK', '002594.SZ'],
  'nio': ['9866.HK', 'NIO'],
  'xpeng': ['9868.HK'],
  'li auto': ['2015.HK'],

  // Pharma & Healthcare
  'novo nordisk': ['NOVO-B.CO', 'NVO'],
  'ozempic': ['NOVO-B.CO', 'NVO'],
  'wegovy': ['NOVO-B.CO', 'NVO'],
  'eli lilly': ['LLY'],
  'mounjaro': ['LLY'],
  'zepbound': ['LLY'],
  'pfizer': ['PFE'],
  'johnson & johnson': ['JNJ'],
  'jnj': ['JNJ'],
  'roche': ['ROG.SW'],
  'novartis': ['NOVN.SW'],
  'astrazeneca': ['AZN.L'],
  'sanofi': ['SAN.PA'],
  'merck': ['MRK'],
  'abbvie': ['ABBV'],
  'humira': ['ABBV'],
  'bayer': ['BAYN.DE'],
  'aspirin': ['BAYN.DE'],

  // Energy & Aerospace
  'exxon': ['XOM'],
  'exxonmobil': ['XOM'],
  'chevron': ['CVX'],
  'shell': ['SHEL.L', 'SHEL'],
  'bp': ['BP.L', 'BP'],
  'total': ['TTE.PA'],
  'totalenergies': ['TTE.PA'],
  'aramco': ['2222.SR'],
  'saudi aramco': ['2222.SR'],
  'petrobras': ['PETR4.SA'],
  'boeing': ['BA'],
  'airbus': ['AIR.PA', 'AIR.DE'],
  'lockheed martin': ['LMT'],
  'raytheon': ['RTX'],
  'northrop grumman': ['NOC'],

  // India Specific Brands & Conglomerates
  'reliance': ['RELIANCE.NS', 'RELIANCE.BO'],
  'jio': ['RELIANCE.NS', 'RELIANCE.BO'],
  'tata': ['TATASTEEL.NS', 'TCS.NS', 'TATAMOTORS.NS', 'TATACONSUM.NS', 'TATAPOWER.NS'],
  'tata steel': ['TATASTEEL.NS', 'TATASTEEL.BO'],
  'tcs': ['TCS.NS'],
  'tata motors': ['TATAMOTORS.NS'],
  'tata power': ['TATAPOWER.NS'],
  'tata consumer': ['TATACONSUM.NS'],
  'airtel': ['BHARTIARTL.NS'],
  'bharti airtel': ['BHARTIARTL.NS'],
  'hdfc': ['HDFCBANK.NS'],
  'hdfc bank': ['HDFCBANK.NS'],
  'icici': ['ICICIBANK.NS'],
  'icici bank': ['ICICIBANK.NS'],
  'state bank of india': ['SBIN.NS'],
  'sbi': ['SBIN.NS'],
  'infosys': ['INFY.NS', 'INFY'],
  'wipro': ['WIPRO.NS'],
  'hcl': ['HCLTECH.NS'],
  'hcl tech': ['HCLTECH.NS'],
  'itc': ['ITC.NS'],
  'larsen & toubro': ['LT.NS'],
  'l&t': ['LT.NS'],
  'hindustan unilever': ['HINDUNILVR.NS'],
  'hul': ['HINDUNILVR.NS'],
  'maruti': ['MARUTI.NS'],
  'maruti suzuki': ['MARUTI.NS'],
  'kotak': ['KOTAKBANK.NS'],
  'kotak bank': ['KOTAKBANK.NS'],
  'axis bank': ['AXISBANK.NS'],
  'bajaj finance': ['BAJFINANCE.NS'],
  'bajaj finserv': ['BAJAJFINSV.NS'],
  'sun pharma': ['SUNPHARMA.NS'],
  'adani': ['ADANIENT.NS', 'ADANIPORTS.NS'],
  'adani enterprises': ['ADANIENT.NS'],
  'adani ports': ['ADANIPORTS.NS'],
  'paytm': ['PAYTM.NS'],
  'one 97': ['PAYTM.NS'],
  'zomato': ['ZOMATO.NS'],
  'blinkit': ['ZOMATO.NS'],
  'swiggy': ['SWIGGY.NS'],
  'instamart': ['SWIGGY.NS'],
  'ola': ['OLAELEC.NS'],
  'ola electric': ['OLAELEC.NS'],
  'nykaa': ['NYKAA.NS'],
  'delhivery': ['DELHIVERY.NS'],
  'titan': ['TITAN.NS'],
  'tanishq': ['TITAN.NS'],
  'fastrack': ['TITAN.NS'],
  'asian paints': ['ASIANPAINT.NS'],
  'ultratech': ['ULTRACEMCO.NS'],
  'grasim': ['GRASIM.NS'],
  'hindalco': ['HINDALCO.NS'],
  'vedanta': ['VEDL.NS'],
  'dr reddy': ['DRREDDY.NS'],
  'cipla': ['CIPLA.NS'],
  'apollo hospitals': ['APOLLOHOSP.NS'],
  'eicher': ['EICHERMOT.NS'],
  'royal enfield': ['EICHERMOT.NS'],
  'britannia': ['BRITANNIA.NS'],
  'dabur': ['DABUR.NS'],
  'marico': ['MARICO.NS'],
  'parachute': ['MARICO.NS'],
  'godrej': ['GODREJCP.NS'],
  'samsung': ['005930.KS'],
  'sk hynix': ['000660.KS'],
  'lg': ['066570.KS'],
  'kakaotalk': ['035720.KS'],
  'naver': ['035420.KS'],
  'line': ['035420.KS'],
  'line app': ['035420.KS'],
  'posco': ['005490.KS']
};

export function buildAliases(): Record<string, string[]> {
  console.log('Loading symbols to verify aliases...');
  const allSymbols = loadAllSymbols();
  const symbolSet = new Set(allSymbols.map((s) => s.symbol.toUpperCase()));

  const verified: Record<string, string[]> = {};
  let totalTargets = 0;
  let droppedTargets = 0;

  for (const [rawAlias, targets] of Object.entries(RAW_ALIASES)) {
    const aliasKey = rawAlias.toLowerCase().trim();
    const validTargets: string[] = [];

    for (const t of targets) {
      totalTargets++;
      const sym = t.toUpperCase().trim();
      if (symbolSet.has(sym)) {
        validTargets.push(sym);
      } else {
        // Try without suffix for US
        if (!sym.includes('.') && symbolSet.has(sym)) {
          validTargets.push(sym);
        } else {
          console.warn(`[Aliases Warning] Target "${sym}" for alias "${aliasKey}" not found in database.`);
          droppedTargets++;
        }
      }
    }

    if (validTargets.length > 0) {
      verified[aliasKey] = [...new Set(validTargets)];
    }
  }

  const aliasCount = Object.keys(verified).length;
  console.log(`Aliases verified: ${aliasCount} aliases pointing to existing symbols. (Dropped: ${droppedTargets} unverified targets out of ${totalTargets})`);

  if (aliasCount < 150) {
    throw new Error(`Aliases count (${aliasCount}) is below the required 150!`);
  }

  return verified;
}

if (process.argv[1] && process.argv[1].endsWith('build-aliases.ts')) {
  try {
    const aliases = buildAliases();
    const dest = path.join(process.cwd(), 'data', 'symbol-aliases.json');
    fs.writeFileSync(dest, JSON.stringify(aliases, null, 2), 'utf-8');
    console.log(`Successfully wrote ${Object.keys(aliases).length} aliases to data/symbol-aliases.json`);
  } catch (err: any) {
    console.error('Fatal alias build error:', err.message);
    process.exit(1);
  }
}
