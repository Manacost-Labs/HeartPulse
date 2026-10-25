import {
  RADAR_CLASS_LABELS, RADAR_CONFIDENCE_LEVELS, RADAR_KIND_LABELS, radarCandidateAnchor, radarClassIcon, radarConfidenceLevel, radarEntityImage,
  radarWhyLine, type RadarCandidate, type RadarSectionId,
} from '../model/radarView';
import { RadarDetails } from './RadarCandidateDetails';
import { RadarMore } from './RadarMore';

/** Уверенность: число, одна полоса единственного акцентного цвета, изменение к прошлому прогону приглушённо. */
function ConfidenceMeter({ candidate }: { candidate: RadarCandidate }) {
  const value = candidate.confidence;
  const level = radarConfidenceLevel(value);
  const { trend } = candidate.forecast;
  const change = trend?.delta ?? (candidate.previousConfidence === null ? 0 : value - candidate.previousConfidence);
  const label = `Уверенность ${value} из 100: ${RADAR_CONFIDENCE_LEVELS[level].label.toLowerCase()}`;
  return <div className="radar-confidence" data-level={level}>
    <div className="radar-confidence__head">
      <span className="radar-confidence__value">{value}</span>
      <span className="radar-muted">
        {RADAR_CONFIDENCE_LEVELS[level].label.toLowerCase()}
        {trend?.status === 'new' ? ' · новый' : change !== 0 ? ` · ${change > 0 ? '+' : '−'}${Math.abs(change)}` : ''}
      </span>
    </div>
    <div className="radar-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <span style={{ inlineSize: `${value}%` }} />
    </div>
  </div>;
}

/** Самая вероятная правка одной строкой и вероятность варианта. */
function LikelyChange({ candidate }: { candidate: RadarCandidate }) {
  const [top] = candidate.forecast.predictedChanges;
  const change = top?.change ?? candidate.suggestedChange;
  if (!change) return null;
  return <p className="radar-candidate__change">
    <span className="radar-label">Вероятная правка</span>
    <span>{change}{top?.probability !== null && top?.probability !== undefined && <span className="radar-muted"> · {top.probability}%</span>}</span>
  </p>;
}

/**
 * Кандидат коротко: кто, насколько вероятно, почему одной строкой и
 * вероятная правка. Подробности — под «Подробнее» в одинаковых секциях.
 */
export function RadarCandidateCard({ candidate, direction, index }: { candidate: RadarCandidate; direction: RadarSectionId; index: number }) {
  const { entity } = candidate;
  const titleId = `radar-${direction}-${index}`;
  const identity = <>
    <img className="radar-candidate__art" data-kind={candidate.kind} src={radarEntityImage(candidate)} alt=""
      width={candidate.kind === 'card' ? 48 : 36} height={candidate.kind === 'card' ? 66 : 36} loading="lazy" decoding="async" />
    <div className="radar-candidate__names">
      <h3 id={titleId}>{entity.name}</h3>
      <span className="radar-muted">
        {candidate.kind !== 'class' && <img src={radarClassIcon(entity.classKey)} alt="" width={14} height={14} loading="lazy" decoding="async" />}
        {candidate.kind === 'class' ? RADAR_KIND_LABELS.class : `${RADAR_CLASS_LABELS[entity.classKey]} · ${RADAR_KIND_LABELS[candidate.kind].toLowerCase()}`}
      </span>
    </div>
  </>;
  return <article id={radarCandidateAnchor(direction, candidate)} className="radar-candidate" data-kind={candidate.kind} aria-labelledby={titleId}>
    <header className="radar-candidate__head">
      {entity.href
        ? <a className="radar-candidate__identity" href={entity.href}>{identity}</a>
        : <div className="radar-candidate__identity">{identity}</div>}
      <ConfidenceMeter candidate={candidate} />
    </header>
    <p className="radar-candidate__why">{radarWhyLine(candidate)}</p>
    <LikelyChange candidate={candidate} />
    <RadarMore className="radar-candidate__more"><RadarDetails candidate={candidate} /></RadarMore>
  </article>;
}
