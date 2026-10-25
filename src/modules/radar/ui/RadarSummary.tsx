import {
  RADAR_CLASS_LABELS, RADAR_KIND_LABELS, formatRadarTime, radarLead, radarTopCandidates,
  type RadarCandidate, type RadarChangeItem, type RadarChanges, type RadarReport, type RadarSectionId,
} from '../model/radarView';
import { RadarMore } from './RadarMore';

const CHANGE_GROUPS: Array<{ key: keyof Omit<RadarChanges, 'previousAt'>; title: string }> = [
  { key: 'added', title: 'Новые' }, { key: 'risen', title: 'Выросли' }, { key: 'fallen', title: 'Упали' }, { key: 'removed', title: 'Выбыли' },
];
const SIDE_LABELS: Record<RadarSectionId, string> = { nerfs: 'нерф', buffs: 'бафф' };

function ChangeItem({ item }: { item: RadarChangeItem }) {
  const value = item.delta !== null && item.delta !== 0 ? `${item.delta > 0 ? '+' : '−'}${Math.abs(item.delta)}` : item.confidence;
  return <li>
    <span>{item.name}</span>
    <span className="radar-muted">{SIDE_LABELS[item.side]} · {RADAR_KIND_LABELS[item.kind].toLowerCase()}</span>
    {value !== null && <b>{value}</b>}
  </li>;
}

/** «С прошлого прогона»: новые, выросшие, упавшие и выбывшие кандидаты, по пять в группе. */
function RadarChangesList({ changes }: { changes: RadarChanges }) {
  return <div className="radar-changes">
    {CHANGE_GROUPS.filter(group => changes[group.key].length).map(group => <div key={group.key}>
      <h4 className="radar-label">{group.title}</h4>
      <ul>{changes[group.key].map((item, index) => <ChangeItem key={`${index}:${item.name}`} item={item} />)}</ul>
    </div>)}
  </div>;
}

/** Три главных кандидата обоих разделов: по клику страница открывает карточку. */
function RadarTop({ report, onPick }: { report: RadarReport; onPick: (section: RadarSectionId, candidate: RadarCandidate) => void }) {
  const top = radarTopCandidates(report);
  if (!top.length) return null;
  return <div className="radar-top">
    <h3 className="radar-label">Главные кандидаты</h3>
    <ol>
      {top.map(({ section, candidate }) => <li key={`${section}:${candidate.id}`}>
        <button type="button" onClick={() => onPick(section, candidate)}>
          <span className="radar-top__name">{candidate.entity.name}</span>
          <span className="radar-muted">
            {SIDE_LABELS[section]} · {candidate.kind === 'class' ? 'класс' : RADAR_CLASS_LABELS[candidate.entity.classKey]}
          </span>
          <span className="radar-top__value">{candidate.confidence}</span>
          <span className="radar-meter" aria-hidden="true"><span style={{ inlineSize: `${candidate.confidence}%` }} /></span>
        </button>
      </li>)}
    </ol>
  </div>;
}

/**
 * Верх страницы: два предложения вывода и три главных кандидата. Остальной
 * вывод, прогноз патча и изменения с прошлого прогона — под переключателями.
 */
export function RadarSummary({ report, onPick }: {
  report: RadarReport; onPick: (section: RadarSectionId, candidate: RadarCandidate) => void;
}) {
  const { lead, rest } = radarLead(report.summary);
  const more = [...rest, ...(report.timing?.outlook ? [report.timing.outlook] : [])];
  return <section className="radar-section radar-summary" aria-labelledby="radar-summary-title">
    <header className="radar-section__heading">
      <h2 id="radar-summary-title">Общий вывод</h2>
      <p>
        Обновлено {formatRadarTime(report.generatedAt)}
        {report.patch && <> · <a href={report.patch.href}>патч {report.patch.version}</a></>}
      </p>
    </header>
    <div className="radar-section__body radar-summary__body">
      <p className="radar-summary__lead">{lead}</p>
      <RadarTop report={report} onPick={onPick} />
      {(more.length > 0 || report.changes) && <div className="radar-summary__more">
        {more.length > 0 && <RadarMore>{more.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</RadarMore>}
        {report.changes && <RadarMore label="С прошлого прогона"><RadarChangesList changes={report.changes} /></RadarMore>}
      </div>}
    </div>
  </section>;
}
