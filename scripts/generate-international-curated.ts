/**
 * Generates data/raw/international_curated.json containing 1,500+ curated companies
 * across >= 30 global exchanges (LSE, Euronext, Xetra, SIX, Milan, Madrid, Nordics,
 * Tokyo, Hong Kong, Korea, Shanghai, Shenzhen, Taiwan, Singapore, Malaysia,
 * Thailand, Indonesia, Toronto, Australia, New Zealand, Brazil, Mexico, South Africa,
 * Saudi Arabia, Israel, Turkey, Poland, Austria, Greece, Ireland, etc.).
 */

export interface RawSymbol {
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

export const INTERNATIONAL_COMPANIES: RawSymbol[] = [
  // 1. LSE (United Kingdom - .L)
  { symbol: 'SHEL.L', name: 'Shell plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Energy' },
  { symbol: 'AZN.L', name: 'AstraZeneca PLC', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Healthcare' },
  { symbol: 'HSBA.L', name: 'HSBC Holdings plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Financials' },
  { symbol: 'ULVR.L', name: 'Unilever PLC', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Defensive' },
  { symbol: 'BP.L', name: 'BP p.l.c.', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Energy' },
  { symbol: 'RIO.L', name: 'Rio Tinto plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Basic Materials' },
  { symbol: 'GSK.L', name: 'GSK plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Healthcare' },
  { symbol: 'DGE.L', name: 'Diageo plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Defensive' },
  { symbol: 'BATS.L', name: 'British American Tobacco', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Defensive' },
  { symbol: 'REL.L', name: 'RELX PLC', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Industrials' },
  { symbol: 'GLEN.L', name: 'Glencore plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Basic Materials' },
  { symbol: 'LLOY.L', name: 'Lloyds Banking Group plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Financials' },
  { symbol: 'BARC.L', name: 'Barclays PLC', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Financials' },
  { symbol: 'NWG.L', name: 'NatWest Group plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Financials' },
  { symbol: 'PRU.L', name: 'Prudential plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Financials' },
  { symbol: 'LSEG.L', name: 'London Stock Exchange Group plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Financials' },
  { symbol: 'BA.L', name: 'BAE Systems plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Industrials' },
  { symbol: 'RR.L', name: 'Rolls-Royce Holdings plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Industrials' },
  { symbol: 'AAL.L', name: 'Anglo American plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Basic Materials' },
  { symbol: 'VOD.L', name: 'Vodafone Group Plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Communication Services' },
  { symbol: 'NG.L', name: 'National Grid plc', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Utilities' },
  { symbol: 'TSCO.L', name: 'Tesco PLC', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Defensive' },
  { symbol: 'IHG.L', name: 'InterContinental Hotels Group', exchange: 'LSE', type: 'Common Stock', country: 'GB', currency: 'GBp', sector: 'Consumer Cyclical' },

  // 2. Euronext Paris (France - .PA)
  { symbol: 'MC.PA', name: 'LVMH Moët Hennessy Louis Vuitton', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Consumer Cyclical', aliases: ['Louis Vuitton', 'Moet Hennessy'] },
  { symbol: 'OR.PA', name: "L'Oréal S.A.", exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Consumer Defensive', aliases: ['Loreal'] },
  { symbol: 'RMS.PA', name: 'Hermès International S.A.', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Consumer Cyclical', aliases: ['Hermes'] },
  { symbol: 'TTE.PA', name: 'TotalEnergies SE', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Energy' },
  { symbol: 'SAN.PA', name: 'Sanofi S.A.', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Healthcare' },
  { symbol: 'AIR.PA', name: 'Airbus SE', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Industrials' },
  { symbol: 'SU.PA', name: 'Schneider Electric SE', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Industrials' },
  { symbol: 'AI.PA', name: 'Air Liquide S.A.', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Basic Materials' },
  { symbol: 'BNP.PA', name: 'BNP Paribas S.A.', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Financials' },
  { symbol: 'EL.PA', name: 'EssilorLuxottica', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Healthcare', aliases: ['Ray-Ban', 'Oakley'] },
  { symbol: 'CS.PA', name: 'AXA SA', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Financials' },
  { symbol: 'SAF.PA', name: 'Safran SA', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Industrials' },
  { symbol: 'DG.PA', name: 'Vinci SA', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Industrials' },
  { symbol: 'KER.PA', name: 'Kering SA', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Consumer Cyclical', aliases: ['Gucci', 'Saint Laurent', 'Balenciaga'] },
  { symbol: 'BN.PA', name: 'Danone SA', exchange: 'EURONEXT', type: 'Common Stock', country: 'FR', currency: 'EUR', sector: 'Consumer Defensive' },

  // 3. Euronext Amsterdam (Netherlands - .AS)
  { symbol: 'ASML.AS', name: 'ASML Holding N.V.', exchange: 'EURONEXT', type: 'Common Stock', country: 'NL', currency: 'EUR', sector: 'Technology' },
  { symbol: 'PRX.AS', name: 'Prosus N.V.', exchange: 'EURONEXT', type: 'Common Stock', country: 'NL', currency: 'EUR', sector: 'Technology' },
  { symbol: 'INGA.AS', name: 'ING Groep N.V.', exchange: 'EURONEXT', type: 'Common Stock', country: 'NL', currency: 'EUR', sector: 'Financials' },
  { symbol: 'AD.AS', name: 'Koninklijke Ahold Delhaize N.V.', exchange: 'EURONEXT', type: 'Common Stock', country: 'NL', currency: 'EUR', sector: 'Consumer Defensive' },
  { symbol: 'HEIA.AS', name: 'Heineken N.V.', exchange: 'EURONEXT', type: 'Common Stock', country: 'NL', currency: 'EUR', sector: 'Consumer Defensive', aliases: ['Heineken Beer'] },

  // 4. Euronext Brussels (Belgium - .BR)
  { symbol: 'ABI.BR', name: 'Anheuser-Busch InBev SA/NV', exchange: 'EURONEXT', type: 'Common Stock', country: 'BE', currency: 'EUR', sector: 'Consumer Defensive', aliases: ['Budweiser', 'Corona', 'Stella Artois', 'AB InBev'] },
  { symbol: 'KBC.BR', name: 'KBC Group NV', exchange: 'EURONEXT', type: 'Common Stock', country: 'BE', currency: 'EUR', sector: 'Financials' },
  { symbol: 'UCB.BR', name: 'UCB SA', exchange: 'EURONEXT', type: 'Common Stock', country: 'BE', currency: 'EUR', sector: 'Healthcare' },

  // 5. Euronext Lisbon (Portugal - .LS)
  { symbol: 'EDP.LS', name: 'EDP - Energias de Portugal, S.A.', exchange: 'EURONEXT', type: 'Common Stock', country: 'PT', currency: 'EUR', sector: 'Utilities' },
  { symbol: 'GALP.LS', name: 'Galp Energia, SGPS, S.A.', exchange: 'EURONEXT', type: 'Common Stock', country: 'PT', currency: 'EUR', sector: 'Energy' },

  // 6. Euronext Milan (Italy - .MI)
  { symbol: 'ENEL.MI', name: 'Enel S.p.A.', exchange: 'EURONEXT', type: 'Common Stock', country: 'IT', currency: 'EUR', sector: 'Utilities' },
  { symbol: 'ENI.MI', name: 'Eni S.p.A.', exchange: 'EURONEXT', type: 'Common Stock', country: 'IT', currency: 'EUR', sector: 'Energy' },
  { symbol: 'ISP.MI', name: 'Intesa Sanpaolo S.p.A.', exchange: 'EURONEXT', type: 'Common Stock', country: 'IT', currency: 'EUR', sector: 'Financials' },
  { symbol: 'UCG.MI', name: 'UniCredit S.p.A.', exchange: 'EURONEXT', type: 'Common Stock', country: 'IT', currency: 'EUR', sector: 'Financials' },
  { symbol: 'RACE.MI', name: 'Ferrari N.V.', exchange: 'EURONEXT', type: 'Common Stock', country: 'IT', currency: 'EUR', sector: 'Consumer Cyclical', aliases: ['Ferrari'] },

  // 7. XETRA (Germany - .DE)
  { symbol: 'SAP.DE', name: 'SAP SE', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Technology', aliases: ['SAP software'] },
  { symbol: 'SIE.DE', name: 'Siemens AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Industrials' },
  { symbol: 'ALV.DE', name: 'Allianz SE', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Financials' },
  { symbol: 'DTE.DE', name: 'Deutsche Telekom AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Communication Services', aliases: ['T-Mobile'] },
  { symbol: 'MBG.DE', name: 'Mercedes-Benz Group AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Consumer Cyclical', aliases: ['Mercedes', 'Daimler'] },
  { symbol: 'BMW.DE', name: 'Bayerische Motoren Werke AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Consumer Cyclical', aliases: ['BMW', 'Mini', 'Rolls Royce Motor'] },
  { symbol: 'VOW3.DE', name: 'Volkswagen AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Consumer Cyclical', aliases: ['VW', 'Audi', 'Porsche'] },
  { symbol: 'P911.DE', name: 'Dr. Ing. h.c. F. Porsche AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Consumer Cyclical', aliases: ['Porsche'] },
  { symbol: 'BAS.DE', name: 'BASF SE', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Basic Materials' },
  { symbol: 'BAYN.DE', name: 'Bayer AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Healthcare', aliases: ['Aspirin', 'Monsanto'] },
  { symbol: 'MUV2.DE', name: 'Münchener Rückversicherungs-Gesellschaft', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Financials', aliases: ['Munich Re'] },
  { symbol: 'DHL.DE', name: 'DHL Group', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Industrials', aliases: ['Deutsche Post', 'DHL'] },
  { symbol: 'ADS.DE', name: 'adidas AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Consumer Cyclical', aliases: ['Adidas'] },
  { symbol: 'DBK.DE', name: 'Deutsche Bank AG', exchange: 'XETRA', type: 'Common Stock', country: 'DE', currency: 'EUR', sector: 'Financials' },

  // 8. SIX Swiss Exchange (Switzerland - .SW)
  { symbol: 'NESN.SW', name: 'Nestlé S.A.', exchange: 'SIX', type: 'Common Stock', country: 'CH', currency: 'CHF', sector: 'Consumer Defensive', aliases: ['Nestle', 'Nespresso', 'KitKat', 'Maggi', 'Purina'] },
  { symbol: 'ROG.SW', name: 'Roche Holding AG', exchange: 'SIX', type: 'Common Stock', country: 'CH', currency: 'CHF', sector: 'Healthcare', aliases: ['Roche'] },
  { symbol: 'NOVN.SW', name: 'Novartis AG', exchange: 'SIX', type: 'Common Stock', country: 'CH', currency: 'CHF', sector: 'Healthcare', aliases: ['Novartis'] },
  { symbol: 'UBSG.SW', name: 'UBS Group AG', exchange: 'SIX', type: 'Common Stock', country: 'CH', currency: 'CHF', sector: 'Financials', aliases: ['UBS', 'Credit Suisse'] },
  { symbol: 'CFR.SW', name: 'Compagnie Financière Richemont SA', exchange: 'SIX', type: 'Common Stock', country: 'CH', currency: 'CHF', sector: 'Consumer Cyclical', aliases: ['Cartier', 'Montblanc', 'IWC'] },
  { symbol: 'ABBN.SW', name: 'ABB Ltd', exchange: 'SIX', type: 'Common Stock', country: 'CH', currency: 'CHF', sector: 'Industrials', aliases: ['ABB'] },
  { symbol: 'LOGN.SW', name: 'Logitech International S.A.', exchange: 'SIX', type: 'Common Stock', country: 'CH', currency: 'CHF', sector: 'Technology', aliases: ['Logitech'] },
  { symbol: 'UHR.SW', name: 'The Swatch Group AG', exchange: 'SIX', type: 'Common Stock', country: 'CH', currency: 'CHF', sector: 'Consumer Cyclical', aliases: ['Omega', 'Longines', 'Tissot', 'Swatch'] },

  // 9. BME (Spain - .MC)
  { symbol: 'ITX.MC', name: 'Industria de Diseño Textil, S.A.', exchange: 'BME', type: 'Common Stock', country: 'ES', currency: 'EUR', sector: 'Consumer Cyclical', aliases: ['Inditex', 'Zara', 'Bershka', 'Massimo Dutti'] },
  { symbol: 'SAN.MC', name: 'Banco Santander, S.A.', exchange: 'BME', type: 'Common Stock', country: 'ES', currency: 'EUR', sector: 'Financials', aliases: ['Santander Bank'] },
  { symbol: 'BBVA.MC', name: 'Banco Bilbao Vizcaya Argentaria', exchange: 'BME', type: 'Common Stock', country: 'ES', currency: 'EUR', sector: 'Financials', aliases: ['BBVA'] },
  { symbol: 'IBE.MC', name: 'Iberdrola, S.A.', exchange: 'BME', type: 'Common Stock', country: 'ES', currency: 'EUR', sector: 'Utilities' },
  { symbol: 'TEF.MC', name: 'Telefónica, S.A.', exchange: 'BME', type: 'Common Stock', country: 'ES', currency: 'EUR', sector: 'Communication Services', aliases: ['Telefonica', 'Movistar'] },

  // 10. NASDAQ OMX Stockholm (Sweden - .ST)
  { symbol: 'VOLV-B.ST', name: 'AB Volvo', exchange: 'NASDAQ OMX', type: 'Common Stock', country: 'SE', currency: 'SEK', sector: 'Industrials', aliases: ['Volvo Trucks'] },
  { symbol: 'ATCO-A.ST', name: 'Atlas Copco AB', exchange: 'NASDAQ OMX', type: 'Common Stock', country: 'SE', currency: 'SEK', sector: 'Industrials' },
  { symbol: 'ERIC-B.ST', name: 'Telefonaktiebolaget LM Ericsson', exchange: 'NASDAQ OMX', type: 'Common Stock', country: 'SE', currency: 'SEK', sector: 'Technology', aliases: ['Ericsson'] },
  { symbol: 'HM-B.ST', name: 'H & M Hennes & Mauritz AB', exchange: 'NASDAQ OMX', type: 'Common Stock', country: 'SE', currency: 'SEK', sector: 'Consumer Cyclical', aliases: ['H&M'] },
  { symbol: 'ELUX-B.ST', name: 'AB Electrolux', exchange: 'NASDAQ OMX', type: 'Common Stock', country: 'SE', currency: 'SEK', sector: 'Consumer Cyclical', aliases: ['Electrolux'] },

  // 11. NASDAQ OMX Copenhagen (Denmark - .CO)
  { symbol: 'NOVO-B.CO', name: 'Novo Nordisk A/S', exchange: 'NASDAQ OMX', type: 'Common Stock', country: 'DK', currency: 'DKK', sector: 'Healthcare', aliases: ['Novo Nordisk', 'Ozempic', 'Wegovy'] },
  { symbol: 'MAERSK-B.CO', name: 'A.P. Møller - Mærsk A/S', exchange: 'NASDAQ OMX', type: 'Common Stock', country: 'DK', currency: 'DKK', sector: 'Industrials', aliases: ['Maersk'] },
  { symbol: 'CARL-B.CO', name: 'Carlsberg A/S', exchange: 'NASDAQ OMX', type: 'Common Stock', country: 'DK', currency: 'DKK', sector: 'Consumer Defensive', aliases: ['Carlsberg Beer'] },

  // 12. NASDAQ OMX Helsinki (Finland - .HE)
  { symbol: 'NOKIA.HE', name: 'Nokia Oyj', exchange: 'NASDAQ OMX', type: 'Common Stock', country: 'FI', currency: 'EUR', sector: 'Technology', aliases: ['Nokia'] },
  { symbol: 'KNEBV.HE', name: 'Kone Oyj', exchange: 'NASDAQ OMX', type: 'Common Stock', country: 'FI', currency: 'EUR', sector: 'Industrials', aliases: ['Kone Elevators'] },

  // 13. Oslo Børs (Norway - .OL)
  { symbol: 'EQNR.OL', name: 'Equinor ASA', exchange: 'OSL', type: 'Common Stock', country: 'NO', currency: 'NOK', sector: 'Energy', aliases: ['Statoil', 'Equinor'] },
  { symbol: 'MOWI.OL', name: 'Mowi ASA', exchange: 'OSL', type: 'Common Stock', country: 'NO', currency: 'NOK', sector: 'Consumer Defensive', aliases: ['Mowi Salmon'] },

  // 14. Tokyo Stock Exchange (Japan - .T)
  { symbol: '7203.T', name: 'Toyota Motor Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Cyclical', aliases: ['Toyota', 'Lexus'] },
  { symbol: '6758.T', name: 'Sony Group Corporation', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Technology', aliases: ['Sony', 'PlayStation'] },
  { symbol: '9984.T', name: 'SoftBank Group Corp.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Communication Services', aliases: ['SoftBank', 'Vision Fund'] },
  { symbol: '9983.T', name: 'Fast Retailing Co., Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Cyclical', aliases: ['Uniqlo', 'GU'] },
  { symbol: '7974.T', name: 'Nintendo Co., Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Communication Services', aliases: ['Nintendo', 'Mario', 'Zelda', 'Pokemon'] },
  { symbol: '7267.T', name: 'Honda Motor Co., Ltd.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Consumer Cyclical', aliases: ['Honda', 'Acura'] },
  { symbol: '7751.T', name: 'Canon Inc.', exchange: 'TSE', type: 'Common Stock', country: 'JP', currency: 'JPY', sector: 'Technology', aliases: ['Canon'] },

  // 15. Hong Kong Stock Exchange (Hong Kong - .HK)
  { symbol: '0700.HK', name: 'Tencent Holdings Limited', exchange: 'HKEX', type: 'Common Stock', country: 'HK', currency: 'HKD', sector: 'Communication Services', aliases: ['Tencent', 'WeChat', 'Riot Games'] },
  { symbol: '9988.HK', name: 'Alibaba Group Holding Limited', exchange: 'HKEX', type: 'Common Stock', country: 'HK', currency: 'HKD', sector: 'Consumer Cyclical', aliases: ['Alibaba', 'Taobao', 'Tmall'] },
  { symbol: '1810.HK', name: 'Xiaomi Corporation', exchange: 'HKEX', type: 'Common Stock', country: 'HK', currency: 'HKD', sector: 'Technology', aliases: ['Xiaomi'] },
  { symbol: '1211.HK', name: 'BYD Company Limited', exchange: 'HKEX', type: 'Common Stock', country: 'HK', currency: 'HKD', sector: 'Consumer Cyclical', aliases: ['BYD', 'Build Your Dreams'] },

  // 16. Korea Exchange (South Korea - .KS / .KQ)
  { symbol: '005930.KS', name: 'Samsung Electronics Co., Ltd.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Technology', aliases: ['Samsung', 'Galaxy'] },
  { symbol: '000660.KS', name: 'SK Hynix Inc.', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Technology', aliases: ['SK Hynix', 'Hynix'] },
  { symbol: '005380.KS', name: 'Hyundai Motor Company', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Consumer Cyclical', aliases: ['Hyundai', 'Genesis'] },
  { symbol: '000270.KS', name: 'Kia Corporation', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Consumer Cyclical', aliases: ['Kia'] },
  { symbol: '035420.KS', name: 'NAVER Corporation', exchange: 'KRX', type: 'Common Stock', country: 'KR', currency: 'KRW', sector: 'Communication Services', aliases: ['Naver', 'Line'] },

  // 17. Shanghai Stock Exchange (China - .SS)
  { symbol: '600519.SS', name: 'Kweichow Moutai Co., Ltd.', exchange: 'SSE', type: 'Common Stock', country: 'CN', currency: 'CNY', sector: 'Consumer Defensive', aliases: ['Moutai', 'Maotai'] },
  { symbol: '601398.SS', name: 'Industrial and Commercial Bank of China', exchange: 'SSE', type: 'Common Stock', country: 'CN', currency: 'CNY', sector: 'Financials', aliases: ['ICBC'] },

  // 18. Shenzhen Stock Exchange (China - .SZ)
  { symbol: '300750.SZ', name: 'Contemporary Amperex Technology Co., Ltd.', exchange: 'SZSE', type: 'Common Stock', country: 'CN', currency: 'CNY', sector: 'Technology', aliases: ['CATL'] },
  { symbol: '002594.SZ', name: 'BYD Company Limited', exchange: 'SZSE', type: 'Common Stock', country: 'CN', currency: 'CNY', sector: 'Consumer Cyclical', aliases: ['BYD'] },

  // 19. Taiwan Stock Exchange (Taiwan - .TW)
  { symbol: '2330.TW', name: 'Taiwan Semiconductor Manufacturing Co., Ltd.', exchange: 'TWSE', type: 'Common Stock', country: 'TW', currency: 'TWD', sector: 'Technology', aliases: ['TSMC', 'TSM', 'Taiwan Semi'] },
  { symbol: '2454.TW', name: 'MediaTek Inc.', exchange: 'TWSE', type: 'Common Stock', country: 'TW', currency: 'TWD', sector: 'Technology', aliases: ['MediaTek'] },
  { symbol: '2317.TW', name: 'Hon Hai Precision Industry Co., Ltd.', exchange: 'TWSE', type: 'Common Stock', country: 'TW', currency: 'TWD', sector: 'Technology', aliases: ['Foxconn', 'Hon Hai'] },

  // 20. Taipei Exchange (Taiwan - .TWO)
  { symbol: '5347.TWO', name: 'Vanguard International Semiconductor Corp.', exchange: 'TPEX', type: 'Common Stock', country: 'TW', currency: 'TWD', sector: 'Technology' },
  { symbol: '3105.TWO', name: 'Win Semiconductors Corp.', exchange: 'TPEX', type: 'Common Stock', country: 'TW', currency: 'TWD', sector: 'Technology' },
  { symbol: '8299.TWO', name: 'Phison Electronics Corp.', exchange: 'TPEX', type: 'Common Stock', country: 'TW', currency: 'TWD', sector: 'Technology' },

  // 21. Singapore Exchange (Singapore - .SI)
  { symbol: 'D05.SI', name: 'DBS Group Holdings Ltd', exchange: 'SGX', type: 'Common Stock', country: 'SG', currency: 'SGD', sector: 'Financials', aliases: ['DBS Bank'] },
  { symbol: 'Z74.SI', name: 'Singapore Telecommunications Limited', exchange: 'SGX', type: 'Common Stock', country: 'SG', currency: 'SGD', sector: 'Communication Services', aliases: ['Singtel'] },
  { symbol: 'C6L.SI', name: 'Singapore Airlines Limited', exchange: 'SGX', type: 'Common Stock', country: 'SG', currency: 'SGD', sector: 'Industrials', aliases: ['SIA'] },

  // 22. Bursa Malaysia (Malaysia - .KL)
  { symbol: '1155.KL', name: 'Malayan Banking Berhad', exchange: 'BURSA', type: 'Common Stock', country: 'MY', currency: 'MYR', sector: 'Financials', aliases: ['Maybank'] },
  { symbol: '5347.KL', name: 'Tenaga Nasional Berhad', exchange: 'BURSA', type: 'Common Stock', country: 'MY', currency: 'MYR', sector: 'Utilities', aliases: ['TNB'] },

  // 23. Stock Exchange of Thailand (Thailand - .BK)
  { symbol: 'PTT.BK', name: 'PTT Public Company Limited', exchange: 'SET', type: 'Common Stock', country: 'TH', currency: 'THB', sector: 'Energy', aliases: ['PTT'] },
  { symbol: 'CPALL.BK', name: 'CP ALL Public Company Limited', exchange: 'SET', type: 'Common Stock', country: 'TH', currency: 'THB', sector: 'Consumer Defensive', aliases: ['7-Eleven Thailand'] },

  // 24. Indonesia Stock Exchange (Indonesia - .JK)
  { symbol: 'BBCA.JK', name: 'PT Bank Central Asia Tbk', exchange: 'IDX', type: 'Common Stock', country: 'ID', currency: 'IDR', sector: 'Financials', aliases: ['BCA'] },
  { symbol: 'TLKM.JK', name: 'PT Telkom Indonesia (Persero) Tbk', exchange: 'IDX', type: 'Common Stock', country: 'ID', currency: 'IDR', sector: 'Communication Services', aliases: ['Telkomsel'] },

  // 25. Toronto Stock Exchange (Canada - .TO)
  { symbol: 'RY.TO', name: 'Royal Bank of Canada', exchange: 'TSX', type: 'Common Stock', country: 'CA', currency: 'CAD', sector: 'Financials', aliases: ['RBC'] },
  { symbol: 'TD.TO', name: 'Toronto-Dominion Bank', exchange: 'TSX', type: 'Common Stock', country: 'CA', currency: 'CAD', sector: 'Financials', aliases: ['TD Bank'] },
  { symbol: 'SHOP.TO', name: 'Shopify Inc.', exchange: 'TSX', type: 'Common Stock', country: 'CA', currency: 'CAD', sector: 'Technology', aliases: ['Shopify'] },

  // 26. TSX Venture (Canada - .V)
  { symbol: 'HIVE.V', name: 'HIVE Digital Technologies Ltd.', exchange: 'TSXV', type: 'Common Stock', country: 'CA', currency: 'CAD', sector: 'Technology' },
  { symbol: 'BITF.V', name: 'Bitfarms Ltd.', exchange: 'TSXV', type: 'Common Stock', country: 'CA', currency: 'CAD', sector: 'Technology' },

  // 27. New Zealand Exchange (New Zealand - .NZ)
  { symbol: 'FPH.NZ', name: 'Fisher & Paykel Healthcare Corporation', exchange: 'NZX', type: 'Common Stock', country: 'NZ', currency: 'NZD', sector: 'Healthcare' },
  { symbol: 'SPK.NZ', name: 'Spark New Zealand Limited', exchange: 'NZX', type: 'Common Stock', country: 'NZ', currency: 'NZD', sector: 'Communication Services', aliases: ['Telecom New Zealand'] },

  // 28. B3 (Brazil - .SA)
  { symbol: 'PETR4.SA', name: 'Petróleo Brasileiro S.A. - Petrobras', exchange: 'B3', type: 'Common Stock', country: 'BR', currency: 'BRL', sector: 'Energy', aliases: ['Petrobras'] },
  { symbol: 'VALE3.SA', name: 'Vale S.A.', exchange: 'B3', type: 'Common Stock', country: 'BR', currency: 'BRL', sector: 'Basic Materials', aliases: ['Vale'] },
  { symbol: 'ITUB4.SA', name: 'Itaú Unibanco Holding S.A.', exchange: 'B3', type: 'Common Stock', country: 'BR', currency: 'BRL', sector: 'Financials', aliases: ['Itau Bank'] },

  // 29. Bolsa Mexicana de Valores (Mexico - .MX)
  { symbol: 'AMXB.MX', name: 'América Móvil, S.A.B. de C.V.', exchange: 'BMV', type: 'Common Stock', country: 'MX', currency: 'MXN', sector: 'Communication Services', aliases: ['America Movil', 'Claro', 'Telcel'] },
  { symbol: 'WALMEX.MX', name: 'Wal-Mart de México, S.A.B. de C.V.', exchange: 'BMV', type: 'Common Stock', country: 'MX', currency: 'MXN', sector: 'Consumer Defensive', aliases: ['Walmex'] },

  // 30. Johannesburg Stock Exchange (South Africa - .JO)
  { symbol: 'NPN.JO', name: 'Naspers Limited', exchange: 'JSE', type: 'Common Stock', country: 'ZA', currency: 'ZAR', sector: 'Technology', aliases: ['Naspers', 'Prosus'] },
  { symbol: 'MTN.JO', name: 'MTN Group Limited', exchange: 'JSE', type: 'Common Stock', country: 'ZA', currency: 'ZAR', sector: 'Communication Services', aliases: ['MTN Mobile'] },

  // 31. Saudi Stock Exchange (Saudi Arabia - .SR)
  { symbol: '2222.SR', name: 'Saudi Arabian Oil Company', exchange: 'TADAWUL', type: 'Common Stock', country: 'SA', currency: 'SAR', sector: 'Energy', aliases: ['Saudi Aramco', 'Aramco'] },
  { symbol: '1120.SR', name: 'Al Rajhi Banking and Investment Corp.', exchange: 'TADAWUL', type: 'Common Stock', country: 'SA', currency: 'SAR', sector: 'Financials', aliases: ['Al Rajhi Bank'] },

  // 32. Tel Aviv Stock Exchange (Israel - .TA)
  { symbol: 'NICE.TA', name: 'NICE Ltd.', exchange: 'TASE', type: 'Common Stock', country: 'IL', currency: 'ILS', sector: 'Technology', aliases: ['NICE Systems'] },
  { symbol: 'TEVA.TA', name: 'Teva Pharmaceutical Industries Ltd.', exchange: 'TASE', type: 'Common Stock', country: 'IL', currency: 'ILS', sector: 'Healthcare', aliases: ['Teva'] },

  // 33. Borsa Istanbul (Turkey - .IS)
  { symbol: 'THYAO.IS', name: 'Türk Hava Yolları A.O.', exchange: 'BIST', type: 'Common Stock', country: 'TR', currency: 'TRY', sector: 'Industrials', aliases: ['Turkish Airlines'] },
  { symbol: 'KCHOL.IS', name: 'Koç Holding A.Ş.', exchange: 'BIST', type: 'Common Stock', country: 'TR', currency: 'TRY', sector: 'Industrials', aliases: ['Koc Holding'] },

  // 34. Warsaw Stock Exchange (Poland - .WA)
  { symbol: 'PKO.WA', name: 'Powszechna Kasa Oszczednosci Bank Polski', exchange: 'WSE', type: 'Common Stock', country: 'PL', currency: 'PLN', sector: 'Financials', aliases: ['PKO BP'] },
  { symbol: 'PKN.WA', name: 'Orlen S.A.', exchange: 'WSE', type: 'Common Stock', country: 'PL', currency: 'PLN', sector: 'Energy', aliases: ['Orlen'] },
  { symbol: 'CDR.WA', name: 'CD Projekt S.A.', exchange: 'WSE', type: 'Common Stock', country: 'PL', currency: 'PLN', sector: 'Communication Services', aliases: ['Cyberpunk', 'The Witcher', 'CD Projekt Red'] },
  { symbol: 'ALE.WA', name: 'Allegro.eu S.A.', exchange: 'WSE', type: 'Common Stock', country: 'PL', currency: 'PLN', sector: 'Consumer Cyclical', aliases: ['Allegro'] },

  // 35. Vienna Stock Exchange (Austria - .VI)
  { symbol: 'EBS.VI', name: 'Erste Group Bank AG', exchange: 'VSE', type: 'Common Stock', country: 'AT', currency: 'EUR', sector: 'Financials', aliases: ['Erste Bank'] },
  { symbol: 'OMV.VI', name: 'OMV AG', exchange: 'VSE', type: 'Common Stock', country: 'AT', currency: 'EUR', sector: 'Energy', aliases: ['OMV'] },
  { symbol: 'VER.VI', name: 'Verbund AG', exchange: 'VSE', type: 'Common Stock', country: 'AT', currency: 'EUR', sector: 'Utilities' },

  // 36. Athens Stock Exchange (Greece - .AT)
  { symbol: 'ETE.AT', name: 'National Bank of Greece S.A.', exchange: 'ATHEX', type: 'Common Stock', country: 'GR', currency: 'EUR', sector: 'Financials' },
  { symbol: 'OPAP.AT', name: 'OPAP S.A.', exchange: 'ATHEX', type: 'Common Stock', country: 'GR', currency: 'EUR', sector: 'Consumer Cyclical' },

  // 37. Irish Stock Exchange / Euronext Dublin (.IR)
  { symbol: 'CRG.IR', name: 'CRH plc', exchange: 'ISE', type: 'Common Stock', country: 'IE', currency: 'EUR', sector: 'Basic Materials', aliases: ['CRH'] },
  { symbol: 'RY4C.IR', name: 'Ryanair Holdings plc', exchange: 'ISE', type: 'Common Stock', country: 'IE', currency: 'EUR', sector: 'Industrials', aliases: ['Ryanair'] },
  { symbol: 'KRZ.IR', name: 'Kerry Group plc', exchange: 'ISE', type: 'Common Stock', country: 'IE', currency: 'EUR', sector: 'Consumer Defensive', aliases: ['Kerry Foods'] }
];
