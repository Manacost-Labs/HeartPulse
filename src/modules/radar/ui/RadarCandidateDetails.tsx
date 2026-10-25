import type { ReactNode } from 'react';
import { pluralRu } from '../../../shared/text/pluralRu';
import {
  RADAR_SENTIMENT_LABELS, RADAR_STANCE_LABELS, formatRadarCount, formatRadarDay, formatRadarDelta, formatRadarPercent, radarDayShift,
  radarLead, radarTrendDelta, type RadarCandidate, type RadarPost, type RadarPrecedent,
} from '../model/radarView';
import { RadarMore } from './RadarMore';

const SOURCE_LABELS: Record<RadarPost['source'], string> = { reddit: 'Reddit', x: 'X' };
const DIRECTION_LABELS: Record<RadarPrecedent['direction'], string> = { nerf: 'нерф', buff: 'бафф', rework: 'переработка', neutral: 'правка' };
const LIMIT = 3;

/** Одна секция подробностей: подпись одного стиля и содержимое. Пустую секцию не показываем. */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return <section className="radar-part"><h4 className="radar-label">{title}</h4>{children}</section>;
}

function Facts({ stats, kind }: { stats: RadarCandidate['stats']; kind: RadarCandidate['kind'] }) {
  const shift = radarDayShift(stats);
  const facts = [
    { term: 'Винрейт', value: formatRadarPercent(stats.winrate), note: null },
    { term: 'Популярность', value: formatRadarPercent(stats.popularity), note: shift ? `${formatRadarDelta(shift)} за сутки` : null },
    { term: kind === 'card' ? 'Сыграна' : 'Игр', value: formatRadarCount(stats.games), note: null },
  ].filter(fact => fact.value !== '—');
  if (!facts.length) return null;
  return <Part title="Цифры">
    <dl className="radar-chips-row">
      {facts.map(fact => <div key={fact.term} className="radar-fact">
        <dt>{fact.term}</dt>
        <dd>{fact.value}{fact.note && <span className="radar-muted"> {fact.note}</span>}</dd>
      </div>)}
    </dl>
    <p className="radar-muted">{[stats.rankLabel, stats.periodLabel].filter(Boolean).join(' · ')}</p>
  </Part>;
}

function Why({ candidate }: { candidate: RadarCandidate }) {
  const history = candidate.forecast.confidenceHistory;
  // Прошлую уверенность показывает «Полный разбор», поэтому та же строка из списка модели убирается.
  const facts = (candidate.forecast.keyNumbers.length ? candidate.forecast.keyNumbers : candidate.reasons)
    .filter(fact => !(history.length > 1 && /^предыдущий прогон/i.test(fact))).slice(0, LIMIT);
  if (!facts.length) return null;
  return <Part title="Почему">
    <ul className="radar-list-plain">{facts.map((fact, index) => <li key={`${index}:${fact}`}>{fact}</li>)}</ul>
  </Part>;
}

/** «Как раньше»: одна строка на прошлую правку — карта, патч, что изменили. */
function Before({ precedents }: { precedents: RadarPrecedent[] }) {
  if (!precedents.length) return null;
  return <Part title="Как раньше">
    <ul className="radar-list-plain">
      {precedents.slice(0, LIMIT).map(precedent => <li key={precedent.id}>
        {precedent.cardHref ? <a href={precedent.cardHref}>{precedent.name}</a> : <b>{precedent.name}</b>}
        <span className="radar-muted"> · {DIRECTION_LABELS[precedent.direction]} в <a href={precedent.patchHref}>патче {precedent.patch}</a></span>
        {/* Описание hs-data-api уже пересказывает правку; построчный список — запасной вариант без него. */}
        {(precedent.summary || precedent.changes.length > 0) && <> — {precedent.summary ?? precedent.changes.join('; ')}</>}
      </li>)}
    </ul>
  </Part>;
}

/**
 * Пост — одна ссылка на оригинал в новой вкладке. Текст только русский
 * (перевод hs-data-api); без перевода карточка ведёт в обсуждение.
 */
function Post({ post }: { post: RadarPost }) {
  const translated = Boolean(post.title || post.text);
  return <a className="radar-post" href={post.url} target="_blank" rel="noopener noreferrer nofollow ugc">
    <span className="radar-post__meta radar-muted">
      <b>{SOURCE_LABELS[post.source]}</b>{post.official && ' · официально'} · {post.author}
      {post.publishedAt && <> · <time dateTime={post.publishedAt}>{formatRadarDay(post.publishedAt)}</time></>}
      {' · '}{formatRadarCount(post.score)} {post.source === 'reddit' ? 'очков' : 'отметок'}
    </span>
    {post.title && <span className="radar-post__title">{post.title}</span>}
    {/* В карточке абзацы идут подряд: пустые строки полного текста только растягивают её. */}
    {post.text && <span className="radar-post__text">{post.text.replace(/\n{2,}/g, '\n')}</span>}
    <span className="radar-post__open">{translated ? 'Читать оригинал' : 'Открыть обсуждение'} ↗</span>
  </a>;
}

function Community({ social }: { social: RadarCandidate['social'] }) {
  const sentiment = RADAR_SENTIMENT_LABELS[social.sentiment];
  const stance = RADAR_STANCE_LABELS[social.stance];
  if (!sentiment && !social.posts.length) return null;
  return <Part title="Сообщество">
    {sentiment && <p className="radar-muted">
      {sentiment}{stance && `, ${stance}`} · {formatRadarCount(social.mentions)} {pluralRu(social.mentions, 'упоминание', 'упоминания', 'упоминаний')}
    </p>}
    {social.posts.length > 0 && <ul className="radar-posts">
      {social.posts.slice(0, LIMIT).map(post => <li key={post.url}><Post post={post} /></li>)}
    </ul>}
  </Part>;
}

/** Периоды строками, без таблицы: на телефоне ничего не прокручивается вбок. */
function Periods({ stats }: { stats: RadarCandidate['stats'] }) {
  if (stats.trend.length < 2) return null;
  return <div className="radar-periods">
    <p className="radar-label">По периодам · {stats.rankLabel}</p>
    <ul>
      {stats.trend.map((point, index) => {
        const delta = index ? radarTrendDelta(point.winrate, stats.trend[index - 1].winrate) : null;
        return <li key={`${index}:${point.period}`}>
          <span>{point.label}</span>
          <span>винрейт {formatRadarPercent(point.winrate)}{delta !== null && <span className="radar-muted"> ({formatRadarDelta(delta)} к прошлому)</span>}</span>
          <span className="radar-muted">популярность {formatRadarPercent(point.popularity)}</span>
        </li>;
      })}
    </ul>
  </div>;
}

/** Всё остальное: полный вывод, эффект на мету, варианты правки, калибровка, уверенность по прогонам, периоды, пересказ обсуждений. */
function Full({ candidate }: { candidate: RadarCandidate }) {
  const { forecast } = candidate;
  const history = forecast.confidenceHistory;
  return <RadarMore label="Полный разбор" className="radar-candidate__full">
    {candidate.verdict.split(/\n\s*\n|\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    {forecast.metaImpact && <p><b>Что изменится в мете.</b> {forecast.metaImpact}</p>}
    {forecast.predictedChanges.length > 1 && <p>
      <b>Варианты правки.</b> {forecast.predictedChanges.map(variant => `${variant.change}${variant.probability !== null ? ` — ${variant.probability}%` : ''}`).join('; ')}.
    </p>}
    {forecast.calibration && <p>
      <b>В истории.</b> Blizzard меняла {forecast.calibration.hits} из {formatRadarCount(forecast.calibration.samples)} похожих ({forecast.calibration.rate}%).
    </p>}
    {history.length > 1 && <p><b>Уверенность по прогонам.</b> {history.map(point => point.confidence).join(' → ')}</p>}
    {candidate.social.summary && <p><b>Что пишут.</b> {radarLead(candidate.social.summary, 3).lead}</p>}
    <Periods stats={candidate.stats} />
  </RadarMore>;
}

/**
 * Раскрытый кандидат: четыре одинаково устроенные секции — «Цифры»,
 * «Почему» (до трёх пунктов), «Как раньше» (прецеденты строкой),
 * «Сообщество» (до трёх постов) — и «Полный разбор» для остального.
 */
export function RadarDetails({ candidate }: { candidate: RadarCandidate }) {
  return <>
    <Facts stats={candidate.stats} kind={candidate.kind} />
    <Why candidate={candidate} />
    <Before precedents={candidate.precedents} />
    <Community social={candidate.social} />
    <Full candidate={candidate} />
  </>;
}
