import type { ArchetypeRow, Comparison, StandardView } from '@/apps/public-web/lib/metaReportView';
import { REPORT_MIN_POPULARITY } from '@/apps/public-web/lib/metaReportView';
import { count, decimal, percent, periodLabel, points, rankLabel, reportDateLabel, sectionNote } from '@/apps/public-web/lib/metaReportText';

/** The archetype's own page when it is indexable (the open catalog decides), otherwise its name. */
export function ArchetypeName({ slug, name, linkable }: { slug: string | null; name: string; linkable: ReadonlySet<string> }) {
  return slug && linkable.has(slug) ? <a href={`/standard/archetypes/standard/${slug}/`}>{name}</a> : <>{name}</>;
}

function Delta({ value }: { value: number | null }) {
  const text = points(value);
  return text ? <span className="meta-report__delta">{text}</span> : null;
}

function Row({ row, place, compared, linkable }: { row: ArchetypeRow; place: number; compared: boolean; linkable: ReadonlySet<string> }) {
  return <tr>
    <td>{place}</td>
    <th scope="row">
      <ArchetypeName slug={row.slug} name={row.name} linkable={linkable} />
      {row.entered ? <span className="meta-report__new"> новый в топе</span> : null}
    </th>
    <td>{percent(row.winrate)}{compared ? <> <Delta value={row.winrateDelta} /></> : null}</td>
    <td>{percent(row.popularity)}{compared ? <> <Delta value={row.popularityDelta} /></> : null}</td>
    <td>{count(row.games)}{compared && row.gamesDelta !== null
      ? <span className="meta-report__delta"> +{count(row.gamesDelta)} за неделю</span> : null}</td>
  </tr>;
}

function Top({ id, title, rows, left, compared, linkable }: {
  id: string; title: string; rows: ArchetypeRow[]; left: string[]; compared: boolean; linkable: ReadonlySet<string>;
}) {
  return <>
    <h3 id={id}>{title}</h3>
    <div className="meta-report__table">
      <table aria-labelledby={id}>
        <thead><tr><th scope="col">#</th><th scope="col">Архетип</th><th scope="col">Винрейт</th>
          <th scope="col">Популярность</th><th scope="col">Игры</th></tr></thead>
        <tbody>{rows.map((row, index) => <Row key={row.slug} row={row} place={index + 1} compared={compared} linkable={linkable} />)}</tbody>
      </table>
    </div>
    {left.length ? <p>Выбыли из топа: {left.join(', ')}.</p> : null}
  </>;
}

function ComparisonNote({ comparison }: { comparison: Comparison }) {
  if (comparison.kind === 'first') return <p>Первый отчёт: изменений к прошлой неделе нет.</p>;
  if (comparison.kind === 'same-period') {
    return <p>
      Изменения к <a href={`/reports/meta/${comparison.previousDate}/`}>отчёту на {reportDateLabel(comparison.previousDate)}</a>
    </p>;
  }
  return <p>
    Сменился период HSGuru: {periodLabel(comparison.previousPeriod) ?? 'неизвестен'} → {periodLabel(comparison.period) ?? 'неизвестен'},
    изменений к прошлой неделе нет.
  </p>;
}

/** Standard, Diamond–Legend: the winrate top among archetypes of at least 0.5 % of games, and the popularity top. */
export function MetaReportStandard({ view, comparison, linkable }: { view: StandardView; comparison: Comparison; linkable: ReadonlySet<string> }) {
  const { data } = view;
  const compared = comparison.kind === 'same-period';
  const period = periodLabel(data.period);
  return <section aria-labelledby="meta-report-standard">
    <h2 id="meta-report-standard">Стандарт: {rankLabel(data.rank)}</h2>
    <p>
      {period ? `${period}, ` : ''}архетипы от {count(data.minGames)} игр
      {data.totalGames !== null ? `, всего ${count(data.totalGames)} игр в срезе` : ''}.
    </p>
    <ComparisonNote comparison={comparison} />
    <Top id="meta-report-standard-winrate" title={`Лучшие по винрейту (популярность от ${decimal(REPORT_MIN_POPULARITY)}%)`}
      rows={view.byWinrate} left={compared ? view.leftByWinrate : []} compared={compared} linkable={linkable} />
    <Top id="meta-report-standard-popularity" title="Самые популярные" rows={view.byPopularity}
      left={compared ? view.leftByPopularity : []} compared={compared} linkable={linkable} />
    <p className="meta-report__note">{sectionNote(view.section)}. <a href="/standard/meta/">Мета сейчас</a></p>
  </section>;
}
