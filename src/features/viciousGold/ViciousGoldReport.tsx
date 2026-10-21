import { KpiGroup, type KpiItem } from '../../vendor/varylo-ui/data-display/KpiGroup';
import { archetypeClassBackdrop } from '../archetypeDetailModel';
import {
  classKey, isAggregateDeck, reportHighlights, reportWindowLabel, thresholdPercent,
  type ViciousGoldPayload,
} from './viciousGoldModel';

const UPDATED = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
});
const PERCENT: Intl.NumberFormatOptions = { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 };
const KPI_LABELS = { noData: 'Нет данных', loading: 'Загружаем отчёт' };

function updatedLabel(value: string | null): string | null {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? `${UPDATED.format(date)} МСК` : null;
}

/**
 * The report plate under the page banner: what the vS snapshot covers (window, update time,
 * sections) and its leaders as a KPI strip. The leader's class art stays a narrow strip on the
 * right and is hidden on phones, so it never outgrows the preloaded banner as the LCP element.
 */
export function ViciousGoldReport({ data }: { data: ViciousGoldPayload }) {
  const { leader, popular, topClass } = reportHighlights(data);
  const reportWindow = reportWindowLabel(data.timeRanges?.tierLadder ?? data.timeRanges?.distribution);
  const updated = updatedLabel(data.updatedAt);
  const backdrop = leader ? archetypeClassBackdrop(classKey(leader.class)) : null;
  const archetypes = data.deckDistribution.filter(deck => !isAggregateDeck(deck.deck)).length;
  const items: KpiItem[] = [
    { id: 'leader', label: 'Лидер Power Tier', value: leader ? leader.winrate / 100 : null, format: PERCENT, caption: leader?.deckLabel },
    { id: 'popular', label: 'Самая популярная', value: popular ? popular.frequency / 100 : null, format: PERCENT, caption: popular?.deckLabel },
    { id: 'class', label: 'Самый частый класс', value: topClass ? topClass.frequency / 100 : null, format: PERCENT, caption: topClass?.classLabel },
    { id: 'archetypes', label: 'Архетипов', value: archetypes, format: { maximumFractionDigits: 0 }, caption: `от ${thresholdPercent(data.minimumDeckFrequency)} партий` },
  ];

  return (
    <section className="vsgold-report" aria-labelledby="vsgold-report-title">
      {backdrop ? (
        <img className="vsgold-report__art" src={backdrop.src.replace('-1920.', '-960.')} style={{ objectPosition: backdrop.focus }}
          width={960} height={400} alt="" aria-hidden="true" loading="lazy" decoding="async"
          onError={event => { event.currentTarget.hidden = true; }} />
      ) : null}
      <div className="vsgold-report__copy">
        <p className="vsgold-report__eyebrow">Data Reaper Live · {data.format === 'Standard' ? 'Стандарт' : data.format}</p>
        <h2 id="vsgold-report-title">{reportWindow ? `Мета за ${reportWindow}` : 'Текущая мета'}</h2>
        <p className="vsgold-report__meta">
          {updated ? <span>Обновлено {updated}</span> : null}
          <span>
            {data.games.toLocaleString('ru-RU')} партий ·{' '}
            {data.sourceUrl ? <a href={data.sourceUrl} target="_blank" rel="noreferrer">Vicious Syndicate</a> : data.source}
          </span>
        </p>
        <ul className="vsgold-report__contents" aria-label="Что в отчёте">
          <li><a href="#vsgold-power"><b>Power Tier</b> {data.tierList.length} диапазонов рангов</a></li>
          <li><a href="#vsgold-classes"><b>Доли меты</b> {data.classDistribution.length} классов</a></li>
          <li><a href="#vsgold-decks"><b>Колоды</b> {archetypes} архетипов</a></li>
        </ul>
      </div>
      <KpiGroup className="vsgold-report__kpis hp-varylo hp-varylo--plate" items={items} minTileWidth={120}
        locale="ru-RU" labels={KPI_LABELS} aria-label="Главное в отчёте" />
    </section>
  );
}
