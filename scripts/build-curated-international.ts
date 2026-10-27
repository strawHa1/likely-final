/**
 * Builds data/raw/international_curated.json
 * Generates >= 1,500 curated international companies across >= 30 exchanges.
 */
import fs from 'fs';
import path from 'path';

export interface SymbolEntry {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  country: string;
  currency: string;
  sector?: string;
  industry?: string;
  aliases?: string[];
  isin?: string;
}

// 1. Base curated list from INTERNATIONAL_COMPANIES
import { INTERNATIONAL_COMPANIES } from './generate-international-curated.js';

// 2. Parse ASX listed CSV (data/raw/asx_listed.csv)
function parseAsxListed(): SymbolEntry[] {
  const asxPath = path.join(process.cwd(), 'data', 'raw', 'asx_listed.csv');
  if (!fs.existsSync(asxPath)) return [];
  const text = fs.readFileSync(asxPath, 'utf-8');
  const lines = text.split('\n');
  const items: SymbolEntry[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // CSV format: "ASX code","Company name","GICs industry group","Listing date","Market Cap"
    const match = line.match(/^"([^"]+)","([^"]+)","([^"]*)"/);
    if (!match) continue;
    const rawCode = match[1].trim();
    const name = match[2].trim();
    const sector = match[3].trim() || 'Diversified';
    if (!rawCode || !name) continue;
    // Filter out warrants or strange codes
    if (rawCode.length > 5 || /[^A-Z0-9]/.test(rawCode)) continue;

    const symbol = `${rawCode}.AX`;
    if (seen.has(symbol)) continue;
    seen.add(symbol);

    items.push({
      symbol,
      name,
      exchange: 'ASX',
      type: 'Common Stock',
      country: 'AU',
      currency: 'AUD',
      sector
    });
  }
  return items;
}

// Additional high-profile constituents across global exchanges to ensure deep coverage
const ADDITIONAL_GLOBAL_CONSTITUENTS: SymbolEntry[] = [
  // LSE (UK)
  { symbol: 'SMIN.L', name: 'Smiths Group plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Industrials' },
  { symbol: 'SPX.L', name: 'Spirax-Sarco Engineering plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Industrials' },
  { symbol: 'STAN.L', name: 'Standard Chartered PLC', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Financials' },
  { symbol: 'STJ.L', name: "St. James's Place plc", exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Financials' },
  { symbol: 'TW.L', name: 'Taylor Wimpey plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Cyclical' },
  { symbol: 'UTG.L', name: 'Unite Group plc', exchange: 'LSE', type: 'REIT', country: 'GB', currency: 'GBp', sector: 'Real Estate' },
  { symbol: 'UU.L', name: 'United Utilities Group PLC', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Utilities' },
  { symbol: 'WTB.L', name: 'Whitbread PLC', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Cyclical', aliases: ['Premier Inn'] },
  { symbol: 'ADM.L', name: 'Admiral Group plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Financials' },
  { symbol: 'AUTO.L', name: 'Auto Trader Group plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Communication Services' },
  { symbol: 'BKG.L', name: 'Berkeley Group Holdings plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Cyclical' },
  { symbol: 'BNZL.L', name: 'Bunzl plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Industrials' },
  { symbol: 'BRBY.L', name: 'Burberry Group plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Cyclical', aliases: ['Burberry'] },
  { symbol: 'CRDA.L', name: 'Croda International Plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Basic Materials' },
  { symbol: 'DCC.L', name: 'DCC plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Industrials' },
  { symbol: 'ENT.L', name: 'Entain plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Cyclical', aliases: ['Ladbrokes', 'Bwin'] },
  { symbol: 'FRAS.L', name: 'Frasers Group plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Cyclical', aliases: ['Sports Direct'] },
  { symbol: 'HLMA.L', name: 'Halma plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Industrials' },
  { symbol: 'HIK.L', name: 'Hikma Pharmaceuticals PLC', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Healthcare' },
  { symbol: 'HL.L', name: 'Hargreaves Lansdown plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Financials' },
  { symbol: 'ICAG.L', name: 'International Consolidated Airlines Group', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Industrials', aliases: ['British Airways', 'Iberia'] },
  { symbol: 'INF.L', name: 'Informa plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Communication Services' },
  { symbol: 'IMI.L', name: 'IMI plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Industrials' },
  { symbol: 'ITRK.L', name: 'Intertek Group plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Industrials' },
  { symbol: 'MNG.L', name: 'M&G plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Financials' },
  { symbol: 'MONY.L', name: 'Moneysupermarket.com Group PLC', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Communication Services' },
  { symbol: 'NEXT.L', name: 'Next plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Cyclical', aliases: ['Next clothing'] },
  { symbol: 'OCDO.L', name: 'Ocado Group plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Defensive', aliases: ['Ocado'] },
  { symbol: 'PSON.L', name: 'Pearson plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Defensive', aliases: ['Pearson Education'] },
  { symbol: 'PSN.L', name: 'Persimmon Plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Cyclical' },
  { symbol: 'RTO.L', name: 'Rentokil Initial plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Industrials', aliases: ['Rentokil'] },
  { symbol: 'SVT.L', name: 'Severn Trent Plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Utilities' },
  { symbol: 'SN.L', name: 'Smith & Nephew plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Healthcare' },

  // Euronext Paris (.PA)
  { symbol: 'EN.PA', name: 'Bouygues SA', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Industrials', aliases: ['Bouygues Telecom'] },
  { symbol: 'ATO.PA', name: 'Atos SE', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Technology' },
  { symbol: 'CA.PA', name: 'Carrefour SA', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Consumer Defensive', aliases: ['Carrefour'] },
  { symbol: 'SW.PA', name: 'Sodexo S.A.', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Consumer Cyclical', aliases: ['Sodexo'] },
  { symbol: 'VIV.PA', name: 'Vivendi SE', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Communication Services', aliases: ['Canal+', 'Havas'] },
  { symbol: 'URW.PA', name: 'Unibail-Rodamco-Westfield', exchange: 'EURONEXT', type: 'REIT', country: 'FR', currency: 'EUR', sector: 'Real Estate', aliases: ['Westfield'] },
  { symbol: 'SGO.PA', name: 'Compagnie de Saint-Gobain S.A.', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Industrials', aliases: ['Saint-Gobain'] },
  { symbol: 'GTT.PA', name: 'Gaztransport & Technigaz SA', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Energy' },
  { symbol: 'ALST.PA', name: 'Alstom SA', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Industrials', aliases: ['TGV'] },
  { symbol: 'NEX.PA', name: 'Nexans S.A.', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Industrials' },
  { symbol: 'SEV.PA', name: 'Suez SA', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Utilities' },
  { symbol: 'BVI.PA', name: 'Bureau Veritas SA', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Industrials' },

  // XETRA (Germany - .DE)
  { symbol: 'HNR1.DE', name: 'Hannover Rück SE', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Financials', aliases: ['Hannover Re'] },
  { symbol: 'PAH3.DE', name: 'Porsche Automobil Holding SE', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Consumer Cyclical' },
  { symbol: 'SHL.DE', name: 'Siemens Healthineers AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Healthcare' },
  { symbol: 'ENR.DE', name: 'Siemens Energy AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Industrials', aliases: ['Siemens Energy'] },
  { symbol: 'RHM.DE', name: 'Rheinmetall AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Industrials', aliases: ['Rheinmetall Defense'] },
  { symbol: 'EVK.DE', name: 'Evonik Industries AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Basic Materials' },
  { symbol: 'LHA.DE', name: 'Deutsche Lufthansa AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Industrials', aliases: ['Lufthansa'] },
  { symbol: 'PUM.DE', name: 'Puma SE', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Consumer Cyclical', aliases: ['Puma'] },
  { symbol: 'TKA.DE', name: 'ThyssenKrupp AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Industrials', aliases: ['ThyssenKrupp'] },
  { symbol: 'CBK.DE', name: 'Commerzbank AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Financials', aliases: ['Commerzbank'] },
  { symbol: 'GXI.DE', name: 'Gerresheimer AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Healthcare' },
  { symbol: 'KBX.DE', name: 'Knorr-Bremse AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Industrials' },
  { symbol: 'LEG.DE', name: 'LEG Immobilien SE', exchange: 'XETRA', type: 'REIT', country: 'DE', currency: 'EUR', sector: 'Real Estate' },
  { symbol: 'VNA.DE', name: 'Vonovia SE', exchange: 'XETRA', type: 'REIT', country: 'DE', currency: 'EUR', sector: 'Real Estate' },
  { symbol: 'HLE.DE', name: 'Hella GmbH & Co. KGaA', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Consumer Cyclical' },

  // Tokyo Stock Exchange (Japan - .T)
  { symbol: '7205.T', name: 'Hino Motors, Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Cyclical' },
  { symbol: '7211.T', name: 'Mitsubishi Motors Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Cyclical', aliases: ['Mitsubishi Motors'] },
  { symbol: '7261.T', name: 'Mazda Motor Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Cyclical', aliases: ['Mazda'] },
  { symbol: '7272.T', name: 'Yamaha Motor Co., Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Cyclical', aliases: ['Yamaha'] },
  { symbol: '7951.T', name: 'Yamaha Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Cyclical', aliases: ['Yamaha Music'] },
  { symbol: '2502.T', name: 'Asahi Group Holdings, Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Defensive', aliases: ['Asahi Beer'] },
  { symbol: '2503.T', name: 'Kirin Holdings Company, Limited', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Defensive', aliases: ['Kirin Beer'] },
  { symbol: '2802.T', name: 'Ajinomoto Co., Inc.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Defensive', aliases: ['Ajinomoto', 'MSG'] },
  { symbol: '4911.T', name: 'Shiseido Company, Limited', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Defensive', aliases: ['Shiseido'] },
  { symbol: '4452.T', name: 'Kao Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Defensive', aliases: ['Kao', 'Biore', 'Attack'] },
  { symbol: '3382.T', name: 'Seven & i Holdings Co., Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Defensive', aliases: ['7-Eleven Japan', 'Ito Yokado'] },
  { symbol: '8267.T', name: 'Aeon Co., Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Defensive', aliases: ['Aeon Mall'] },
  { symbol: '8801.T', name: 'Mitsui Fudosan Co., Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Real Estate' },
  { symbol: '8802.T', name: 'Mitsubishi Estate Company, Limited', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Real Estate' },
  { symbol: '9101.T', name: 'Nippon Yusen Kabushiki Kaisha', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Industrials', aliases: ['NYK Line'] },
  { symbol: '9104.T', name: 'Mitsui O.S.K. Lines, Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Industrials', aliases: ['MOL'] },
  { symbol: '9107.T', name: 'Kawasaki Kisen Kaisha, Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Industrials', aliases: ['K Line'] },
  { symbol: '7012.T', name: 'Kawasaki Heavy Industries, Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Industrials', aliases: ['Kawasaki'] },
  { symbol: '6301.T', name: 'Komatsu Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Industrials', aliases: ['Komatsu'] },
  { symbol: '6326.T', name: 'Kubota Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Industrials', aliases: ['Kubota Tractor'] },
  { symbol: '4503.T', name: 'Astellas Pharma Inc.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Healthcare' },
  { symbol: '4519.T', name: 'Chugai Pharmaceutical Co., Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Healthcare' },
  { symbol: '4523.T', name: 'Eisai Co., Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Healthcare', aliases: ['Eisai'] },
  { symbol: '4578.T', name: 'Otsuka Holdings Co., Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Healthcare', aliases: ['Pocari Sweat'] },
  { symbol: '6762.T', name: 'TDK Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Technology', aliases: ['TDK'] },
  { symbol: '6723.T', name: 'Renesas Electronics Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Technology', aliases: ['Renesas'] },
  { symbol: '6503.T', name: 'Mitsubishi Electric Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Industrials' },
  { symbol: '6506.T', name: 'Yaskawa Electric Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Industrials' },
  { symbol: '6857.T', name: 'Advantest Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Technology' },
  { symbol: '7731.T', name: 'Nikon Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Technology', aliases: ['Nikon'] },
  { symbol: '7733.T', name: 'Olympus Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Healthcare', aliases: ['Olympus'] },
  { symbol: '4755.T', name: 'Rakuten Group, Inc.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Cyclical', aliases: ['Rakuten'] },
  { symbol: '4689.T', name: 'LY Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Communication Services', aliases: ['Yahoo Japan', 'LINE'] },

  // Korea Exchange (.KS & .KQ)
  { symbol: '003550.KS', name: 'LG Corp.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Financials' },
  { symbol: '012330.KS', name: 'Hyundai Mobis Co., Ltd.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Consumer Cyclical', aliases: ['Hyundai Mobis'] },
  { symbol: '028260.KS', name: 'Samsung C&T Corporation', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Industrials' },
  { symbol: '032830.KS', name: 'Samsung Life Insurance Co., Ltd.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Financials' },
  { symbol: '015760.KS', name: 'Korea Electric Power Corporation', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Utilities', aliases: ['KEPCO'] },
  { symbol: '033780.KS', name: 'KT&G Corporation', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Consumer Defensive' },
  { symbol: '030200.KS', name: 'KT Corporation', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Communication Services', aliases: ['KT Telecom'] },
  { symbol: '017670.KS', name: 'SK Telecom Co., Ltd.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Communication Services', aliases: ['SK Telecom'] },
  { symbol: '096770.KS', name: 'SK Innovation Co., Ltd.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Energy' },
  { symbol: '010130.KS', name: 'Korea Zinc Co., Ltd.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Basic Materials' },
  { symbol: '034730.KS', name: 'SK Inc.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Industrials' },
  { symbol: '011200.KS', name: 'HMM Co., Ltd.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Industrials', aliases: ['Hyundai Merchant Marine'] },
  { symbol: '009150.KS', name: 'Samsung Electro-Mechanics Co., Ltd.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Technology' },
  { symbol: '018260.KS', name: 'Samsung SDS Co., Ltd.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Technology' },
  { symbol: '000810.KS', name: 'Samsung Fire & Marine Insurance Co.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Financials' },
  { symbol: '086790.KS', name: 'Hana Financial Group Inc.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Financials', aliases: ['Hana Bank'] },
  { symbol: '316140.KS', name: 'Woori Financial Group Inc.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Financials', aliases: ['Woori Bank'] },
  { symbol: '259960.KS', name: 'Krafton, Inc.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Communication Services', aliases: ['PUBG', 'Battlegrounds'] },
  { symbol: '036570.KS', name: 'NCsoft Corporation', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Communication Services', aliases: ['Lineage'] },
  { symbol: '035900.KQ', name: 'JYP Entertainment Corp.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Communication Services', aliases: ['Twice', 'Stray Kids', 'JYP'] },
  { symbol: '122870.KQ', name: 'YG Entertainment Inc.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Communication Services', aliases: ['Blackpink', 'YG'] }
];

export function buildCuratedInternational(): SymbolEntry[] {
  const map = new Map<string, SymbolEntry>();

  for (const item of INTERNATIONAL_COMPANIES) {
    map.set(item.symbol.toUpperCase(), item);
  }

  for (const item of ADDITIONAL_GLOBAL_CONSTITUENTS) {
    map.set(item.symbol.toUpperCase(), item);
  }

  // Add parsed ASX stocks
  const asxStocks = parseAsxListed();
  for (const item of asxStocks) {
    if (!map.has(item.symbol.toUpperCase())) {
      map.set(item.symbol.toUpperCase(), item);
    }
  }

  const out = Array.from(map.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('build-curated-international.ts')) {
  const result = buildCuratedInternational();
  const dest = path.join(process.cwd(), 'data', 'raw', 'international_curated.json');
  fs.writeFileSync(dest, JSON.stringify(result, null, 2), 'utf-8');

  // Verify counts
  const exchanges = new Set(result.map(r => r.exchange));
  console.log(`Curated International built: ${result.length} companies across ${exchanges.size} exchanges.`);
}
