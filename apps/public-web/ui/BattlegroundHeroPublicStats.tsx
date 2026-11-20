import './BattlegroundHeroPublicStats.css';
import type { SeoDataDate } from '@/apps/public-web/lib/seoDataDate';
import {
  formatHeroFigure, heroStatsModeLabel, HERO_STATS_MODES,
  type PublicBattlegroundHeroModeStats, type PublicBattlegroundHeroStats,
} from '@/apps/public-web/lib/publicBattlegroundHeroStats';

function ModeStats({ mode, stats, id }: { mode: 'solo' | 'duos'; stats: PublicBattlegroundHeroModeStats; id: string }) {
  const label = heroStatsModeLabel(mode);
  return <section id={id} aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>{`Статистика героя — ${label}`}</h3>
    <dl className="bg-hero-public__grid">
      <div><dt>Тир</dt><dd>{stats.tier}</dd></div>
      <div><dt>Среднее место</dt><dd>{formatHeroFigure(stats.avgPlacement, 2)}</dd></div>
      {stats.top4Rate !== null ? <div><dt>Топ-4</dt><dd>{`${formatHeroFigure(stats.top4Rate, 1)}%`}</dd></div> : null}
      {stats.pickRate !== null ? <div><dt>Выбор</dt><dd>{`${formatHeroFigure(stats.pickRate, 1)}%`}</dd></div> : null}
      {stats.games !== null ? <div><dt>Игр в выборке</dt><dd>{stats.games.toLocaleString('ru-RU')}</dd></div> : null}
      <div><dt>Место в рейтинге</dt><dd>{`${stats.rank} из ${stats.of}`}</dd></div>
      {stats.bestComposition ? <div><dt>Лучшая сборка</dt><dd className="bg-hero-public__text">{stats.bestComposition}</dd></div> : null}
      {stats.keyMinions.length ? <div><dt>Ключевые существа</dt><dd className="bg-hero-public__text">{stats.keyMinions.join(', ')}</dd></div> : null}
    </dl>
  </section>;
}

/**
 * The open figures of a hero in the «Обзор» tab of a guest's statistics block: tier, average place, top-4 share, pick
 * rate, place in the ranking, best build and key minions of the base range («Топ 50%») for solo and duos, with the
 * date and source of the data. The same markup for a guest and a robot, rendered on the server. `date` is computed
 * once on the server, so hydration in the browser (another clock) prints the same text.
 */
export function BattlegroundHeroPublicStats({ stats, date }: { stats: PublicBattlegroundHeroStats; date: SeoDataDate | null }) {
  return <div className="bg-hero-public">
    {HERO_STATS_MODES.map(mode => {
      const values = stats.modes[mode];
      return values ? <ModeStats key={mode} mode={mode} id={`hero-${mode}`} stats={values} /> : null;
    })}
    <p>
      {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : 'Дата обновления неизвестна'}
      {`${stats.source ? ` · источник ${stats.source}` : ''} · рейтинг «Топ 50%».`}
    </p>
  </div>;
}
