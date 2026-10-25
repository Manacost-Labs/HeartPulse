import { ArrowUp, ExternalLink, MessageSquare, Wrench } from 'lucide-react';
import { pluralRu } from '../../../shared/text/pluralRu';
import {
  RADAR_CLASS_LABELS, RADAR_CONFIDENCE_LEVELS, RADAR_KIND_LABELS, RADAR_SENTIMENT_LABELS, RADAR_STANCE_LABELS, formatRadarCount,
  formatRadarDate, formatRadarDay, formatRadarDelta, formatRadarPercent, radarClassIcon, radarConfidenceLevel, radarEntityImage, radarLead,
  radarTrendDelta, type RadarCandidate, type RadarPost, type RadarPrecedent, type RadarSectionId,
} from '../model/radarView';
import { RadarMore } from './RadarMore';

const SOURCE_LABELS: Record<RadarPost['source'], string> = { reddit: 'Reddit', x: 'X' };
const DIRECTION_LABELS: Record<RadarPrecedent['direction'], string> = { nerf: 'Нерф', buff: 'Бафф', rework: 'Переработка', neutral: 'Изменение' };

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

function RadarStats({ stats, kind }: { stats: RadarCandidate['stats']; kind: RadarCandidate['kind'] }) {
  const facts = [
    ['Винрейт', formatRadarPercent(stats.winrate)],
    ['Популярность', formatRadarPercent(stats.popularity)],
    [kind === 'card' ? 'Сыграна' : 'Игр', formatRadarCount(stats.games)],
  ] as const;
  return <div className="radar-block">
    <h4 className="radar-block__title">Статистика <span>{[stats.rankLabel, stats.periodLabel].filter(Boolean).join(' · ')}</span></h4>
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

/**
 * Пост — одна ссылка на оригинал в новой вкладке. Текст только русский
 * (перевод hs-data-api); без перевода карточка ведёт в обсуждение.
 */
function RadarPostItem({ post }: { post: RadarPost }) {
  const translated = Boolean(post.title || post.text);
  return <a className="radar-post" href={post.url} target="_blank" rel="noopener noreferrer nofollow ugc">
    <span className="radar-post__meta">
      <span className="radar-post__source" data-source={post.source}>{SOURCE_LABELS[post.source]}</span>
      {post.official && <span className="radar-post__official">официально</span>}
      <span className="radar-post__author">{post.author}</span>
      {post.publishedAt && <time dateTime={post.publishedAt}>{formatRadarDay(post.publishedAt)}</time>}
      <span className="radar-post__score" aria-label={`Рейтинг ${formatRadarCount(post.score)}`}>
        <ArrowUp aria-hidden="true" />{formatRadarCount(post.score)}
      </span>
      {post.comments !== null && post.comments > 0 && <span className="radar-post__score" aria-label={`Комментариев: ${formatRadarCount(post.comments)}`}>
        <MessageSquare aria-hidden="true" />{formatRadarCount(post.comments)}
      </span>}
    </span>
    {post.title && <span className="radar-post__title">{post.title}</span>}
    {post.text && <span className="radar-post__text">{post.text}</span>}
    <span className="radar-post__open">{translated ? 'Читать оригинал' : 'Открыть обсуждение'}<ExternalLink aria-hidden="true" /></span>
  </a>;
}

function RadarSocial({ social }: { social: RadarCandidate['social'] }) {
  const sentiment = RADAR_SENTIMENT_LABELS[social.sentiment];
  const stance = RADAR_STANCE_LABELS[social.stance];
  if (!social.mentions && !social.summary && !social.posts.length) return null;
  return <div className="radar-block">
    <h4 className="radar-block__title">
      Что говорят в сообществе
      <span>{formatRadarCount(social.mentions)} {pluralRu(social.mentions, 'упоминание', 'упоминания', 'упоминаний')}</span>
    </h4>
    {sentiment && <p className="radar-social__mood" data-tone={social.sentiment}>{sentiment}{stance && `, ${stance}`}</p>}
    {social.summary && <p className="radar-social__text">{social.summary}</p>}
    {social.posts.length > 0 && <ul className="radar-posts">
      {social.posts.map(post => <li key={post.url}><RadarPostItem post={post} /></li>)}
    </ul>}
  </div>;
}

function precedentStats(stats: RadarPrecedent['before']): string | null {
  if (!stats) return null;
  const numbers = [stats.winrate !== null && `винрейт ${formatRadarPercent(stats.winrate)}`,
    stats.popularity !== null && `популярность ${formatRadarPercent(stats.popularity)}`].filter(Boolean).join(', ');
  return stats.archetype ? `${numbers} (${stats.archetype})` : numbers;
}

/** «Как Blizzard поступали раньше»: похожие прошлые правки, сначала те, на которые опирался прогноз. */
function RadarPrecedents({ precedents }: { precedents: RadarPrecedent[] }) {
  return <div className="radar-block radar-precedents">
    <h4 className="radar-block__title">Как Blizzard поступали раньше</h4>
    <ul>
      {precedents.map(precedent => {
        const before = precedentStats(precedent.before);
        const after = precedentStats(precedent.after);
        return <li key={precedent.id} className="radar-precedent" data-direction={precedent.direction}>
          <p className="radar-precedent__head">
            <span className="radar-precedent__direction">{DIRECTION_LABELS[precedent.direction]}</span>
            {precedent.cardHref ? <a href={precedent.cardHref}>{precedent.name}</a> : <b>{precedent.name}</b>}
            <span className="radar-precedent__meta">
              <a href={precedent.patchHref}>патч {precedent.patch}</a>{precedent.date && <>, {formatRadarDate(precedent.date)}</>}
            </span>
          </p>
          {/* Описание hs-data-api уже пересказывает правки; построчный список — запасной вариант без него. */}
          {(precedent.summary || precedent.changes.length > 0) && <p className="radar-precedent__changes">
            {precedent.summary ?? precedent.changes.join('; ')}
          </p>}
          {(before || after) && <p className="radar-precedent__stats">
            {before && <>До: {before}</>}{before && after && '. '}{after && <>После: {after}</>}
          </p>}
        </li>;
      })}
    </ul>
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
    <RadarMore className="radar-candidate__more">
      <p className="radar-candidate__verdict">{candidate.verdict}</p>
      {candidate.reasons.length > 0 && <ul className="radar-candidate__reasons">
        {candidate.reasons.map((reason, reasonIndex) => <li key={`${reasonIndex}:${reason}`}>{reason}</li>)}
      </ul>}
      <RadarStats stats={candidate.stats} kind={candidate.kind} />
      <RadarSocial social={candidate.social} />
      {candidate.precedents.length > 0 && <RadarPrecedents precedents={candidate.precedents} />}
    </RadarMore>
  </article>;
}
