import './BattlegroundHeroPublicStats.css';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import {
  formatHeroFigure, heroStatsModeLabel, HERO_STATS_MODES,
  type PublicBattlegroundHeroModeStats, type PublicBattlegroundHeroStats,
} from '@/apps/public-web/lib/publicBattlegroundHeroStats';

type HeroPower = { name: string; text: string | null };

function ModeStats({ mode, stats, id }: { mode: 'solo' | 'duos'; stats: PublicBattlegroundHeroModeStats; id: string }) {
  const label = heroStatsModeLabel(mode);
  return <section id={id} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>{`Статистика героя — ${label}`}</h2>
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
 * What a guest and a robot get on `/heroes/<id>/` in the server HTML: tier, average place, top-4 share, pick
 * rate, place in the ranking, best build and key minions of the base range («Топ 50%») for solo and duos, with the
 * date and source of the data. The same markup for everyone; the closed part (other rating ranges, placement
 * distribution, builds with metrics, patch history) lives in `.paywalled-hero` (see the page's JSON-LD).
 */
export function BattlegroundHeroPublicStats({ stats, heroPower }: {
  stats: PublicBattlegroundHeroStats | null; heroPower: HeroPower | null;
}) {
  const date = stats ? seoDataDate(stats.updatedAt, Date.now()) : null;
  return <div className="bg-hero-public">
    {heroPower ? <section id="hero-power" aria-labelledby="hero-power-title">
      <h2 id="hero-power-title">Сила героя</h2>
      <p><strong>{heroPower.name}</strong>{heroPower.text ? `: ${heroPower.text}` : ''}</p>
    </section> : null}
    {stats ? HERO_STATS_MODES.map(mode => {
      const values = stats.modes[mode];
      return values ? <ModeStats key={mode} mode={mode} id={`hero-${mode}`} stats={values} /> : null;
    }) : null}
    {stats ? <p>
      {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : 'Дата обновления неизвестна'}
      {`${stats.source ? ` · источник ${stats.source}` : ''} · рейтинг «Топ 50%».`}
    </p> : null}
  </div>;
}
