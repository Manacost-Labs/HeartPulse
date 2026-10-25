'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import {
  isLeaderboardSeasonCatalog, isLeaderboardStats, isLeaderboardTable, leaderboardApiQuery, leaderboardSearch, pageOfRank,
  type LeaderboardSelection,
} from '../model/leaderboardsView';
import type { LeaderboardPlayer, LeaderboardSeasonCatalog, LeaderboardStats, LeaderboardTable } from '../model/types';

export type Loadable<T> = {
  /** Запрос, которому принадлежит состояние; новый ключ — новая загрузка. */
  key: string;
  status: 'loading' | 'ready' | 'missing' | 'error';
  /** Последнее успешное значение: остаётся на экране, пока грузится следующее. */
  value: T | null;
};

export type LeaderboardsInitial = {
  selection: LeaderboardSelection;
  catalog: LeaderboardSeasonCatalog | null;
  table: LeaderboardTable | null;
  stats: LeaderboardStats | null;
};

function ready<T>(key: string, value: T | null): Loadable<T> {
  return value ? { key, status: 'ready', value } : { key: '', status: 'loading', value: null };
}

/** Загружает `url` для ключа `key`, сохраняя прежнее значение до ответа; 404 — `missing`. */
function useLoadable<T>(key: string | null, url: string, accept: (value: unknown) => value is T, initial: Loadable<T>, attempt: number) {
  const [state, setState] = useState(initial);
  // Ключ и статус последнего состояния: эффект пропускает уже загруженный ключ, а ошибку повторяет по `attempt`.
  const settled = useRef(initial.status === 'ready' ? initial.key : '');
  useEffect(() => {
    if (key === null || settled.current === key) return undefined;
    const controller = new AbortController();
    setState(previous => ({ key, status: 'loading', value: previous.value }));
    void fetchWithDeadline(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async response => {
        if (response.status === 404) return 'missing' as const;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const value: unknown = await response.json();
        if (!accept(value)) throw new Error('Unexpected leaderboard response');
        return value;
      })
      .then(result => {
        if (controller.signal.aborted) return;
        settled.current = key;
        setState(result === 'missing' ? { key, status: 'missing', value: null } : { key, status: 'ready', value: result });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState(previous => ({ key, status: 'error', value: previous.value }));
      });
    return () => controller.abort();
  }, [key, url, accept, attempt]);
  return state;
}

function isPlayer(value: unknown): value is LeaderboardPlayer {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as { seasons?: unknown }).seasons);
}

/**
 * Состояние страницы таблиц лидеров: выбор режима, региона, сезона, страницы,
 * поиска и игрока живёт в строке адреса (ссылкой можно поделиться), данные
 * грузятся из `/api/leaderboards/*`. Первый кадр приходит с сервера.
 */
export function useLeaderboards(initial: LeaderboardsInitial) {
  const [selection, setSelection] = useState(initial.selection);
  const [attempt, setAttempt] = useState(0);
  const tableKey = leaderboardApiQuery(selection, true);
  const statsKey = leaderboardApiQuery(selection, false);
  const initialTableKey = leaderboardApiQuery(initial.selection, true);
  const initialStatsKey = leaderboardApiQuery(initial.selection, false);

  const catalog = useLoadable('seasons', '/api/leaderboards/seasons', isLeaderboardSeasonCatalog, ready('seasons', initial.catalog), attempt);
  const table = useLoadable(tableKey, `/api/leaderboards/table?${tableKey}`, isLeaderboardTable, ready(initialTableKey, initial.table), attempt);
  const stats = useLoadable(statsKey, `/api/leaderboards/stats?${statsKey}`, isLeaderboardStats, ready(initialStatsKey, initial.stats), attempt);
  const playerKey = selection.player ? new URLSearchParams({ region: selection.region, name: selection.player }).toString() : null;
  const player = useLoadable(playerKey, `/api/leaderboards/player?${playerKey ?? ''}`, isPlayer, { key: '', status: 'loading', value: null }, attempt);

  useEffect(() => {
    const target = `${window.location.pathname}${leaderboardSearch(selection)}`;
    if (target !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, '', target);
  }, [selection]);

  const select = useCallback((change: Partial<LeaderboardSelection>) => {
    setSelection(current => {
      const next = { ...current, ...change };
      // Другая таблица или другой поиск начинаются с первой страницы; другой регион — другой игрок.
      if (change.mode !== undefined || change.region !== undefined) next.season = change.season ?? null;
      if (change.mode !== undefined || change.region !== undefined || change.season !== undefined || change.query !== undefined) next.page = change.page ?? 1;
      if (change.region !== undefined && change.region !== current.region) next.player = change.player ?? null;
      // Переход к месту открывает его страницу без поиска; любой другой выбор страницы забывает место.
      if (change.rank !== undefined && change.rank !== null) {
        next.page = pageOfRank(change.rank);
        next.query = '';
      } else if (change.rank === undefined && (change.page !== undefined || next.page !== current.page || next.query !== current.query
        || next.mode !== current.mode || next.region !== current.region || next.season !== current.season)) {
        next.rank = null;
      }
      return next;
    });
  }, []);

  return { selection, select, catalog, table, stats, player, retry: () => setAttempt(value => value + 1) };
}
