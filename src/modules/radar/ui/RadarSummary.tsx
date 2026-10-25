import { Radar } from 'lucide-react';
import {
  RADAR_KIND_LABELS, formatRadarTime, radarLead, type RadarChangeItem, type RadarChanges, type RadarReport,
} from '../model/radarView';
import { RadarMore } from './RadarMore';

const CHANGE_GROUPS: Array<{ key: keyof Omit<RadarChanges, 'previousAt'>; title: string }> = [
  { key: 'added', title: 'Новые' }, { key: 'risen', title: 'Выросли' }, { key: 'fallen', title: 'Упали' }, { key: 'removed', title: 'Выбыли' },
];

function ChangeItem({ item }: { item: RadarChangeItem }) {
  return <li>
    <span className="radar-changes__name">{item.name}</span>
    <span className="radar-changes__meta">
      {item.side === 'nerfs' ? 'нерф' : 'бафф'} · {RADAR_KIND_LABELS[item.kind].toLowerCase()}
    </span>
    {item.delta !== null && item.delta !== 0
      ? <span className="radar-changes__value" data-tone={item.delta > 0 ? 'up' : 'down'}>{item.delta > 0 ? '+' : '−'}{Math.abs(item.delta)}</span>
      : item.confidence !== null && <span className="radar-changes__value">{item.confidence}</span>}
  </li>;
}

/** «С прошлого прогона»: новые, выросшие, упавшие и выбывшие кандидаты, по пять в группе. */
function RadarChangesBlock({ changes }: { changes: RadarChanges }) {
  const groups = CHANGE_GROUPS.filter(group => changes[group.key].length);
  return <div className="radar-changes">
    <h3 className="radar-changes__title">С прошлого прогона{changes.previousAt && <span> · {formatRadarTime(changes.previousAt)}</span>}</h3>
    <div className="radar-changes__groups">
      {groups.map(group => <div key={group.key} className="radar-changes__group">
        <h4>{group.title}</h4>
        <ul>{changes[group.key].map((item, index) => <ChangeItem key={`${index}:${item.name}`} item={item} />)}</ul>
      </div>)}
    </div>
  </div>;
}

/** Общий вывод: два предложения, вероятность скорого патча, изменения с прошлого прогона; остальное под «Подробнее». */
export function RadarSummary({ report }: { report: RadarReport }) {
  const { lead, rest } = radarLead(report.summary);
  const { timing } = report;
  const more = [...rest, ...(timing?.outlook ? [timing.outlook] : [])];
  // Модель часто сама начинает вывод с вероятностей патча: тогда своя строка их только повторила бы.
  const showTiming = timing !== null && (timing.within7 !== null || timing.within14 !== null)
    && ![timing.within7, timing.within14].some(value => value !== null && lead.includes(`${value}%`));
  return <section className="radar-section radar-summary" aria-labelledby="radar-summary-title">
    <header className="radar-section__heading">
      <span className="radar-section__eyebrow"><Radar aria-hidden="true" /> Сводка радара</span>
      <h2 id="radar-summary-title">Общий вывод</h2>
      <p>
        Обновлено {formatRadarTime(report.generatedAt)}
        {report.patch && <> · <a href={report.patch.href}>патч {report.patch.version}</a></>}
      </p>
    </header>
    <div className="radar-section__body radar-summary__text">
      <p>{lead}</p>
      {showTiming && timing && <p className="radar-summary__timing">
        Следующий балансный патч:
        {timing.within7 !== null && <> <b>{timing.within7}%</b> — в ближайшие 7 дней</>}
        {timing.within7 !== null && timing.within14 !== null && ','}
        {timing.within14 !== null && <> <b>{timing.within14}%</b> — в 14 дней</>}
      </p>}
      {more.length > 0 && <RadarMore>{more.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</RadarMore>}
    </div>
    {report.changes && <RadarChangesBlock changes={report.changes} />}
  </section>;
}
