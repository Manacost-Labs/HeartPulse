'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import { isLeaderboardRegion, leaderboardSeasons, type LeaderboardSelection } from '../model/leaderboardsView';
import type { LeaderboardPlayer, LeaderboardRegion, LeaderboardSeasonCatalog } from '../model/types';

export type MyNick = { name: string; region: LeaderboardRegion };

const STORAGE_KEY = 'hearthpulse.leaderboards.me';

function readMyNick(): MyNick | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    const nick = value as Partial<MyNick> | null;
    return nick && typeof nick.name === 'string' && nick.name.trim() && nick.name.length <= 64 && isLeaderboardRegion(nick.region)
      ? { name: nick.name.trim(), region: nick.region }
      : null;
  } catch {
    return null;
  }
}

/**
 * «Мой ник» — удобство одного браузера: сайт не знает BattleTag зрителя, а
 * Blizzard показывает ник без номера, поэтому зритель отмечает себя сам
 * кнопкой «Это я» в карточке игрока. Без хранилища (приватное окно) кнопки
 * просто нет. До гидратации ник неизвестен, чтобы HTML сервера совпал.
 */
export function useMyNick() {
  const [nick, setNick] = useState<MyNick | null>(null);
  useEffect(() => { setNick(readMyNick()); }, []);
  const save = useCallback((next: MyNick | null) => {
    setNick(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Хранилище недоступно: ник живёт до перезагрузки.
    }
  }, []);
  return [nick, save] as const;
}

/** Место ника в выбранной таблице (режим и сезон; без сезона — новейший сохранённый в его регионе). */
export function myNickRank(player: LeaderboardPlayer, selection: LeaderboardSelection, catalog: LeaderboardSeasonCatalog | null): number | null {
  const season = selection.season ?? leaderboardSeasons(catalog, selection.mode, player.region)[0]?.id ?? null;
  const entry = player.seasons.find(item => item.mode === selection.mode && item.season === season && item.inLatest);
  return entry?.lastRank ?? null;
}

/**
 * «К моему нику»: читает профиль ника и переходит к его месту в таблице того
 * же режима и сезона, открыв карточку. Ника в таблице нет — карточка всё
 * равно открывается (там его другие сезоны), а под панелью — короткое пояснение.
 */
export function useJumpToMyNick(selection: LeaderboardSelection, catalog: LeaderboardSeasonCatalog | null,
  select: (change: Partial<LeaderboardSelection>) => void) {
  // Пояснение относится к таблице, где его показали: другой режим, регион или сезон его прячут.
  const [note, setNote] = useState<{ table: string; text: string } | null>(null);
  const tableOf = (region: LeaderboardRegion) => `${selection.mode}|${region}|${selection.season}`;
  const go = useCallback(async (nick: MyNick) => {
    setNote(null);
    const table = `${selection.mode}|${nick.region}|${selection.season}`;
    try {
      const response = await fetchWithDeadline(`/api/leaderboards/player?${new URLSearchParams({ region: nick.region, name: nick.name })}`,
        { headers: { Accept: 'application/json' } });
      const player = response.ok ? await response.json() as LeaderboardPlayer : null;
      const rank = player && Array.isArray(player.seasons) ? myNickRank(player, { ...selection, region: nick.region }, catalog) : null;
      if (rank !== null) {
        select({ region: nick.region, season: selection.season, player: nick.name, rank });
        return;
      }
      select({ region: nick.region, season: selection.season, player: nick.name });
      setNote({ table, text: `Ника «${nick.name}» нет в этой таблице.` });
    } catch {
      setNote({ table, text: 'Не удалось найти ваш ник. Попробуйте ещё раз.' });
    }
  }, [selection, catalog, select]);
  return { go, message: note && note.table === tableOf(selection.region) ? note.text : null };
}
