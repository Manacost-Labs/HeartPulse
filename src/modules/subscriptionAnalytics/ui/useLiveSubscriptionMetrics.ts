'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SubscriptionMetrics } from '../model/types';
import { useAdminResource } from '../../adminWorkspace/public';
import { fetchSubscriptionMetrics, SubscriptionMetricsError, subscriptionMetricsKey, type SubscriptionMetricsErrorKind } from '../api/subscriptionMetricsClient';
import { startLivePolling } from '../model/livePolling';
import { isSubscriptionDataStale, SUBSCRIPTION_POLL_INTERVAL_MS } from '../model/subscriptionFreshness';
import { buildSubscriptionTiles, type SubscriptionTile } from '../model/subscriptionTiles';

export interface LiveSubscriptionMetrics {
  /** Последний принятый ответ; остаётся на экране, пока грузится следующий или опрос упал. */
  metrics: SubscriptionMetrics | undefined;
  tiles: SubscriptionTile[];
  /** Данных ещё нет — показывать скелетон. */
  loading: boolean;
  /** Идёт запрос при уже показанных данных: индикатор без мигания. */
  refreshing: boolean;
  /** Ошибка последнего опроса; прежние данные при этом не стираются. */
  error: Error | null;
  errorKind: SubscriptionMetricsErrorKind | null;
  /** Когда пришёл последний успешный ответ HearthPulse (мс эпохи): для «обновлено N секунд назад». */
  updatedAt: number | null;
  /** Время последнего принятого опроса Boosty (мс эпохи) — по нему судят о свежести данных. */
  lastPollAt: number | null;
  /** Последний опрос Boosty старше ~15 минут (или опросов нет). */
  stale: boolean;
  /** Спросить сервер сейчас («Обновить»). */
  reload: () => Promise<void>;
}

/** Текущее время, обновляемое раз в `intervalMs`, чтобы «устарело» и возраст данных менялись без ответа сервера. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(handle);
  }, [intervalMs]);
  return now;
}

/**
 * Метрики подписок Boosty за `days` дней с живым обновлением: опрос раз в 60 с, пауза на скрытой
 * вкладке, запрос сразу при возврате. Данные не мигают: пока идёт запрос и после ошибки на экране
 * остаются прежние. Если источник ещё недоступен (502), ошибка снимется на следующем опросе.
 */
export function useLiveSubscriptionMetrics(days: number): LiveSubscriptionMetrics {
  const resource = useAdminResource<SubscriptionMetrics>(
    subscriptionMetricsKey(days),
    () => fetchSubscriptionMetrics(days),
    { keepPrevious: true },
  );
  const { reload } = resource;
  useEffect(() => startLivePolling(() => { void reload(); }, SUBSCRIPTION_POLL_INTERVAL_MS), [reload]);
  const now = useNow(15_000);
  const { data: metrics } = resource;
  const tiles = useMemo(() => (metrics ? buildSubscriptionTiles(metrics) : []), [metrics]);
  const lastPoll = metrics?.coverage.lastAcceptedPollAt ? Date.parse(metrics.coverage.lastAcceptedPollAt) : Number.NaN;
  return {
    metrics,
    tiles,
    loading: resource.loading,
    refreshing: resource.refreshing,
    error: resource.error,
    errorKind: resource.error instanceof SubscriptionMetricsError ? resource.error.kind : resource.error ? 'network' : null,
    updatedAt: resource.updatedAt,
    lastPollAt: Number.isFinite(lastPoll) ? lastPoll : null,
    stale: metrics ? isSubscriptionDataStale(metrics, now) : false,
    reload,
  };
}
