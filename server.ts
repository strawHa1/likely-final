import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { fetchHeadlines, fetchCompanyNews } from './newsApi.js';
import {
  getImpactState,
  refreshImpactData,
  manualRefreshImpact,
  initImpactService,
  startImpactCron,
  startImpactPricePolling
} from './impactService.js';
import {
  getWatchlist,
  searchWatchlist,
  addWatchlistEntry,
  removeWatchlistEntry,
  getStoredPortfolioHoldings,
  saveStoredPortfolioHoldings,
  getCompanyProfile,
  getLiveCountryRisk,
  computeLiveCountryRisk,
  fetchQuote,
  fetchQuotesBatch
} from './marketDataService.js';
import { searchMarketSymbols, refreshSearchQuotes, initSearchUniverse, lookupMarketSymbolLive, addCustomSymbol } from './searchService.js';
import {
  getTrendHistory,
  hasSnapshot,
  marketDateKey,
  recordCountryDailySnapshot,
  setTrendScoreProvider,
  setCountryHistoryComputer
} from './dashboardTrendService.js';
import {
  initDashboardTrendService,
  runDailySnapshotJob,
  snapshotHealthSummary,
  startDashboardTrendCron
} from './snapshotJobService.js';
import {
  getLiveAlertsPayload,
  startAlertEngine
} from './alertEngineService.js';
import { getDashboardIntelligence } from './dashboardIntelligenceService.js';
import {
  getReportsArchive,
  getReportById,
  generateIntelligenceReport,
  initReportEngine,
  startReportEngineCron
} from './reportEngineService.js';
import { getGeminiApiKey, getGeminiKeySource, loadProjectEnv, logGeminiKeyStatus, maskGeminiApiKey, persistGeminiKeyToEnv, sanitizeEnvValue } from './envConfig.js';
import {
  createGeminiClient,
  formatGeminiError,
  GEMINI_CHAT_MODELS,
  GEMINI_DEFAULT_MODEL,
  logRawGeminiError,
  validateGeminiKey
} from './geminiClient.js';
import {
  formatContextForPrompt,
  gatherLiveChatContext
} from './localChatService.js';

// Load .env then .env.local (if present). Missing .env.local must not block .env.
const envLoad = loadProjectEnv(process.cwd());
console.log('[AI] Env files loaded:', envLoad.loaded.length ? envLoad.loaded.join(' | ') : '(none)');
if (envLoad.errors.length) {
  console.warn('[AI] Env load warnings:', envLoad.errors.join(' | '));
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

const app = express();
const PORT = 3002;
const ENV_FILE_PATH = path.join(process.cwd(), '.env');

app.use(express.json());

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isLoopbackAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function authorizeSnapshotJob(req: express.Request): boolean {
  const secret = (process.env.SNAPSHOT_JOB_SECRET || '').trim();
  const provided = String(req.get('x-snapshot-job-secret') || req.query.secret || '');
  if (secret) return secretsMatch(provided, secret);
  return isLoopbackAddress(req.ip) || isLoopbackAddress(req.socket.remoteAddress);
}

// Initialize Gemini AI Client
const getGenAI = () => createGeminiClient();

// Base market prices baseline for realistic stock data
const STOCK_BASELINES: Record<string, { name: string; price: number; prevClose: number }> = {
  NVDA: { name: 'NVIDIA Corporation', price: 124.50, prevClose: 121.20 },
  AAPL: { name: 'Apple Inc.', price: 224.30, prevClose: 225.10 },
  TSM: { name: 'Taiwan Semiconductor Mfg.', price: 172.80, prevClose: 176.40 },
  MSFT: { name: 'Microsoft Corporation', price: 442.10, prevClose: 440.50 },
  AMZN: { name: 'Amazon.com Inc.', price: 186.20, prevClose: 184.90 },
  GOOGL: { name: 'Alphabet Inc.', price: 179.40, prevClose: 180.10 },
  XOM: { name: 'Exxon Mobil Corporation', price: 118.70, prevClose: 115.30 },
  LMT: { name: 'Lockheed Martin Corp.', price: 478.20, prevClose: 472.00 },
  JPM: { name: 'JPMorgan Chase & Co.', price: 208.50, prevClose: 207.10 },
  ASML: { name: 'ASML Holding N.V.', price: 845.00, prevClose: 860.20 },
  AMD: { name: 'Advanced Micro Devices', price: 154.20, prevClose: 151.80 },
  CVX: { name: 'Chevron Corporation', price: 158.40, prevClose: 156.10 },
  BA: { name: 'Boeing Company', price: 178.60, prevClose: 181.20 },
  RTX: { name: 'RTX Corporation', price: 102.30, prevClose: 101.50 },
  MA: { name: 'Mastercard Inc.', price: 452.80, prevClose: 450.10 }
};

// Helper: Check US market open status (9:30 AM - 4:00 PM ET on weekdays)
function isUSMarketOpen(): boolean {
  const now = new Date();
  const utcDay = now.getUTCDay();
  if (utcDay === 0 || utcDay === 6) return false; // Weekend

  // Convert to Eastern Time approximately (UTC - 4 or UTC - 5)
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const totalUtcMins = utcHour * 60 + utcMin;
  
  // 13:30 UTC to 20:00 UTC corresponds roughly to 9:30 AM - 4:00 PM ET
  return totalUtcMins >= 13 * 60 + 30 && totalUtcMins <= 20 * 60;
}

// Format current time with timezone tag
function getFormattedTimestamp(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }) + ' UTC';
}

/**
 * Real-time Stock Quote Endpoint
 * Tries Finnhub API first if API key is provided, or returns realistic live-ticking price quotes
 */
app.get('/api/stocks/quote', async (req, res) => {
  try {
    const symbol = ((req.query.symbol as string) || 'NVDA').toUpperCase().trim();
    const quote = await fetchQuote(symbol);
    if (!quote) {
      return res.status(404).json({ error: 'Quote not available for symbol' });
    }
    res.set('Cache-Control', 'no-store');
    res.json(quote);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Quote fetch failed' });
  }
});

/**
 * Batch Stock Quotes Endpoint (cached, parallel Finnhub)
 */
app.get('/api/stocks/quotes', async (req, res) => {
  try {
    const symbolsRaw = (req.query.symbols as string) || 'NVDA,AAPL,TSM,XOM,LMT';
    const symbols = symbolsRaw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const results = await fetchQuotesBatch(symbols);
    res.json(results);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Batch quote fetch failed' });
  }
});

/** Universal live symbol search (indexed local universe + filters) */
app.get(['/api/symbols/search', '/api/search'], async (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10) || 20, 50);
    const filters = {
      region: req.query.region as string | undefined,
      country: req.query.country as string | undefined,
      exchange: req.query.exchange as string | undefined,
      type: req.query.type as string | undefined
    };
    const data = await searchMarketSymbols(q, page, limit, filters);
    if (data.error) {
      return res.status(503).json(data);
    }
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Search failed', results: [], total: 0, hasMore: false });
  }
});

/** Live fallback lookup for companies not in database (4s timeout, rate-limited, cached 24h) */
app.get('/api/symbols/lookup', async (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || 'default';
    const data = await lookupMarketSymbolLive(q, clientIp);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Live lookup failed', results: [], fromLiveCount: 0 });
  }
});

/** Custom user symbol creation with live quote verification */
app.post('/api/symbols/custom', async (req, res) => {
  try {
    const { symbol, name, exchange, currency, country, sector, type } = req.body || {};
    const result = await addCustomSymbol({ symbol, name, exchange, currency, country, sector, type });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Failed to add custom symbol' });
  }
});

/** Live quote refresh for search dropdown (never long-cached) */
app.get('/api/search/quotes', async (req, res) => {
  try {
    const raw = (req.query.symbols as string) || '';
    const symbols = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (symbols.length === 0) return res.json({});
    const quotes = await refreshSearchQuotes(symbols);
    res.set('Cache-Control', 'no-store');
    res.json(quotes);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Quote refresh failed' });
  }
});

/** Watchlist search & retrieval */
app.get('/api/watchlist', (req, res) => {
  const q = (req.query.q as string) || '';
  const limit = Math.min(parseInt((req.query.limit as string) || '20', 10) || 20, 50);
  res.json({ entries: q ? searchWatchlist(q, limit) : getWatchlist(), count: getWatchlist().length });
});

/** Add ticker to user watchlist */
app.post('/api/watchlist', (req, res) => {
  try {
    const { ticker, companyName, sector, exchange, country, region } = req.body || {};
    if (!ticker) return res.status(400).json({ error: 'Ticker is required' });
    const entry = addWatchlistEntry({
      ticker,
      companyName: companyName || ticker,
      sector: sector || 'Diversified',
      exchange: exchange || 'US',
      country: country || 'United States',
      region: region || 'North America'
    });
    res.json({ ok: true, entry, entries: getWatchlist() });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to add to watchlist' });
  }
});

/** Remove ticker from user watchlist */
app.delete('/api/watchlist/:ticker', (req, res) => {
  try {
    removeWatchlistEntry(req.params.ticker);
    res.json({ ok: true, entries: getWatchlist() });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to remove from watchlist' });
  }
});

/** Get user portfolio holdings */
app.get('/api/portfolio', (req, res) => {
  try {
    const holdings = getStoredPortfolioHoldings();
    res.json({ holdings });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load portfolio' });
  }
});

/** Save user portfolio holdings */
app.post('/api/portfolio', (req, res) => {
  try {
    const holdings = req.body?.holdings;
    if (!Array.isArray(holdings)) return res.status(400).json({ error: 'Holdings must be an array' });
    saveStoredPortfolioHoldings(holdings);
    res.json({ ok: true, count: holdings.length });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to save portfolio' });
  }
});

/** Live FX Rates endpoint (ECB-based, cached 1 hour, fallback to institutional table) */
let serverCachedFxRates: Record<string, number> = {
  USD: 1.0,
  INR: 86.5,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 154.2,
  CAD: 1.39,
  AUD: 1.56,
  CHF: 0.88,
  SGD: 1.34,
  HKD: 7.78,
  KRW: 1395.0,
  TWD: 32.4,
  BRL: 5.85,
  SAR: 3.75,
  SEK: 10.6,
  DKK: 6.87,
  NOK: 10.85,
  ILS: 3.65,
  ZAR: 18.2,
  MXN: 20.3,
  TRY: 35.8,
  PLN: 4.02,
  NZD: 1.72
};
let serverFxRatesTimestamp = 0;

app.get('/api/fx/rates', async (req, res) => {
  const now = Date.now();
  if (now - serverFxRatesTimestamp > 3600000) {
    try {
      const response = await fetch('https://api.frankfurter.dev/v1/latest?base=USD');
      if (response.ok) {
        const data: any = await response.json();
        if (data && data.rates) {
          for (const [k, v] of Object.entries(data.rates)) {
            if (typeof v === 'number' && v > 0) {
              serverCachedFxRates[k] = v;
            }
          }
          serverFxRatesTimestamp = now;
        }
      }
    } catch {
      /* ignore */
    }
  }
  res.json({
    base: 'USD',
    rates: serverCachedFxRates,
    timestamp: serverFxRatesTimestamp || now,
    cached: true
  });
});

/** Full company profile + live quote + risk score */
app.get('/api/companies/:ticker', async (req, res) => {
  try {
    const profile = await getCompanyProfile(req.params.ticker);
    if (!profile) {
      return res.status(404).json({ error: 'Company not found', inWatchlist: false });
    }
    res.json(profile);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load company' });
  }
});

/** Global risk score 30-day trend (daily snapshots + headline backfill) */
app.get('/api/dashboard/trend', async (req, res) => {
  try {
    const force = req.query.refresh === 'true';
    if (force || !hasSnapshot()) {
      const job = await runDailySnapshotJob(force ? 'manual' : 'api');
      if (!job.ok) {
        console.warn('[Dashboard] trend fetch continued without a new snapshot:', job.error);
      }
    }
    const trend = getTrendHistory(30);
    res.set('Cache-Control', 'no-store');
    res.json({
      ...trend,
      lastUpdated: new Date().toISOString(),
      jobHealth: snapshotHealthSummary()
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load trend' });
  }
});

/** AI insights + recommended actions from live data + portfolio */
app.get('/api/dashboard/intelligence', async (req, res) => {
  try {
    const force = req.query.refresh === 'true';
    const data = await getDashboardIntelligence(force);
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (e: any) {
    console.error('Dashboard intelligence error:', e);
    res.status(500).json({ error: e?.message || 'Failed to load dashboard intelligence' });
  }
});

/** Live country risk scores from news headlines + impact pipeline */
app.get('/api/countries/risk', async (req, res) => {
  try {
    const force = req.query.refresh === 'true';
    const data = await getLiveCountryRisk(force);
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (e: any) {
    console.error('Country risk error:', e);
    res.status(500).json({ error: e?.message || 'Failed to load country risk' });
  }
});

/**
 * AI Reports Endpoints
 */
app.get('/api/reports', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const reports = getReportsArchive();
    res.json({ reports, count: reports.length });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to fetch reports archive' });
  }
});

app.get('/api/reports/:id', (req, res) => {
  try {
    const report = getReportById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to fetch report' });
  }
});

app.post('/api/reports/generate', async (req, res) => {
  try {
    const { topic, focusArea, preferredSeverity } = req.body || {};
    const report = await generateIntelligenceReport({ topic, focusArea, preferredSeverity });
    res.json(report);
  } catch (err: any) {
    console.error('[Reports] /api/reports/generate error:', err);
    res.status(500).json({ error: err?.message || 'Failed to generate report' });
  }
});

app.post('/api/reports/auto-generate', async (req, res) => {
  try {
    const report = await generateIntelligenceReport();
    res.json(report);
  } catch (err: any) {
    console.error('[Reports] /api/reports/auto-generate error:', err);
    res.status(500).json({ error: err?.message || 'Failed to auto-generate report' });
  }
});

const CHAT_SYSTEM_PROMPT = `You are the Black Swan AI Assistant, a general-purpose, highly capable financial risk intelligence assistant embedded in the Black Swan platform. You must:

- Understand and respond accurately to ANY question the user asks, whether it's small talk, general knowledge, a question about finance/markets/risk concepts, math, or a specific query about live platform data.
- Only include Black Swan's live data (risk scores, headlines, company risk, portfolio data) in your answer when the question is actually about that data. Do not force this data into unrelated answers.
- For general knowledge or conceptual questions (e.g. "what is a hedge fund", "explain P/E ratio", "what's the capital of France", "what's 25 * 4"), answer using your own knowledge accurately and concisely — do not dump portfolio or headline lists.
- For platform questions, explain based on the actual features of Black Swan (Dashboard, Global Events, Company Explorer, World Risk Map, AI Reports, Portfolio Risk, Alerts Center, trading, alerts).
- For trade or alert commands mentioned in chat, confirm the details clearly and remind the user that the UI will show a confirmation card before anything executes.
- Never repeat the same canned response for unrelated questions. Always generate a fresh, relevant answer to what was actually asked.
- If a question is ambiguous, ask a short clarifying question instead of guessing.

Format responses in Markdown when helpful (bold key terms, short lists). Keep answers clear, direct, and conversational.`;

/**
 * Translates the client's ChatMessage[] history into the Gemini `contents` shape.
 *
 * The client sends { sender, text }; the SDK expects { role, parts }. Gemini also
 * requires the history to open on a user turn, so the seeded assistant greeting is
 * dropped and only the most recent turns are forwarded.
 */
function buildChatHistory(history: unknown) {
  const mapped = (Array.isArray(history) ? history : [])
    .filter((h: any) => typeof h?.text === 'string' && h.text.trim().length > 0)
    .slice(-20)
    .map((h: any) => ({
      role: h.sender === 'user' ? 'user' : 'model',
      parts: [{ text: String(h.text) }]
    }));

  while (mapped.length > 0 && mapped[0].role !== 'user') {
    mapped.shift();
  }
  return mapped;
}

async function buildSystemInstruction(): Promise<string> {
  let liveBlock = '';
  try {
    liveBlock = '\n\n' + formatContextForPrompt(await gatherLiveChatContext());
  } catch (e: any) {
    console.warn('[AI] Live context gather failed:', e?.message || e);
  }
  return CHAT_SYSTEM_PROMPT + liveBlock;
}

function createChatSession(
  ai: GoogleGenAI,
  model: string,
  history: unknown,
  systemInstruction: string
) {
  return ai.chats.create({
    model,
    config: {
      systemInstruction,
      temperature: 0.5
    },
    history: buildChatHistory(history)
  });
}

const GEMINI_OFFLINE_ERROR =
  'Error: Gemini is not configured. Click **Add API Key** in the yellow banner (or paste a real `GEMINI_API_KEY` into `.env` — not `your_key_here` — then restart with `npm run dev`). Get a free key at https://aistudio.google.com/apikey';

/**
 * Try each known Flash model until one accepts the request. Logs the raw first
 * failure so a bad model ID is obvious in the server console.
 */
async function sendGeminiMessage(
  ai: GoogleGenAI,
  message: string,
  history: unknown,
  stream: boolean
): Promise<{ text: string; model: string; chunks?: AsyncGenerator<any> }> {
  console.log(`[AI] User message (${message.length} chars):`, message.slice(0, 200));
  const systemInstruction = await buildSystemInstruction();
  let lastError: unknown = null;

  for (const model of GEMINI_CHAT_MODELS) {
    try {
      console.log(`[AI] Trying Gemini model "${model}" (stream=${stream})…`);
      const chat = createChatSession(ai, model, history, systemInstruction);
      if (stream) {
        const chunks = await chat.sendMessageStream({ message });
        return { text: '', model, chunks };
      }
      const response = await chat.sendMessage({ message });
      console.log('[AI] Gemini raw response text:', JSON.stringify(response.text ?? null));
      const text = (response.text || '').trim();
      if (!text) throw new Error('Empty response.text from Gemini');
      return { text, model };
    } catch (err) {
      lastError = err;
      logRawGeminiError(`model ${model} failed`, err);
    }
  }

  throw lastError || new Error('All Gemini chat models failed');
}

/**
 * Dev / ops probe — confirms env loading and returns a one-shot Gemini reply
 * for the hardcoded ping so the UI can verify the pipeline quickly.
 */
app.get('/api/chat/status', (req, res) => {
  const key = getGeminiApiKey();
  const raw = String(process.env.GEMINI_API_KEY || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
  const rawMasked = !raw
    ? null
    : raw.length <= 8
      ? `${raw.slice(0, 2)}…(len ${raw.length})`
      : `${raw.slice(0, 4)}...${raw.slice(-4)} (len ${raw.length})`;
  res.json({
    ok: true,
    geminiConfigured: Boolean(key),
    geminiKeyPreview: key
      ? `${key.slice(0, 4)}...${key.slice(-4)} (len ${key.length})`
      : null,
    geminiEnvRawMasked: rawMasked,
    rejectedAsPlaceholder: Boolean(raw) && !key,
    keySource: getGeminiKeySource(),
    models: GEMINI_CHAT_MODELS,
    envFile: ENV_FILE_PATH
  });
});

/**
 * Validate a Gemini key against Google, activate it for this server process, and
 * optionally persist it to `.env` so restarts keep working.
 */
app.post('/api/chat/configure-key', async (req, res) => {
  const apiKey = sanitizeEnvValue(req.body?.apiKey);
  if (!apiKey) {
    return res.status(400).json({ error: 'Paste your Gemini API key first.' });
  }
  if (apiKey.length < 20) {
    return res.status(400).json({
      error: 'That key looks too short. Gemini keys start with AQ. (new) or AIza (legacy).'
    });
  }

  try {
    const validatedModel = await validateGeminiKey(apiKey);
    console.log(`[AI] configure-key validated via ${validatedModel}`);
  } catch (e: any) {
    logRawGeminiError('configure-key validation', e);
    return res.status(400).json({
      error: `Google rejected this key: ${formatGeminiError(e)}`
    });
  }

  const persist = req.body?.persist !== false;
  try {
    persistGeminiKeyToEnv(apiKey, ENV_FILE_PATH);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to save key' });
  }

  const active = getGeminiApiKey();
  console.log(`[AI] Gemini key configured via UI (${maskGeminiApiKey(active || apiKey)})`);
  return res.json({
    ok: true,
    geminiConfigured: true,
    geminiKeyPreview: active ? maskGeminiApiKey(active) : null,
    keySource: getGeminiKeySource(),
    persisted: persist
  });
});

app.post('/api/chat/ping', async (req, res) => {
  const message = 'Reply with exactly: pong';
  const ai = getGenAI();
  console.log('[AI] /api/chat/ping — geminiConfigured=', Boolean(ai));
  if (!ai) {
    return res.status(503).json({
      ok: false,
      source: 'none',
      geminiConfigured: false,
      error: GEMINI_OFFLINE_ERROR
    });
  }
  try {
    const { text, model } = await sendGeminiMessage(ai, message, [], false);
    return res.json({
      ok: true,
      source: 'gemini',
      geminiConfigured: true,
      model,
      reply: text
    });
  } catch (e: any) {
    logRawGeminiError('/api/chat/ping', e);
    return res.status(502).json({
      ok: false,
      geminiConfigured: true,
      error: `Error: ${formatGeminiError(e)}`
    });
  }
});

/**
 * Streaming chat endpoint (Server-Sent Events).
 * Every analytical / conversational message goes to Gemini — no canned replies.
 */
app.post('/api/chat/stream', async (req, res) => {
  const { message, history } = req.body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message required' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  const send = (payload: Record<string, unknown>) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  };

  let aborted = false;
  res.on('close', () => {
    if (!res.writableEnded) aborted = true;
  });

  const ai = getGenAI();
  if (!ai) {
    send({ error: GEMINI_OFFLINE_ERROR, degraded: true });
    send({ done: true, degraded: true });
    return res.end();
  }

  try {
    const { model, chunks } = await sendGeminiMessage(ai, message, history, true);
    let streamed = '';
    for await (const chunk of chunks!) {
      if (aborted) break;
      const delta = chunk.text;
      if (delta) {
        streamed += delta;
        send({ delta, source: 'gemini', model });
      }
    }
    console.log(
      `[AI] Streamed ${streamed.length} chars from ${model}:`,
      streamed.slice(0, 160).replace(/\n/g, ' ')
    );

    if (!aborted) {
      if (!streamed.trim()) {
        send({ error: 'Error: Gemini returned an empty response. Please try again.' });
      }
      send({ done: true, source: 'gemini', model });
    }
    res.end();
  } catch (e: any) {
    logRawGeminiError('Chat stream', e);
    if (!aborted) {
      send({ error: `Error: ${formatGeminiError(e)}` });
      send({ done: true });
    }
    res.end();
  }
});

/**
 * Non-streaming chat endpoint — client fallback when SSE cannot be read.
 */
app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message required' });
  }

  const ai = getGenAI();
  if (!ai) {
    return res.status(503).json({
      error: GEMINI_OFFLINE_ERROR,
      degraded: true,
      geminiConfigured: false
    });
  }

  try {
    const { text, model } = await sendGeminiMessage(ai, message, history, false);
    return res.json({ reply: text, degraded: false, source: 'gemini', model, geminiConfigured: true });
  } catch (e: any) {
    logRawGeminiError('/api/chat', e);
    return res.status(502).json({
      error: `Error: ${formatGeminiError(e)}`,
      geminiConfigured: true
    });
  }
});

app.post('/api/jobs/daily-snapshot', async (req, res) => {
  if (!authorizeSnapshotJob(req)) {
    return res.status(401).json({ error: 'Unauthorized snapshot job trigger' });
  }
  try {
    const job = await runDailySnapshotJob('scheduler');
    res.status(job.ok ? 200 : 500).json({ ...job, jobHealth: snapshotHealthSummary() });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Snapshot job failed' });
  }
});

// Health check endpoint — liveness stays 200; snapshotJob.ok is the job signal
app.get('/api/health', (req, res) => {
  const snapshotJob = snapshotHealthSummary();
  res.json({
    status: snapshotJob.lastAttemptAt && !snapshotJob.ok ? 'degraded' : 'ok',
    timestamp: new Date().toISOString(),
    snapshotJob
  });
});

/**
 * Live News Headlines — India & World
 * Uses GNews / NewsAPI / Finnhub when keys are set, otherwise RSS feeds.
 */
app.get('/api/news/headlines', async (req, res) => {
  try {
    const region = ((req.query.region as string) || 'all').toLowerCase() as 'india' | 'world' | 'all';
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10) || 20, 50);
    const validRegion = ['india', 'world', 'all'].includes(region) ? region : 'all';
    const { articles, source } = await fetchHeadlines(validRegion, limit);
    res.json({
      articles,
      source,
      region: validRegion,
      lastUpdated: new Date().toISOString(),
      count: articles.length
    });
  } catch (e: any) {
    console.error('News headlines error:', e);
    res.status(500).json({ error: 'Failed to fetch news headlines' });
  }
});

/**
 * Company-specific live news
 */
app.get('/api/news/company', async (req, res) => {
  try {
    const symbol = ((req.query.symbol as string) || 'NVDA').toUpperCase().trim();
    const limit = Math.min(parseInt((req.query.limit as string) || '10', 10) || 10, 25);
    const { articles, source } = await fetchCompanyNews(symbol, limit);
    res.json({
      articles,
      source,
      symbol,
      lastUpdated: new Date().toISOString(),
      count: articles.length
    });
  } catch (e: any) {
    console.error('Company news error:', e);
    res.status(500).json({ error: 'Failed to fetch company news' });
  }
});

/**
 * Stock Impact — news-to-price correlation pipeline
 */
app.get('/api/impact', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    if (req.query.refresh === 'true') {
      const refreshed = await refreshImpactData(true);
      return res.json(refreshed);
    }
    const current = getImpactState();
    // If cache is empty or older than 10 minutes, trigger background ingestion
    const age = current.lastUpdated ? Date.now() - new Date(current.lastUpdated).getTime() : Infinity;
    if ((age > 10 * 60 * 1000 || current.impactedCompanies.length === 0) && !current.isLoading) {
      refreshImpactData(true).catch((err) => console.error('[Impact] Auto background refresh failed:', err));
    }
    res.json(current);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load impact state' });
  }
});

app.get('/api/alerts', async (req, res) => {
  try {
    const payload = await getLiveAlertsPayload();
    res.set('Cache-Control', 'no-store');
    res.json(payload);
  } catch (e: any) {
    console.error('[Alerts] GET /api/alerts failed', e);
    res.status(500).json({ error: e?.message || 'Failed to load alerts' });
  }
});

app.post('/api/impact/refresh', async (req, res) => {
  try {
    const force = req.body?.force === true || req.query.force === 'true';
    if (force) {
      const refreshed = await refreshImpactData(true);
      return res.json(refreshed);
    }
    const result = await manualRefreshImpact();
    if (!result.ok) {
      return res.status(200).json({ notice: result.message, ...result.state });
    }
    res.json(result.state);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Refresh failed' });
  }
});

// Setup Vite or Static File Serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Black Swan Server running on http://localhost:${PORT}`);
    logGeminiKeyStatus(ENV_FILE_PATH);
    initImpactService();
    startImpactCron();
    startImpactPricePolling(30_000);
    initSearchUniverse();
    setCountryHistoryComputer((headlines) => {
      const data = computeLiveCountryRisk(
        headlines.map((h) => ({
          title: h.title,
          description: h.description,
          region: h.region,
          sentiment: h.sentiment as 'negative' | 'neutral' | 'positive'
        })),
        { includeImpact: false }
      );
      return data.countries.map((c) => ({ id: c.id, score: c.riskScore }));
    });
    setTrendScoreProvider(async () => {
      const data = await getLiveCountryRisk(true);
      const countries = data?.countries || [];
      if (countries.length === 0) {
        throw new Error('No country risk scores available for daily snapshot');
      }
      recordCountryDailySnapshot(
        countries.map((c: { id: string; riskScore: number }) => ({ id: c.id, score: c.riskScore })),
        marketDateKey(),
        'live'
      );
      const tracked = countries.filter((c: any) => c.eventsCount > 0 || c.isCurated);
      const target = tracked.length >= 5 ? tracked : countries.slice(0, 15);
      return Math.round(
        target.reduce((s: number, c: { riskScore: number }) => s + c.riskScore, 0) / target.length
      );
    });
    initDashboardTrendService();
    startDashboardTrendCron();
    startAlertEngine();
    initReportEngine().catch((err) => console.error('[Reports] Init failed:', err));
    startReportEngineCron();
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\nError: Port ${PORT} is already in use.\n` +
        `Stop the other server (Task Manager / kill node) or run: $env:PORT=3003; npm run dev\n`
      );
      process.exit(1);
    }
    throw err;
  });
}

startServer();
