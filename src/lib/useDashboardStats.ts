import { useState, useEffect, useCallback, useRef } from 'react';
import { GlobalEvent, AlertItem, LiveCountryRisk, StockImpactRecord } from '../types';
import { fetchHeadlines, NEWS_POLL_INTERVAL_MS } from './newsService';
import {
  computeSentiment,
  displayCountryName,
  isBlackSwanEvent,
  isDataFresh,
  scoreDeltaFromTrend,
  severityFromScore,
  uniqueTitles,
  type SentimentBreakdown
} from './dashboardMetrics';

export interface TrendPoint {
  day: string;
  score: number | null;
  recordedScore?: number | null;
  date?: string;
  source?: string;
}

export interface DashboardSentiment extends SentimentBreakdown {}

export interface DashboardStats {
  globalRiskScore: number;
  globalRiskSeverity: 'critical' | 'high' | 'medium' | 'low';
  scoreDelta: number | null;
  activeBlackSwans: number;
  liveEventsToday: number;
  criticalFocus: string;
  companiesAtRisk: number;
  highRiskTickers: string[];
  atRiskTickers: string[];
  criticalAlerts: number;
  topCriticalTitle: string;
  sentiment: DashboardSentiment;
  trend: TrendPoint[];
  trendHigh: number;
  trendSnapshotCount: number;
  trendEstimatedCount: number;
  snapshotJob: {
    ok: boolean;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastSuccessDate: string | null;
    lastError: string | null;
    unrecoverableDays: string[];
    todayHasSnapshot: boolean;
  } | null;
  topCountries: LiveCountryRisk[];
  mapCountries: LiveCountryRisk[];
  trackedCountryCount: number;
  lastUpdated: string | null;
  dataFresh: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  partialFailure: boolean;
}

async function readJson(res: Response | null): Promise<any | null> {
  if (!res || !res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function useDashboardStats(events: GlobalEvent[], alerts: AlertItem[]) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventsRef = useRef(events);
  const alertsRef = useRef(alerts);
  eventsRef.current = events;
  alertsRef.current = alerts;

  const mounted = useRef(true);
  const inFlight = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef<(force?: boolean) => Promise<void>>(async () => {});

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const load = useCallback(async (force = false) => {
    if (!mounted.current || inFlight.current) return;
    inFlight.current = true;
    if (force) setRefreshing(true);

    try {
      const [countrySettled, impactSettled, headlineFeed, trendSettled] = await Promise.all([
        fetch(`/api/countries/risk${force ? '?refresh=true' : ''}`, { cache: 'no-store' })
          .then((r) => r)
          .catch(() => null),
        fetch('/api/impact', { cache: 'no-store' })
          .then((r) => r)
          .catch(() => null),
        fetchHeadlines('all', 30),
        fetch(`/api/dashboard/trend${force ? '?refresh=true' : ''}`, { cache: 'no-store' })
          .then((r) => r)
          .catch(() => null)
      ]);

      const countryData = await readJson(countrySettled);
      const impactData = await readJson(impactSettled);
      const trendData = (await readJson(trendSettled)) || { points: [], snapshotCount: 0 };

      const countries: LiveCountryRisk[] = countryData?.countries || [];
      const articles = headlineFeed.articles || [];
      const liveEvents = eventsRef.current;
      const liveAlerts = alertsRef.current;

      if (!countryData && !impactData && articles.length === 0 && !trendData.points?.length) {
        throw new Error('Failed to load dashboard data');
      }

      const activeOrCurated = countries.filter((c) => c.eventsCount > 0 || c.isCurated);
      const scoreCountries = activeOrCurated.length >= 5 ? activeOrCurated : countries.slice(0, 15);
      const globalRiskScore =
        scoreCountries.length > 0
          ? Math.round(scoreCountries.reduce((s, c) => s + c.riskScore, 0) / scoreCountries.length)
          : 50;

      const trend: TrendPoint[] = trendData.points || [];
      const recordedTrend = trend.map((t) => ({
        score:
          t.source === 'live' || t.source === 'headline-backfill'
            ? t.score
            : t.recordedScore ?? null
      }));
      const recordedScores = recordedTrend
        .map((t) => t.score)
        .filter((s): s is number => s != null && Number.isFinite(s));
      const trendHigh = recordedScores.length > 0 ? Math.max(...recordedScores) : globalRiskScore;
      const scoreDelta = scoreDeltaFromTrend(globalRiskScore, recordedTrend);

      const blackSwans = liveEvents.filter(isBlackSwanEvent);
      const liveEventsToday = liveEvents.filter((e) => e.isLive).length;

      const topCountries = [...countries].sort((a, b) => b.riskScore - a.riskScore).slice(0, 3);
      const criticalFocus =
        topCountries.length > 0
          ? topCountries.map((c) => displayCountryName(c.name)).join(' & ')
          : 'Monitoring global feeds';

      const impacted: StockImpactRecord[] = impactData?.impactedCompanies || [];
      const atRiskTickers = [...new Set(impacted.map((r) => r.ticker))];
      const highRiskTickers = [
        ...new Set(
          impacted
            .filter((r) => r.severity === 'critical' || r.severity === 'high')
            .map((r) => r.ticker)
        )
      ].slice(0, 3);

      const criticalEvents = uniqueTitles(liveEvents.filter((e) => e.severity === 'critical'));
      const unreadCriticalAlerts = uniqueTitles(
        liveAlerts.filter((a) => !a.read && a.severity === 'critical')
      );
      const alertKeys = new Set(criticalEvents.map((e) => (e.title || '').trim().toLowerCase()));
      const uniqueAlertExtras = unreadCriticalAlerts.filter(
        (a) => !alertKeys.has((a.title || '').trim().toLowerCase())
      );
      const criticalAlerts = criticalEvents.length + uniqueAlertExtras.length;
      const topCriticalTitle =
        criticalEvents[0]?.title ||
        uniqueAlertExtras[0]?.title ||
        blackSwans[0]?.title ||
        liveEvents[0]?.title ||
        'No critical alerts';

      const lastUpdated = new Date().toISOString();
      const partialFailure = !countryData || !impactData;

      if (!mounted.current) return;

      setStats({
        globalRiskScore,
        globalRiskSeverity: severityFromScore(globalRiskScore),
        scoreDelta,
        activeBlackSwans: blackSwans.length,
        liveEventsToday,
        criticalFocus,
        companiesAtRisk: atRiskTickers.length,
        highRiskTickers,
        atRiskTickers,
        criticalAlerts,
        topCriticalTitle,
        sentiment: computeSentiment(articles),
        trend,
        trendHigh,
        trendSnapshotCount: trendData.recordedCount ?? recordedScores.length,
        trendEstimatedCount: trendData.estimatedCount ?? 0,
        snapshotJob: trendData.jobHealth ?? null,
        topCountries,
        mapCountries: countries,
        trackedCountryCount: countries.length,
        lastUpdated,
        dataFresh: isDataFresh(lastUpdated),
        loading: false,
        refreshing: false,
        error: null,
        partialFailure
      });
      setLoading(false);
      setRefreshing(false);
      setError(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Dashboard data unavailable';
      console.error('[Dashboard] stats load failed:', e);
      if (mounted.current) {
        setError(message);
        setLoading(false);
        setRefreshing(false);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        clearTimer();
        timeoutRef.current = setTimeout(() => {
          void loadRef.current(false);
        }, NEWS_POLL_INTERVAL_MS);
      }
    }
  }, [clearTimer]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    mounted.current = true;
    void load(false);
    return () => {
      mounted.current = false;
      inFlight.current = false;
      clearTimer();
    };
  }, [load, clearTimer]);

  return {
    stats,
    loading,
    refreshing,
    error,
    refresh: () => {
      clearTimer();
      void load(true);
    }
  };
}
