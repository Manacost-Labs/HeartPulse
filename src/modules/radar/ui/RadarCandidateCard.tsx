import { ArrowUp, ChartNoAxesColumn, History, MessageSquare, MessagesSquare, Wrench } from 'lucide-react';
import {
  RADAR_CLASS_LABELS, RADAR_CONFIDENCE_LEVELS, RADAR_KIND_LABELS, RADAR_SENTIMENT_LABELS, RADAR_STANCE_LABELS, formatRadarCount,
  formatRadarDay, formatRadarDelta, formatRadarPercent, radarClassIcon, radarConfidenceLevel, radarEntityImage, radarTrendDelta,
  type RadarCandidate, type RadarPost, type RadarPrecedent, type RadarSectionId,
} from '../model/radarView';

const SOURCE_LABELS: Record<RadarPost['source'], string> = { reddit: 'Reddit', x: 'X' };
const POST_KIND_LABELS: Record<RadarPost['kind'], string | null> = { post: null, comment: 'комментарий', tweet: null };
const STATS_SOURCE_LABELS = { hsguru: 'HSGuru', hsreplay: 'HSReplay' } as const;

function ConfidenceMeter({ value, previous, direction }: { value: number; previous: number | null; direction: RadarSectionId }) {
  const level = radarConfidenceLevel(value);
  const change = previous === null ? null : value - previous;
  const label = `Уверенность ${value} из 100: ${RADAR_CONFIDENCE_LEVELS[level].label.toLowerCase()}`;
  return <div className="radar-confidence" data-level={level}>
    <div className="radar-confidence__head">
      <span className="radar-confidence__value">{value}<small>/100</small></span>
      {change !== null && change !== 0 && <span className="radar-confidence__change" data-tone={change > 0 ? 'up' : 'down'}
        title="Изменение к прошлому запуску радара">
        {change > 0 ? '+' : '−'}{Math.abs(change)} с прошлого раза
      </span>}
      <span className="radar-confidence__label">{RADAR_CONFIDENCE_LEVELS[level].label}</span>
    </div>
    <div className="radar-confidence__track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}
      data-direction={direction}>
      <span className="radar-confidence__fill" style={{ inlineSize: `${value}%` }} />
    </div>
  </div>;
}

function RadarStats({ stats, kind }: { stats: RadarCandidate['stats']; kind: RadarCandidate['kind'] }) {
  const facts = [
    ['Винрейт', formatRadarPercent(stats.winrate)],
    ['Популярность', formatRadarPercent(stats.popularity)],
    [kind === 'card' ? 'Сыграна' : 'Игр', formatRadarCount(stats.games)],
  ] as const;
  const scope = [STATS_SOURCE_LABELS[stats.source], stats.rankLabel, stats.periodLabel].filter(Boolean).join(' · ');
  return <div className="radar-block">
    <h4 className="radar-block__title"><ChartNoAxesColumn aria-hidden="true" /> Статистика</h4>
    <p className="radar-block__scope">{scope}</p>
    <dl className="radar-facts">
      {facts.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}
    </dl>
    {stats.trend.length > 1 && <table className="radar-trend">
      <caption className="sr-only">Винрейт и популярность по периодам, ранг: {stats.rankLabel}</caption>
      <thead><tr>
        <th scope="col">Период</th><th scope="col">Винрейт</th>
        <th scope="col"><abbr title="Изменение винрейта к предыдущей строке, п. п.">Δ</abbr></th><th scope="col">Популярность</th>
      </tr></thead>
      <tbody>
        {stats.trend.map((point, index) => {
          const delta = index ? radarTrendDelta(point.winrate, stats.trend[index - 1].winrate) : null;
          return <tr key={`${index}:${point.period}`}>
            <th scope="row">{point.label}</th>
            <td>{formatRadarPercent(point.winrate)}</td>
            <td className="radar-trend__delta" data-tone={delta === null || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down'}>
              {delta === null ? '' : formatRadarDelta(delta)}
            </td>
            <td>{formatRadarPercent(point.popularity)}</td>
          </tr>;
        })}
      </tbody>
    </table>}
  </div>;
}

function RadarPostItem({ post }: { post: RadarPost }) {
  const kind = POST_KIND_LABELS[post.kind];
  return <a className="radar-post" href={post.url} target="_blank" rel="noopener noreferrer nofollow ugc">
    <span className="radar-post__meta">
      <span className="radar-post__source" data-source={post.source}>{SOURCE_LABELS[post.source]}</span>
      {post.official && <span className="radar-post__official">официально</span>}
      <span className="radar-post__author">{post.author}</span>
      {post.community && post.community !== post.author && <span>{post.community}</span>}
      {kind && <span>{kind}</span>}
      <span className="radar-post__score" aria-label={`Рейтинг ${formatRadarCount(post.score)}`}>
        <ArrowUp aria-hidden="true" />{formatRadarCount(post.score)}
      </span>
      {post.comments !== null && post.comments > 0 && <span className="radar-post__score" aria-label={`Комментариев: ${formatRadarCount(post.comments)}`}>
        <MessageSquare aria-hidden="true" />{formatRadarCount(post.comments)}
      </span>}
      {post.publishedAt && <time dateTime={post.publishedAt}>{formatRadarDay(post.publishedAt)}</time>}
    </span>
    {post.title && <span className="radar-post__title">{post.title}</span>}
    <span className="radar-post__text">{post.text}</span>
  </a>;
}

function RadarSocial({ social }: { social: RadarCandidate['social'] }) {
  const sentiment = RADAR_SENTIMENT_LABELS[social.sentiment];
  const stance = RADAR_STANCE_LABELS[social.stance];
  const platforms = [social.reddit ? `Reddit ${formatRadarCount(social.reddit)}` : null, social.x ? `X ${formatRadarCount(social.x)}` : null]
    .filter(Boolean).join(' · ');
  return <div className="radar-block">
    <h4 className="radar-block__title"><MessagesSquare aria-hidden="true" /> Что говорят в сообществе</h4>
    <p className="radar-social__summary">
      <span><b>{formatRadarCount(social.mentions)}</b> упоминаний{platforms && <> ({platforms})</>}</span>
      {sentiment && <span className="radar-social__mood" data-tone={social.sentiment}>{sentiment}{stance && `, ${stance}`}</span>}
    </p>
    {social.summary && <p className="radar-social__text">{social.summary}</p>}
    {social.posts.length
      ? <ul className="radar-posts">
        {social.posts.map(post => <li key={post.url}><RadarPostItem post={post} /></li>)}
      </ul>
      : !social.summary && <p className="radar-block__empty">Заметных обсуждений пока нет.</p>}
  </div>;
}

const DIRECTION_LABELS: Record<RadarPrecedent['direction'], string> = { nerf: 'Нерф', buff: 'Бафф', rework: 'Переработка', neutral: 'Изменение' };

function precedentStats(stats: RadarPrecedent['before']): string | null {
  if (!stats) return null;
  return [stats.winrate !== null && `винрейт ${formatRadarPercent(stats.winrate)}`,
    stats.popularity !== null && `популярность ${formatRadarPercent(stats.popularity)}`].filter(Boolean).join(', ');
}

/** «Как Blizzard поступали раньше»: похожие прошлые правки, сначала те, на которые опирался прогноз. */
function RadarPrecedents({ precedents }: { precedents: RadarPrecedent[] }) {
  return <div className="radar-precedents">
    <h4 className="radar-block__title"><History aria-hidden="true" /> Как Blizzard поступали раньше</h4>
    <ul>
      {precedents.map(precedent => {
        const before = precedentStats(precedent.before);
        const after = precedentStats(precedent.after);
        return <li key={precedent.id} className="radar-precedent" data-direction={precedent.direction}>
          <div className="radar-precedent__head">
            <span className="radar-precedent__direction">{DIRECTION_LABELS[precedent.direction]}</span>
            {precedent.cardHref ? <a href={precedent.cardHref}>{precedent.name}</a> : <b>{precedent.name}</b>}
            <span className="radar-precedent__meta">
              {RADAR_CLASS_LABELS[precedent.classKey]} · <a href={precedent.patchHref}>патч {precedent.patch}</a>
              {precedent.date && <> · {formatRadarDay(precedent.date)}</>}
              {precedent.cited && <> · учтено в прогнозе</>}
            </span>
          </div>
          {precedent.changes.length > 0 && <p className="radar-precedent__changes">{precedent.changes.join('; ')}</p>}
          {precedent.summary && <p>{precedent.summary}</p>}
          {(before || after) && <p className="radar-precedent__stats">
            {before && <>До правки: {before}</>}{before && after && '. '}{after && <>После: {after}</>}
          </p>}
          {precedent.similarity.length > 0 && <p className="radar-precedent__why">Похоже: {precedent.similarity.join('; ')}</p>}
        </li>;
      })}
    </ul>
  </div>;
}

/** Один кандидат: кто, насколько вероятно, почему, цифры и голоса сообщества. */
export function RadarCandidateCard({ candidate, direction, index }: { candidate: RadarCandidate; direction: RadarSectionId; index: number }) {
  const { entity } = candidate;
  const since = formatRadarDay(candidate.firstSeenAt);
  const titleId = `radar-${direction}-${index}`;
  const identity = <>
    <img className="radar-candidate__art" data-kind={candidate.kind} src={radarEntityImage(candidate)} alt=""
      width={candidate.kind === 'card' ? 72 : 48} height={candidate.kind === 'card' ? 99 : 48} loading="lazy" decoding="async" />
    <div className="radar-candidate__names">
      <h3 id={titleId}>{entity.name}</h3>
      {entity.nameEn && entity.nameEn !== entity.name && <span className="radar-candidate__en" lang="en">{entity.nameEn}</span>}
      <span className="radar-candidate__meta">
        {candidate.kind !== 'class' && <img src={radarClassIcon(entity.classKey)} alt="" width={16} height={16} loading="lazy" decoding="async" />}
        {candidate.kind === 'class' ? RADAR_KIND_LABELS.class : `${RADAR_CLASS_LABELS[entity.classKey]} · ${RADAR_KIND_LABELS[candidate.kind]}`}
        {since && <> · в радаре с {since}</>}
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
    {candidate.headline && <p className="radar-candidate__headline">{candidate.headline}</p>}
    <p className="radar-candidate__verdict">{candidate.verdict}</p>
    {candidate.reasons.length > 0 && <ul className="radar-candidate__reasons">
      {candidate.reasons.map((reason, reasonIndex) => <li key={`${reasonIndex}:${reason}`}>{reason}</li>)}
    </ul>}
    {candidate.suggestedChange && <p className="radar-candidate__change">
      <Wrench aria-hidden="true" />
      <span><b>{direction === 'nerfs' ? 'Возможный нерф' : 'Возможный бафф'}:</b> {candidate.suggestedChange}</span>
    </p>}
    <div className="radar-candidate__blocks">
      <RadarStats stats={candidate.stats} kind={candidate.kind} />
      <RadarSocial social={candidate.social} />
    </div>
    {candidate.precedents.length > 0 && <RadarPrecedents precedents={candidate.precedents} />}
  </article>;
}
