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
      <p>
        Срез открытых данных HearthPulse в понедельник, {reportDateLabel(snapshot.date)}: Стандарт, матчапы, классы
        Арены и герои Полей сражений. Цифры зафиксированы в день среза и больше не меняются; актуальные данные — на
        живых страницах разделов.
      </p>
      {view.earlyData ? <p className="meta-report__warning">
        Патч вышел меньше чем за 72 часа до среза: данные ранние, выборка ещё набирается.
      </p> : null}
      <MetaReportStandard view={view.standard} comparison={view.comparison} linkable={linkable} />
      <MetaReportMatchups rows={view.matchups} section={sections.matchups}
        slugOf={archetype => slugs.get(archetype) ?? null} linkable={linkable} />
      <MetaReportArena view={view.arena} section={sections.arena} />
      <MetaReportHeroes heroes={view.heroes} section={sections.battlegrounds} mmr={sections.battlegrounds.data?.mmr ?? null} />
      <MetaReportPatch patch={view.patch} />
      <section aria-labelledby="meta-report-method">
        <h2 id="meta-report-method">Как собран отчёт</h2>
        <p>
          Каждый понедельник после 06:30 UTC сайт сохраняет то, что гость видит без подписки: открытую мету
          Стандарта (Алмаз — Легенда, от 100 игр), общий срез матчапов, классы Арены и героев Полей сражений.
          HSGuru копит игры внутри своего периода, поэтому изменения к прошлой неделе считаем только внутри одного
          периода. Ошибку в цифрах исправляем отдельной датированной заметкой, снимок не переписываем.
        </p>
      </section>
      <Neighbours previous={previous} next={next} />
    </article>
  </SharedPageShell>;
}

/** The archive (`/reports/meta/`): every report on record, newest first. */
export function MetaReportArchive({ dates }: { dates: string[] }) {
  return <SharedPageShell pathname="/reports/meta/">
    <article className="meta-report">
      <h1>Мета-отчёты Hearthstone по неделям</h1>
      <p>
        Каждый понедельник HearthPulse фиксирует открытые данные о мете: лучшие и самые популярные архетипы
        Стандарта, матчапы, классы Арены и героев Полей сражений. Отчёт не меняется после публикации, поэтому по
        архиву видно, как мета менялась от недели к неделе.
      </p>
      <ul className="meta-report__archive">
        {dates.map(date => <li key={date}><a href={reportPath(date)}>{reportTitle(date)}</a></li>)}
      </ul>
    </article>
  </SharedPageShell>;
}
