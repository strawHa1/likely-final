export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  percentChange: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  lastUpdated: string;
  isMarketOpen: boolean;
}

export interface WatchlistEntry {
  ticker: string;
  companyName: string;
  sector: string;
  exchange: string;
  country: string;
  region: string;
}

export interface CompanyProfile extends CompanyRisk {
  exchange: string;
  region: string;
  quote: StockQuote | null;
  activeImpactCount: number;
  inWatchlist: boolean;
  action?: 'Safe' | 'Monitor' | 'Review' | 'Hedge' | 'Reduce';
  countryIso?: string;
  countryFlag?: string;
}

export interface LiveCountryRisk {
  id: string;
  name: string;
  isoCode: string;
  flag: string;
  region: string;
  subregion?: string;
  riskScore: number;
  riskLevel: string;
  eventsCount: number;
  keyRisks: string[];
  scoreChanged?: boolean;
  previousScore?: number;
  sparkline?: (number | null)[];
  monthDelta?: number | null;
  isCurated?: boolean;
  isHotspot?: boolean;
}

export interface GlobalEvent {
  id: string;
  title: string;
  description: string;
  severity: RiskSeverity;
  impactScore: number; // 0 - 100
  region: string;
  countryIso?: string;
  sources: string[];
  reportedAt: string;
  category: 'Geopolitical' | 'Supply Chain' | 'Climate' | 'Macroeconomic' | 'Cybersecurity' | 'Energy';
  affectedCompanyTickers: string[];
  marketImpactSummary: string;
  timeline?: { date: string; title: string; detail: string }[];
  url?: string;
  sourceLinks?: { name: string; url: string }[];
  isLive?: boolean;
}

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: string;
  timeAgo: string;
  region: 'india' | 'world';
  sentiment: 'negative' | 'neutral' | 'positive';
  imageUrl?: string;
}

export interface NewsFeedResponse {
  articles: NewsArticle[];
  source: string;
  lastUpdated: string;
  count: number;
}

export type ImpactSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ImpactSentiment = 'bearish' | 'neutral' | 'bullish';

export interface StockImpactRecord {
  id: string;
  newsId?: string;
  ticker: string;
  companyName: string;
  sector: string;
  country: string;
  region: string;
  headline: string;
  description: string;
  source: string;
  publishedAt: string;
  timeAgo: string;
  url: string;
  sentiment: ImpactSentiment;
  severity: ImpactSeverity;
  projectedImpactPct: { min: number; max: number };
  projectedImpactLabel: string;
  actualChangePct: number;
  currentPrice: number;
  volume: number;
  newsType: 'macro' | 'company';
}

export interface ImpactStoreState {
  impactedCompanies: StockImpactRecord[];
  lastUpdated: string | null;
  lastPriceUpdated?: string | null;
  isLoading: boolean;
  error: string | null;
  notice?: string | null;
  source: string;
}

export interface SearchListingBadge {
  symbol: string;
  exchange: string;
}

export interface SearchFilters {
  region?: string;
  country?: string;
  exchange?: string;
  type?: string;
}

export interface SearchResultItem {
  symbol: string;
  displaySymbol: string;
  name: string;
  exchange: string;
  type: string;
  country: string;
  region: string;
  sector: string;
  currency?: string;
  industry?: string;
  aliases?: string[];
  isin?: string;
  logoUrl?: string;
  quote?: StockQuote | null;
  marketStatus: 'LIVE' | 'Closed' | 'Premarket' | 'After Hours';
  listings?: SearchListingBadge[];
  isLiveSearch?: boolean;
}

export interface CompanyRisk {
  ticker: string;
  name: string;
  sector: string;
  country: string;
  marketCap: string;
  riskScore: number; // 0 - 100
  sentimentScore: number; // 0 - 100 (0 = Bearish, 100 = Bullish)
  sentimentLabel: 'Very Bearish' | 'Bearish' | 'Neutral' | 'Bullish' | 'Very Bullish';
  logoUrl?: string;
  description: string;
  keyRisks: string[];
  aiSummary: string;
  recentNews: { title: string; source: string; time: string; sentiment: 'negative' | 'neutral' | 'positive' }[];
  riskTrend: { date: string; score: number }[];
}

export interface CountryRisk {
  id: string;
  name: string;
  isoCode: string;
  riskScore: number;
  riskLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  flag: string;
  region: string;
  keyRisks: string[];
  eventsCount: number;
  coordinates: [number, number]; // [lng, lat]
  trendHistory: { month: string; score: number }[];
}

export interface PortfolioHolding {
  id: string;
  ticker: string;
  companyName: string;
  exchange?: string;
  country?: string;
  currency?: string;
  sector?: string;
  shares: number;
  avgCost?: number;
  addedAt?: number;
  // Computed runtime fields
  name?: string;
  price?: number;
  prevClose?: number;
  costBasis?: number;
  currentValue?: number;
  allocationPct?: number;
  riskScore?: number;
  recommendedAction?: string;
  action?: string;
  region?: string;
  countryIso?: string;
  countryFlag?: string;
  isEstimatedRisk?: boolean;
}

export interface PortfolioItem extends PortfolioHolding {}

export interface AlertItem {
  id: string;
  title: string;
  severity: RiskSeverity;
  message: string;
  read: boolean;
  /** Display label, always derived from createdAtIso. */
  createdAt: string;
  /** Real event/record time (ISO). Relative labels must use this, not a fake clock. */
  createdAtIso?: string;
  category: string;
  relatedEntitySymbol?: string;
  targetType?: 'event' | 'company' | 'sector' | 'portfolio';
  targetId?: string;
  source?: 'impact' | 'headline' | 'country' | 'user' | 'user-trigger';
}

export interface ReportItem {
  id: string;
  title: string;
  summary: string;
  severityTag: RiskSeverity;
  createdAt: string;
  author: string;
  tags: string[];
  sections: { heading: string; body: string }[];
  triggerSource?: string;
  headlineReferences?: string[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  /** 'error' renders the bubble in the failure style with a retry affordance. */
  status?: 'ok' | 'error';
  widget?: {
    type:
      | 'companyCard'
      | 'eventSummary'
      /** Pending invest/withdraw order awaiting explicit Confirm / Cancel. */
      | 'tradeConfirmation'
      /** Executed trade summary. */
      | 'tradeReceipt'
      /** Newly created price / risk alert. */
      | 'alertCreated';
    data: any;
  };
}

export interface UserProfile {
  name: string;
  email: string;
  avatarUrl: string;
  plan: 'Premium Plan' | 'Enterprise Terminal';
  company: string;
  role: string;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  language: string;
  timezone: string;
  enableAnimations: boolean;
  autoRefreshIntervalSec: number;
  emailAlerts: boolean;
  pushAlerts: boolean;
  criticalOnlyAlerts: boolean;
  finnhubApiKey?: string;
}
