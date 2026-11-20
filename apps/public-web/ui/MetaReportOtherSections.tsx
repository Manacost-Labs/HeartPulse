import type { ReportHero, ReportMatchups, ReportSection } from '@/apps/public-web/lib/publicMetaReportData';
import type { ArenaView, MatchupView, MetaReportView } from '@/apps/public-web/lib/metaReportView';
import { REPORT_MIN_ARENA_SAMPLE, REPORT_MIN_MATCHUP_GAMES } from '@/apps/public-web/lib/metaReportView';
import { count, decimal, mmrLabel, percent, periodLabel, reportDateLabel, sectionNote } from '@/apps/public-web/lib/metaReportText';
import { ArchetypeName } from './MetaReportStandard';

function Note({ section, href, live }: { section: ReportSection<unknown>; href: string; live: string }) {
  return <p className="meta-report__note">{sectionNote(section)}. <a href={href}>{live}</a></p>;
}

/** A section the snapshot has no data for: said once, without figures. */
function Missing({ id, title }: { id: string; title: string }) {
  return <section aria-labelledby={id}>
    <h2 id={id}>{title}</h2>
    <p>Нет данных: источник не ответил в день среза.</p>
  </section>;
}

const pair = (value: { opponent: string; winrate: number; games: number } | null) =>
  (value ? `${value.opponent} — ${percent(value.winrate)} (${count(value.games)} игр)` : 'нет пары с достаточной выборкой');

export function MetaReportMatchups({ rows, section, slugOf, linkable }: {
  rows: MatchupView[] | null; section: ReportSection<ReportMatchups>;
  slugOf: (archetype: string) => string | null; linkable: ReadonlySet<string>;
}) {
  if (!rows) return <Missing id="meta-report-matchups" title="Матчапы" />;
  const period = periodLabel(section.data?.period ?? null);
  return <section aria-labelledby="meta-report-matchups">
    <h2 id="meta-report-matchups">Матчапы самых популярных архетипов</h2>
    <p>Все ранги{period ? `, ${period}` : ''}, пары от {REPORT_MIN_MATCHUP_GAMES} игр</p>
    <ul className="meta-report__list">
      {rows.map(row => <li key={row.archetype}>
        <strong><ArchetypeName slug={slugOf(row.archetype)} name={row.label} linkable={linkable} /></strong>
        <span>Лучший матчап: {pair(row.best)}.</span>
        <span>Худший матчап: {pair(row.worst)}.</span>
      </li>)}
    </ul>
    <Note section={section} href="/standard/matchups/" live="Матчапы сейчас" />
  </section>;
}

export function MetaReportArena({ view, section }: { view: ArenaView | null; section: ReportSection<unknown> }) {
  if (!view) return <Missing id="meta-report-arena" title="Арена" />;
  const unit = view.sampleUnit === 'games' ? 'игр' : 'забегов';
  return <section aria-labelledby="meta-report-arena">
    <h2 id="meta-report-arena">Арена: классы по проценту побед</h2>
    <ol className="meta-report__list">
      {view.ranked.map(item => <li key={item.id} value={item.place}>
        {item.name} — {percent(item.winrate)}, {count(item.sample)} {unit}
      </li>)}
    </ol>
    {view.lowSample.length ? <p>
      Мало данных (меньше {REPORT_MIN_ARENA_SAMPLE} {unit}), без места в рейтинге:{' '}
      {view.lowSample.map(item => `${item.name} (${count(item.sample)})`).join(', ')}.
    </p> : null}
    <Note section={section} href="/classes/" live="Классы Арены сейчас" />
  </section>;
}

export function MetaReportHeroes({ heroes, section, mmr }: { heroes: ReportHero[] | null; section: ReportSection<unknown>; mmr: string | null }) {
  if (!heroes) return <Missing id="meta-report-heroes" title="Поля сражений" />;
  const rating = mmrLabel(mmr);
  return <section aria-labelledby="meta-report-heroes">
    <h2 id="meta-report-heroes">Поля сражений: лучшие герои</h2>
    <p>Одиночная игра{rating ? `, рейтинг «${rating}»` : ''}, по среднему месту</p>
    <ol className="meta-report__list">
      {heroes.map(hero => <li key={hero.dbfId}>
        <a href={`/heroes/${hero.dbfId}/`}>{hero.name}</a>
        {` — ${hero.tier ? `тир ${hero.tier}, ` : ''}среднее место ${hero.avgPlacement === null ? '—' : decimal(hero.avgPlacement, 2)}`}
        {`, топ-4 ${percent(hero.top4Rate)}`}
      </li>)}
    </ol>
    <Note section={section} href="/heroes/" live="Герои сейчас" />
  </section>;
}

export function MetaReportPatch({ patch }: { patch: MetaReportView['patch'] }) {
  return <section aria-labelledby="meta-report-patch">
    <h2 id="meta-report-patch">Патч недели</h2>
    {patch ? <p>
      {patch.thisWeek ? 'На этой неделе вышел' : 'Последний патч на день среза —'} патч {patch.version}
      {` (${reportDateLabel(patch.publishedAt.slice(0, 10))})`}.{' '}
      <a href="/standard/patches/">Изменения карт в патчноутах</a>
    </p> : <p>Список патчей в день среза не прочитан. <a href="/standard/patches/">Патчноуты</a></p>}
  </section>;
}
