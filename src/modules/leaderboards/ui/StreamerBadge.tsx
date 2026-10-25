import { Twitch } from 'lucide-react';
import type { LeaderboardStreamer } from '../model/types';

/**
 * Значок «стример» у ника: ссылка на страницу стримера на сайте. В строке
 * таблицы — только иконка (подпись — в имени ссылки и подсказке), в карточке
 * игрока — с текстом.
 */
export function StreamerBadge({ streamer, labelled = false }: { streamer: LeaderboardStreamer; labelled?: boolean }) {
  const label = `Стример ${streamer.name}`;
  return <a className={labelled ? 'leaderboards-streamer leaderboards-streamer--labelled' : 'leaderboards-streamer'}
    href={`/streamers/${encodeURIComponent(streamer.slug)}/`} title={labelled ? undefined : label} aria-label={labelled ? undefined : label}>
    <Twitch aria-hidden="true" />
    {labelled && <span>стример {streamer.name}</span>}
  </a>;
}
