/**
 * Natural-language intent detection for the AI Assistant chat.
 *
 * Runs locally before a message is sent to Gemini. Trade and alert commands are
 * deterministic and touch the user's money, so they are matched with explicit
 * regexes rather than being left to the model — that keeps them reliable and
 * guarantees a confirmation step is always shown.
 */

import { AlertConditionType } from './alertsService';

export interface TradeIntent {
  kind: 'trade';
  action: 'invest' | 'withdraw';
  ticker: string;
  amount: number;
}

export interface AlertIntent {
  kind: 'alert';
  subject: string;
  subjectType: 'stock' | 'risk-index';
  condition: AlertConditionType;
  threshold: number;
}

export type ChatIntent = TradeIntent | AlertIntent | { kind: 'none' };

/** Words that look like tickers but never are, so we don't fire false positives. */
const TICKER_STOPWORDS = new Set([
  'THE', 'MY', 'A', 'AN', 'IT', 'US', 'ALL', 'CASH', 'ANY', 'MORE', 'SOME', 'THIS', 'THAT'
]);

const INVEST_RE =
  /\b(?:invest|buy|purchase|allocate|put)\s+\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\s*(?:dollars?|usd)?\s*(?:worth\s*)?(?:in|into|on|of|to)\s+\$?([A-Za-z0-9][A-Za-z0-9.\-]{0,14})\b/i;

const WITHDRAW_RE =
  /\b(?:withdraw|sell|redeem|liquidate|pull)\s+\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\s*(?:dollars?|usd)?\s*(?:worth\s*)?(?:from|of|in|out\s+of)\s+\$?([A-Za-z0-9][A-Za-z0-9.\-]{0,14})\b/i;

const RISK_ALERT_RE =
  /\b(?:alert|notify|tell|warn|ping)\b[^.?!]*?\b(?:if|when|whenever)\b\s+(?:the\s+)?(.+?)\s+risk(?:\s+(?:index|score|level))?\s*(?:goes?|rises?|climbs?|moves?|drops?|falls?|is)?\s*(above|over|below|under|exceeds?|beyond)\s+(\d+(?:\.\d+)?)\s*%?/i;

const PRICE_ALERT_RE =
  /\b(?:alert|notify|tell|warn|ping)\b[^.?!]*?\b(?:if|when|whenever)\b\s+\$?([A-Za-z0-9][A-Za-z0-9.\-]{0,14})\b\s+(?:stock\s+)?(?:share\s+)?(?:price\s+)?(?:goes?|drops?|falls?|rises?|climbs?|moves?|trades?|hits?|reaches?|is)?\s*(above|over|below|under|exceeds?|beyond)\s+\$?\s*([\d,]+(?:\.\d+)?)\s*(k)?/i;

/** Expands "5k" / "2.5m" / "1,200" into a plain number. */
function parseAmount(numeric: string, suffix?: string): number {
  const base = parseFloat(numeric.replace(/,/g, ''));
  if (!Number.isFinite(base)) return NaN;
  const unit = (suffix || '').toLowerCase();
  if (unit === 'k') return base * 1_000;
  if (unit === 'm') return base * 1_000_000;
  return base;
}

function normalizeTicker(raw: string): string | null {
  const ticker = raw.replace(/[^A-Za-z0-9.\-]/g, '').toUpperCase();
  if (!ticker || ticker.length > 15 || TICKER_STOPWORDS.has(ticker)) return null;
  return ticker;
}

function isAboveComparator(word: string): boolean {
  return /^(above|over|exceed|exceeds|beyond)$/i.test(word);
}

/**
 * Returns the first matching actionable intent, or { kind: 'none' } so the
 * message falls through to the Gemini endpoint as a normal question.
 */
export function parseChatIntent(input: string): ChatIntent {
  const text = input.trim();
  if (!text) return { kind: 'none' };

  // Risk-index alerts are checked before price alerts because a multi-word
  // subject like "Taiwan Strait" must not be mistaken for a ticker.
  const riskMatch = text.match(RISK_ALERT_RE);
  if (riskMatch) {
    const subject = riskMatch[1].replace(/\s+/g, ' ').trim();
    const threshold = parseFloat(riskMatch[3]);
    if (subject && Number.isFinite(threshold)) {
      return {
        kind: 'alert',
        subject: subject.replace(/\b\w/g, (c) => c.toUpperCase()),
        subjectType: 'risk-index',
        condition: isAboveComparator(riskMatch[2]) ? 'risk_above' : 'risk_below',
        threshold
      };
    }
  }

  const priceMatch = text.match(PRICE_ALERT_RE);
  if (priceMatch) {
    const ticker = normalizeTicker(priceMatch[1]);
    const threshold = parseAmount(priceMatch[3], priceMatch[4]);
    if (ticker && Number.isFinite(threshold) && threshold > 0) {
      return {
        kind: 'alert',
        subject: ticker,
        subjectType: 'stock',
        condition: isAboveComparator(priceMatch[2]) ? 'price_above' : 'price_below',
        threshold
      };
    }
  }

  const investMatch = text.match(INVEST_RE);
  if (investMatch) {
    const ticker = normalizeTicker(investMatch[3]);
    const amount = parseAmount(investMatch[1], investMatch[2]);
    if (ticker && Number.isFinite(amount)) {
      return { kind: 'trade', action: 'invest', ticker, amount };
    }
  }

  const withdrawMatch = text.match(WITHDRAW_RE);
  if (withdrawMatch) {
    const ticker = normalizeTicker(withdrawMatch[3]);
    const amount = parseAmount(withdrawMatch[1], withdrawMatch[2]);
    if (ticker && Number.isFinite(amount)) {
      return { kind: 'trade', action: 'withdraw', ticker, amount };
    }
  }

  return { kind: 'none' };
}

export interface ResolvedTicker {
  symbol: string;
  name: string;
  price: number;
}

/**
 * Confirms a ticker actually exists and returns its live price.
 *
 * /api/stocks/quote synthesises a price for *any* string, so it cannot validate
 * a symbol. /api/search is used instead and the result must match exactly.
 */
export async function resolveTicker(ticker: string): Promise<ResolvedTicker | null> {
  const symbol = ticker.toUpperCase();
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const match = (data.results || []).find(
      (r: any) => String(r.symbol).toUpperCase() === symbol
    );
    if (!match) return null;

    let price = Number(match.quote?.price);
    if (!Number.isFinite(price) || price <= 0) {
      const quoteRes = await fetch(`/api/stocks/quote?symbol=${encodeURIComponent(symbol)}`, {
        cache: 'no-store'
      });
      if (!quoteRes.ok) return null;
      price = Number((await quoteRes.json()).price);
    }
    if (!Number.isFinite(price) || price <= 0) return null;

    return { symbol, name: match.name || symbol, price };
  } catch {
    return null;
  }
}
