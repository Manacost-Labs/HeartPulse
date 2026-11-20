import './MetaReportPage.css';
import '@/src/route-parchment.css';
import type { MetaReportSnapshot } from '@/apps/public-web/lib/publicMetaReportData';
import type { MetaReportView } from '@/apps/public-web/lib/metaReportView';
import { reportDateLabel, reportPath, reportTitle } from '@/apps/public-web/lib/metaReportText';
import { MetaReportStandard } from './MetaReportStandard';
import { MetaReportArena, MetaReportHeroes, MetaReportMatchups, MetaReportPatch } from './MetaReportOtherSections';
import { SharedPageShell } from './SharedPageShell';

function Neighbours({ previous, next }: { previous: string | null; next: string | null }) {
  return <nav className="meta-report__pager" aria-label="Другие отчёты">
    {previous ? <a href={reportPath(previous)} rel="prev">← Отчёт на {reportDateLabel(previous)}</a> : null}
    <a href="/reports/meta/">Все отчёты</a>
    {next ? <a href={reportPath(next)} rel="next">Отчёт на {reportDateLabel(next)} →</a> : null}
  </nav>;
}

/**
 * One weekly meta report (`/reports/meta/<date>/`): every figure comes from the
 * snapshot of that Monday, the changes from the snapshot before it. A server
 * component: the whole report is server HTML, only the shared site shell
 * hydrates. `linkable` are the archetype slugs whose pages are indexable now.
 */
export function MetaReportPage({ snapshot, view, previous, next, linkable }: {
  snapshot: MetaReportSnapshot; view: MetaReportView; previous: string | null; next: string | null; linkable: ReadonlySet<string>;
}) {
  const { sections } = snapshot;
  const slugs = new Map((sections.standard.data?.items ?? []).map(item => [item.archetype, item.slug]));
  return <SharedPageShell pathname={reportPath(snapshot.date)}>
    <article className="meta-report">
      <nav className="meta-report__crumbs" aria-label="Хлебные крошки">
        <a href="/">Главная</a> › <a href="/reports/meta/">Мета-отчёты</a> › <span>{reportDateLabel(snapshot.date)}</span>
      </nav>
      <h1>{reportTitle(snapshot.date)}</h1>
      <p className="meta-report__lead">
        Срез <time dateTime={snapshot.date}>{reportDateLabel(snapshot.date)}</time> · HSGuru, HSReplay
        {view.earlyData ? ' · ранние данные: патч вышел меньше чем за 72 часа до среза' : ''}
      </p>
      <details className="meta-report__about">
        <summary>Об отчёте</summary>
        Изменения к прошлому отчёту считаются только внутри одного периода HSGuru: в новом периоде игры копятся заново.
      </details>
      <MetaReportStandard view={view.standard} comparison={view.comparison} linkable={linkable} />
      <MetaReportMatchups rows={view.matchups} section={sections.matchups}
        slugOf={archetype => slugs.get(archetype) ?? null} linkable={linkable} />
      <MetaReportArena view={view.arena} section={sections.arena} />
      <MetaReportHeroes heroes={view.heroes} section={sections.battlegrounds} mmr={sections.battlegrounds.data?.mmr ?? null} />
      <MetaReportPatch patch={view.patch} />
      <Neighbours previous={previous} next={next} />
    </article>
  </SharedPageShell>;
}

function reportCount(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  const word = tens >= 11 && tens <= 14 ? 'отчётов' : ones === 1 ? 'отчёт' : ones >= 2 && ones <= 4 ? 'отчёта' : 'отчётов';
  return `${count} ${word}`;
}

/** The archive (`/reports/meta/`): every report on record, newest first. */
export function MetaReportArchive({ dates }: { dates: string[] }) {
  return <SharedPageShell pathname="/reports/meta/">
    <article className="meta-report">
      <h1>Мета-отчёты Hearthstone по неделям</h1>
      <p className="meta-report__lead">
        {reportCount(dates.length)}, последний — <time dateTime={dates[0]}>{reportDateLabel(dates[0])}</time>
      </p>
      <ul className="meta-report__archive">
        {dates.map(date => <li key={date}><a href={reportPath(date)}>{reportTitle(date)}</a></li>)}
      </ul>
    </article>
  </SharedPageShell>;
}
