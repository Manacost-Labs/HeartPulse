import { Wrench } from 'lucide-react';
import {
  RADAR_CLASS_LABELS, RADAR_CONFIDENCE_LEVELS, RADAR_KIND_LABELS, radarClassIcon, radarConfidenceLevel, radarEntityImage, radarLead,
  type RadarCandidate, type RadarPredictedChange, type RadarSectionId,
} from '../model/radarView';
import { RadarDetails } from './RadarCandidateDetails';
import { RadarMore } from './RadarMore';

const STAT_LABELS: Partial<Record<RadarPredictedChange['field'], string>> = {
  cost: 'Стоимость', attack: 'Атака', health: 'Здоровье', durability: 'Прочность', armor: 'Броня',
};

function ConfidenceMeter({ value, previous, trend, direction }: {
  value: number; previous: number | null; trend: RadarCandidate['forecast']['trend']; direction: RadarSectionId;
}) {
  const level = radarConfidenceLevel(value);
  const change = trend?.delta ?? (previous === null ? 0 : value - previous);
  const label = `Уверенность ${value} из 100: ${RADAR_CONFIDENCE_LEVELS[level].label.toLowerCase()}`;
  return <div className="radar-confidence" data-level={level}>
    <div className="radar-confidence__head">
      <span className="radar-confidence__value">{value}<small>/100</small></span>
      {trend?.status === 'new'
        ? <span className="radar-confidence__change" data-tone="new">новый</span>
        : change !== 0 && <span className="radar-confidence__change" title="Изменение к прошлому запуску радара">
          {change > 0 ? '+' : '−'}{Math.abs(change)}
        </span>}
      <span className="radar-confidence__label">{RADAR_CONFIDENCE_LEVELS[level].label}</span>
    </div>
    <div className="radar-confidence__track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}
      data-direction={direction}>
      <span className="radar-confidence__fill" style={{ inlineSize: `${value}%` }} />
    </div>
  </div>;
}

/**
 * Самая вероятная правка: для стоимости и характеристик — «было → станет»
 * значками карты, иначе текстом; вероятность варианта рядом.
 */
function PredictedChange({ candidate, direction }: { candidate: RadarCandidate; direction: RadarSectionId }) {
  const [top] = candidate.forecast.predictedChanges;
  const label = direction === 'nerfs' ? 'Возможный нерф' : 'Возможный бафф';
  if (!top && !candidate.suggestedChange) return null;
  // Значки — только у карты: у архетипа и класса правка относится к одной из их карт, и её называет текст.
  const stat = candidate.kind === 'card' && top && top.before !== null && top.after !== null ? STAT_LABELS[top.field] : undefined;
  return <p className="radar-candidate__change">
    <Wrench aria-hidden="true" />
    <span>
      <b>{label}:</b>{' '}
      {stat && top
        ? <span className="radar-stat-change" data-field={top.field}>
          {stat} <span className="radar-stat">{top.before}</span> → <span className="radar-stat radar-stat--after">{top.after}</span>
        </span>
        : top?.change ?? candidate.suggestedChange}
      {top?.probability !== null && top?.probability !== undefined && <span className="radar-candidate__chance"> · вероятность {top.probability}%</span>}
    </span>
  </p>;
}

/**
 * Кандидат коротко: кто, насколько вероятно, почему одной строкой и
 * возможное изменение. Вердикт, причины, цифры, посты и прецеденты — под
 * «Подробнее».
 */
export function RadarCandidateCard({ candidate, direction, index }: { candidate: RadarCandidate; direction: RadarSectionId; index: number }) {
  const { entity } = candidate;
  const titleId = `radar-${direction}-${index}`;
  const why = candidate.headline ?? radarLead(candidate.verdict, 1).lead;
  const identity = <>
    <img className="radar-candidate__art" data-kind={candidate.kind} src={radarEntityImage(candidate)} alt=""
      width={candidate.kind === 'card' ? 56 : 40} height={candidate.kind === 'card' ? 77 : 40} loading="lazy" decoding="async" />
    <div className="radar-candidate__names">
      <h3 id={titleId}>{entity.name}</h3>
      <span className="radar-candidate__meta">
        {candidate.kind !== 'class' && <img src={radarClassIcon(entity.classKey)} alt="" width={16} height={16} loading="lazy" decoding="async" />}
        {candidate.kind === 'class' ? RADAR_KIND_LABELS.class : `${RADAR_CLASS_LABELS[entity.classKey]} · ${RADAR_KIND_LABELS[candidate.kind]}`}
      </span>
    </div>
  </>;
  return <article className="radar-candidate" data-kind={candidate.kind} data-direction={direction} aria-labelledby={titleId}>
    <header className="radar-candidate__head">
      {entity.href
        ? <a className="radar-candidate__identity" href={entity.href}>{identity}</a>
        : <div className="radar-candidate__identity">{identity}</div>}
      <ConfidenceMeter value={candidate.confidence} previous={candidate.previousConfidence} trend={candidate.forecast.trend} direction={direction} />
    </header>
    <p className="radar-candidate__why">{why}</p>
    <PredictedChange candidate={candidate} direction={direction} />
    <RadarMore className="radar-candidate__more"><RadarDetails candidate={candidate} /></RadarMore>
  </article>;
}
