/**
 * Bundled database of major global & US equities for instant offline autocomplete
 * and fallback symbol lookup (110+ companies across all primary sectors).
 */

export interface BundledStockItem {
  ticker: string;
  name: string;
  sector: string;
  exchange: string;
  country: string;
  region: string;
  defaultPrice: number;
  defaultRisk: number;
}

export const MAJOR_STOCKS_BUNDLE: BundledStockItem[] = [
  // Mega-cap Tech & Semiconductors
  { ticker: 'NVDA', name: 'NVIDIA Corporation', sector: 'Semiconductors', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 118.5, defaultRisk: 78 },
  { ticker: 'TSM', name: 'Taiwan Semiconductor Mfg.', sector: 'Semiconductors', exchange: 'NYSE', country: 'Taiwan', region: 'East Asia', defaultPrice: 142.0, defaultRisk: 88 },
  { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 210.3, defaultRisk: 64 },
  { ticker: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 425.0, defaultRisk: 48 },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 180.2, defaultRisk: 52 },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Cyclical', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 185.0, defaultRisk: 56 },
  { ticker: 'META', name: 'Meta Platforms Inc.', sector: 'Communication Services', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 495.0, defaultRisk: 62 },
  { ticker: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Cyclical', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 220.0, defaultRisk: 76 },
  { ticker: 'AMD', name: 'Advanced Micro Devices', sector: 'Semiconductors', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 155.0, defaultRisk: 72 },
  { ticker: 'INTC', name: 'Intel Corporation', sector: 'Semiconductors', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 32.5, defaultRisk: 68 },
  { ticker: 'ASML', name: 'ASML Holding N.V.', sector: 'Semiconductors', exchange: 'NASDAQ', country: 'Netherlands', region: 'Western Europe', defaultPrice: 910.0, defaultRisk: 74 },
  { ticker: 'AVGO', name: 'Broadcom Inc.', sector: 'Semiconductors', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 165.0, defaultRisk: 66 },
  { ticker: 'QCOM', name: 'Qualcomm Incorporated', sector: 'Semiconductors', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 170.0, defaultRisk: 65 },
  { ticker: 'ARM', name: 'Arm Holdings plc', sector: 'Semiconductors', exchange: 'NASDAQ', country: 'United Kingdom', region: 'Western Europe', defaultPrice: 140.0, defaultRisk: 75 },
  { ticker: 'MU', name: 'Micron Technology Inc.', sector: 'Semiconductors', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 110.0, defaultRisk: 70 },
  { ticker: 'TXN', name: 'Texas Instruments Inc.', sector: 'Semiconductors', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 195.0, defaultRisk: 52 },
  { ticker: 'AMAT', name: 'Applied Materials Inc.', sector: 'Semiconductors', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 205.0, defaultRisk: 68 },
  { ticker: 'LRCX', name: 'Lam Research Corp.', sector: 'Semiconductors', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 850.0, defaultRisk: 70 },
  { ticker: 'CRM', name: 'Salesforce Inc.', sector: 'Technology', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 260.0, defaultRisk: 50 },
  { ticker: 'ORCL', name: 'Oracle Corporation', sector: 'Technology', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 140.0, defaultRisk: 48 },
  { ticker: 'ADBE', name: 'Adobe Inc.', sector: 'Technology', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 530.0, defaultRisk: 54 },
  { ticker: 'CSCO', name: 'Cisco Systems Inc.', sector: 'Technology', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 49.5, defaultRisk: 40 },
  { ticker: 'IBM', name: 'International Business Machines', sector: 'Technology', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 190.0, defaultRisk: 42 },
  { ticker: 'NOW', name: 'ServiceNow Inc.', sector: 'Technology', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 810.0, defaultRisk: 52 },
  { ticker: 'SAP', name: 'SAP SE', sector: 'Technology', exchange: 'NYSE', country: 'Germany', region: 'Western Europe', defaultPrice: 200.0, defaultRisk: 46 },

  // Energy & Oil
  { ticker: 'XOM', name: 'Exxon Mobil Corporation', sector: 'Energy', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 104.1, defaultRisk: 71 },
  { ticker: 'CVX', name: 'Chevron Corporation', sector: 'Energy', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 155.0, defaultRisk: 68 },
  { ticker: 'SHEL', name: 'Shell plc', sector: 'Energy', exchange: 'NYSE', country: 'United Kingdom', region: 'Western Europe', defaultPrice: 68.0, defaultRisk: 66 },
  { ticker: 'TTE', name: 'TotalEnergies SE', sector: 'Energy', exchange: 'NYSE', country: 'France', region: 'Western Europe', defaultPrice: 67.0, defaultRisk: 65 },
  { ticker: 'BP', name: 'BP p.l.c.', sector: 'Energy', exchange: 'NYSE', country: 'United Kingdom', region: 'Western Europe', defaultPrice: 35.0, defaultRisk: 69 },
  { ticker: 'COP', name: 'ConocoPhillips', sector: 'Energy', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 110.0, defaultRisk: 67 },
  { ticker: 'SLB', name: 'SLB (Schlumberger)', sector: 'Energy', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 48.0, defaultRisk: 64 },
  { ticker: 'EOG', name: 'EOG Resources Inc.', sector: 'Energy', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 125.0, defaultRisk: 62 },
  { ticker: 'OXY', name: 'Occidental Petroleum', sector: 'Energy', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 58.0, defaultRisk: 70 },
  { ticker: 'MPC', name: 'Marathon Petroleum', sector: 'Energy', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 170.0, defaultRisk: 63 },

  // Aerospace & Defense
  { ticker: 'LMT', name: 'Lockheed Martin Corporation', sector: 'Defense', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 452.0, defaultRisk: 35 },
  { ticker: 'RTX', name: 'RTX Corporation (Raytheon)', sector: 'Defense', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 105.0, defaultRisk: 42 },
  { ticker: 'BA', name: 'The Boeing Company', sector: 'Defense', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 175.0, defaultRisk: 74 },
  { ticker: 'NOC', name: 'Northrop Grumman Corp.', sector: 'Defense', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 440.0, defaultRisk: 38 },
  { ticker: 'GD', name: 'General Dynamics Corp.', sector: 'Defense', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 290.0, defaultRisk: 36 },
  { ticker: 'LHX', name: 'L3Harris Technologies', sector: 'Defense', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 220.0, defaultRisk: 40 },
  { ticker: 'HII', name: 'Huntington Ingalls Industries', sector: 'Defense', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 260.0, defaultRisk: 37 },
  { ticker: 'AIR.PA', name: 'Airbus SE', sector: 'Defense', exchange: 'EURONEXT', country: 'France', region: 'Western Europe', defaultPrice: 135.0, defaultRisk: 45 },
  { ticker: 'BA.L', name: 'BAE Systems plc', sector: 'Defense', exchange: 'LSE', country: 'United Kingdom', region: 'Western Europe', defaultPrice: 16.5, defaultRisk: 38 },

  // Financials & Banking
  { ticker: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financial', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 205.0, defaultRisk: 52 },
  { ticker: 'BAC', name: 'Bank of America Corp.', sector: 'Financial', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 39.5, defaultRisk: 55 },
  { ticker: 'WFC', name: 'Wells Fargo & Company', sector: 'Financial', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 58.0, defaultRisk: 54 },
  { ticker: 'C', name: 'Citigroup Inc.', sector: 'Financial', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 62.0, defaultRisk: 60 },
  { ticker: 'GS', name: 'The Goldman Sachs Group', sector: 'Financial', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 480.0, defaultRisk: 58 },
  { ticker: 'MS', name: 'Morgan Stanley', sector: 'Financial', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 98.0, defaultRisk: 56 },
  { ticker: 'BLK', name: 'BlackRock Inc.', sector: 'Financial', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 830.0, defaultRisk: 48 },
  { ticker: 'V', name: 'Visa Inc.', sector: 'Financial', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 270.0, defaultRisk: 42 },
  { ticker: 'MA', name: 'Mastercard Incorporated', sector: 'Financial', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 450.0, defaultRisk: 43 },
  { ticker: 'AXP', name: 'American Express Company', sector: 'Financial', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 240.0, defaultRisk: 47 },
  { ticker: 'BRK.B', name: 'Berkshire Hathaway Inc.', sector: 'Financial', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 440.0, defaultRisk: 34 },
  { ticker: 'HSBC', name: 'HSBC Holdings plc', sector: 'Financial', exchange: 'NYSE', country: 'United Kingdom', region: 'Western Europe', defaultPrice: 43.0, defaultRisk: 58 },
  { ticker: 'HDFCBANK.NS', name: 'HDFC Bank Limited', sector: 'Financial', exchange: 'NSE', country: 'India', region: 'South Asia', defaultPrice: 19.5, defaultRisk: 45 },

  // Healthcare & Pharmaceuticals
  { ticker: 'LLY', name: 'Eli Lilly and Company', sector: 'Healthcare', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 915.0, defaultRisk: 42 },
  { ticker: 'UNH', name: 'UnitedHealth Group', sector: 'Healthcare', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 560.0, defaultRisk: 40 },
  { ticker: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 158.0, defaultRisk: 36 },
  { ticker: 'ABBV', name: 'AbbVie Inc.', sector: 'Healthcare', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 180.0, defaultRisk: 46 },
  { ticker: 'MRK', name: 'Merck & Co. Inc.', sector: 'Healthcare', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 125.0, defaultRisk: 38 },
  { ticker: 'PFE', name: 'Pfizer Inc.', sector: 'Healthcare', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 28.5, defaultRisk: 44 },
  { ticker: 'TMO', name: 'Thermo Fisher Scientific', sector: 'Healthcare', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 540.0, defaultRisk: 40 },
  { ticker: 'AZN', name: 'AstraZeneca PLC', sector: 'Healthcare', exchange: 'NASDAQ', country: 'United Kingdom', region: 'Western Europe', defaultPrice: 82.0, defaultRisk: 42 },
  { ticker: 'NVO', name: 'Novo Nordisk A/S', sector: 'Healthcare', exchange: 'NYSE', country: 'Denmark', region: 'Northern Europe', defaultPrice: 130.0, defaultRisk: 45 },
  { ticker: 'DHR', name: 'Danaher Corporation', sector: 'Healthcare', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 260.0, defaultRisk: 39 },

  // Consumer Staples & Defensive
  { ticker: 'WMT', name: 'Walmart Inc.', sector: 'Consumer Defensive', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 70.0, defaultRisk: 32 },
  { ticker: 'COST', name: 'Costco Wholesale Corp.', sector: 'Consumer Defensive', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 860.0, defaultRisk: 34 },
  { ticker: 'PG', name: 'Procter & Gamble Company', sector: 'Consumer Defensive', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 168.0, defaultRisk: 30 },
  { ticker: 'KO', name: 'The Coca-Cola Company', sector: 'Consumer Defensive', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 66.0, defaultRisk: 30 },
  { ticker: 'PEP', name: 'PepsiCo Inc.', sector: 'Consumer Defensive', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 172.0, defaultRisk: 31 },
  { ticker: 'NESN.SW', name: 'Nestlé S.A.', sector: 'Consumer Defensive', exchange: 'SIX', country: 'Switzerland', region: 'Western Europe', defaultPrice: 82.4, defaultRisk: 34 },
  { ticker: 'NSRGY', name: 'Nestlé S.A. (ADR)', sector: 'Consumer Defensive', exchange: 'OTC', country: 'Switzerland', region: 'Western Europe', defaultPrice: 94.0, defaultRisk: 34 },
  { ticker: 'PM', name: 'Philip Morris International', sector: 'Consumer Defensive', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 110.0, defaultRisk: 36 },
  { ticker: 'UL', name: 'Unilever PLC', sector: 'Consumer Defensive', exchange: 'NYSE', country: 'United Kingdom', region: 'Western Europe', defaultPrice: 58.0, defaultRisk: 33 },

  // Consumer Discretionary & Retail
  { ticker: 'HD', name: 'The Home Depot Inc.', sector: 'Consumer Cyclical', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 355.0, defaultRisk: 45 },
  { ticker: 'MCD', name: "McDonald's Corporation", sector: 'Consumer Cyclical', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 260.0, defaultRisk: 36 },
  { ticker: 'NKE', name: 'NIKE Inc.', sector: 'Consumer Cyclical', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 75.0, defaultRisk: 52 },
  { ticker: 'SBUX', name: 'Starbucks Corporation', sector: 'Consumer Cyclical', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 76.0, defaultRisk: 48 },
  { ticker: 'BABA', name: 'Alibaba Group Holding', sector: 'Consumer Cyclical', exchange: 'NYSE', country: 'China', region: 'East Asia', defaultPrice: 75.0, defaultRisk: 82 },
  { ticker: 'PDD', name: 'PDD Holdings Inc. (Temu)', sector: 'Consumer Cyclical', exchange: 'NASDAQ', country: 'China', region: 'East Asia', defaultPrice: 130.0, defaultRisk: 85 },
  { ticker: 'SONY', name: 'Sony Group Corporation', sector: 'Consumer Cyclical', exchange: 'NYSE', country: 'Japan', region: 'East Asia', defaultPrice: 88.0, defaultRisk: 50 },
  { ticker: 'TM', name: 'Toyota Motor Corporation', sector: 'Consumer Cyclical', exchange: 'NYSE', country: 'Japan', region: 'East Asia', defaultPrice: 195.0, defaultRisk: 46 },

  // Industrials & Materials
  { ticker: 'CAT', name: 'Caterpillar Inc.', sector: 'Industrials', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 345.0, defaultRisk: 58 },
  { ticker: 'GE', name: 'GE Aerospace', sector: 'Industrials', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 175.0, defaultRisk: 54 },
  { ticker: 'UNP', name: 'Union Pacific Corporation', sector: 'Industrials', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 235.0, defaultRisk: 44 },
  { ticker: 'HON', name: 'Honeywell International', sector: 'Industrials', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 200.0, defaultRisk: 42 },
  { ticker: 'DE', name: 'Deere & Company', sector: 'Industrials', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 380.0, defaultRisk: 55 },
  { ticker: 'TATASTEEL.NS', name: 'Tata Steel Limited', sector: 'Basic Materials', exchange: 'NSE', country: 'India', region: 'South Asia', defaultPrice: 175.5, defaultRisk: 69 },
  { ticker: '005930.KS', name: 'Samsung Electronics', sector: 'Technology', exchange: 'KRX', country: 'South Korea', region: 'East Asia', defaultPrice: 58.0, defaultRisk: 48 },
  { ticker: 'LIN', name: 'Linde plc', sector: 'Basic Materials', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 445.0, defaultRisk: 38 },
  { ticker: 'BHP', name: 'BHP Group Limited', sector: 'Basic Materials', exchange: 'NYSE', country: 'Australia', region: 'Oceania', defaultPrice: 56.0, defaultRisk: 66 },
  { ticker: 'RIO', name: 'Rio Tinto Group', sector: 'Basic Materials', exchange: 'NYSE', country: 'United Kingdom', region: 'Western Europe', defaultPrice: 64.0, defaultRisk: 67 },
  { ticker: 'FCX', name: 'Freeport-McMoRan Inc.', sector: 'Basic Materials', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 46.0, defaultRisk: 72 },
  { ticker: 'NEM', name: 'Newmont Corporation', sector: 'Basic Materials', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 50.0, defaultRisk: 55 },

  // Communication & Media
  { ticker: 'NFLX', name: 'Netflix Inc.', sector: 'Communication Services', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 650.0, defaultRisk: 58 },
  { ticker: 'DIS', name: 'The Walt Disney Company', sector: 'Communication Services', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 94.0, defaultRisk: 49 },
  { ticker: 'T', name: 'AT&T Inc.', sector: 'Communication Services', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 19.5, defaultRisk: 38 },
  { ticker: 'VZ', name: 'Verizon Communications', sector: 'Communication Services', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 42.0, defaultRisk: 37 },
  { ticker: 'TMUS', name: 'T-Mobile US Inc.', sector: 'Communication Services', exchange: 'NASDAQ', country: 'United States', region: 'North America', defaultPrice: 180.0, defaultRisk: 43 },

  // Utilities & Real Estate
  { ticker: 'NEE', name: 'NextEra Energy Inc.', sector: 'Utilities', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 75.0, defaultRisk: 34 },
  { ticker: 'DUK', name: 'Duke Energy Corp.', sector: 'Utilities', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 108.0, defaultRisk: 28 },
  { ticker: 'SO', name: 'The Southern Company', sector: 'Utilities', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 85.0, defaultRisk: 29 },
  { ticker: 'PLD', name: 'Prologis Inc.', sector: 'Real Estate', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 120.0, defaultRisk: 46 },
  { ticker: 'AMT', name: 'American Tower Corp.', sector: 'Real Estate', exchange: 'NYSE', country: 'United States', region: 'North America', defaultPrice: 215.0, defaultRisk: 44 }
];

/**
 * Searches bundled stock list instantly by ticker or name.
 */
export function searchBundledStocks(query: string, limit = 8): BundledStockItem[] {
  if (!query || !query.trim()) return MAJOR_STOCKS_BUNDLE.slice(0, limit);
  const q = query.toUpperCase().trim();
  const lowerQ = query.toLowerCase().trim();

  return MAJOR_STOCKS_BUNDLE
    .filter((s) => s.ticker.includes(q) || s.name.toLowerCase().includes(lowerQ))
    .slice(0, limit);
}

/**
 * Find exact stock by ticker in the bundle.
 */
export function findBundledStock(ticker: string): BundledStockItem | undefined {
  if (!ticker) return undefined;
  const clean = ticker.toUpperCase().trim();
  return MAJOR_STOCKS_BUNDLE.find((s) => s.ticker === clean);
}
