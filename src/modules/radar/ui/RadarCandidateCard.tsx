import { Wrench } from 'lucide-react';
import {
  RADAR_CLASS_LABELS, RADAR_CONFIDENCE_LEVELS, RADAR_KIND_LABELS, radarClassIcon, radarConfidenceLevel, radarEntityImage, radarLead,
  type RadarCandidate, type RadarSectionId,
} from '../model/radarView';
import { RadarDetails } from './RadarCandidateDetails';
import { RadarMore } from './RadarMore';

function ConfidenceMeter({ value, previous, direction }: { value: number; previous: number | null; direction: RadarSectionId }) {
  const level = radarConfidenceLevel(value);
  const change = previous === null ? 0 : value - previous;
  const label = `Уверенность ${value} из 100: ${RADAR_CONFIDENCE_LEVELS[level].label.toLowerCase()}`;
  return <div className="radar-confidence" data-level={level}>
    <div className="radar-confidence__head">
      <span className="radar-confidence__value">{value}<small>/100</small></span>
      {change !== 0 && <span className="radar-confidence__change" title="Изменение к прошлому запуску радара">
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
      <ConfidenceMeter value={candidate.confidence} previous={candidate.previousConfidence} direction={direction} />
    </header>
    <p className="radar-candidate__why">{why}</p>
    {candidate.suggestedChange && <p className="radar-candidate__change">
      <Wrench aria-hidden="true" />
      <span><b>{direction === 'nerfs' ? 'Возможный нерф' : 'Возможный бафф'}:</b> {candidate.suggestedChange}</span>
    </p>}
    <RadarMore className="radar-candidate__more"><RadarDetails candidate={candidate} /></RadarMore>
  </article>;
}
