import { ArrowUp, Check, ExternalLink, MessageSquare } from 'lucide-react';
import {
  RADAR_CLASS_LABELS, RADAR_SENTIMENT_LABELS, RADAR_STANCE_LABELS, formatRadarCount, formatRadarDate, formatRadarDay, formatRadarDelta,
  formatRadarPercent, radarDayShift, radarLead, radarTrendDelta, type RadarCandidate, type RadarPost, type RadarPrecedent,
} from '../model/radarView';
import { RadarMore } from './RadarMore';

const SOURCE_LABELS: Record<RadarPost['source'], string> = { reddit: 'Reddit', x: 'X' };
const DIRECTION_LABELS: Record<RadarPrecedent['direction'], string> = { nerf: 'Нерф', buff: 'Бафф', rework: 'Переработка', neutral: 'Правка' };
const MAX_REASONS = 4;

/** Главные цифры чипами: винрейт, популярность со сдвигом за сутки, сколько раз сыграна. */
function RadarFacts({ stats, kind }: { stats: RadarCandidate['stats']; kind: RadarCandidate['kind'] }) {
  const shift = radarDayShift(stats);
  const facts = [
    { term: 'Винрейт', value: formatRadarPercent(stats.winrate), note: null },
    {
      term: 'Популярность', value: formatRadarPercent(stats.popularity),
      note: shift !== null && shift !== 0 ? `${formatRadarDelta(shift)} п. п. за сутки` : null,
    },
    { term: kind === 'card' ? 'Сыграна' : 'Игр', value: formatRadarCount(stats.games), note: null },
  ].filter(fact => fact.value !== '—');
  if (!facts.length) return null;
  return <div className="radar-facts">
    <dl>
      {facts.map(fact => <div key={fact.term} className="radar-fact">
        <dt>{fact.term}</dt>
        <dd>{fact.value}{fact.note && <span data-tone={fact.note.startsWith('+') ? 'up' : 'down'}>{fact.note}</span>}</dd>
      </div>)}
    </dl>
    <p className="radar-facts__scope">{[stats.rankLabel, stats.periodLabel].filter(Boolean).join(' · ')}</p>
  </div>;
}

function RadarReasons({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null;
  return <div className="radar-block">
    <h4 className="radar-block__title">Почему в радаре</h4>
    <ul className="radar-reasons">
      {reasons.slice(0, MAX_REASONS).map((reason, index) => <li key={`${index}:${reason}`}><Check aria-hidden="true" /><span>{reason}</span></li>)}
    </ul>
  </div>;
}

/** «Как Blizzard поступали раньше»: одна строка на случай — правка, карта, патч, что изменили. */
function RadarPrecedents({ precedents }: { precedents: RadarPrecedent[] }) {
  if (!precedents.length) return null;
  return <div className="radar-block">
    <h4 className="radar-block__title">Как Blizzard поступали раньше</h4>
    <ul className="radar-precedents">
      {precedents.map(precedent => <li key={precedent.id} className="radar-precedent" data-direction={precedent.direction}>
        <span className="radar-precedent__direction">{DIRECTION_LABELS[precedent.direction]}</span>
        <span className="radar-precedent__card">
          {precedent.cardHref ? <a href={precedent.cardHref}>{precedent.name}</a> : precedent.name}
          <span>{RADAR_CLASS_LABELS[precedent.classKey]}</span>
        </span>
        <a className="radar-precedent__patch" href={precedent.patchHref}>
          Патч {precedent.patch}{precedent.date && <span>{formatRadarDate(precedent.date)}</span>}
        </a>
        {/* Описание hs-data-api уже пересказывает правку; построчный список — запасной вариант без него. */}
        <span className="radar-precedent__change">{precedent.summary ?? precedent.changes.join('; ')}</span>
      </li>)}
    </ul>
  </div>;
}

/** Периоды узкой таблицей: винрейт, его изменение к прошлому периоду и популярность. */
function RadarPeriods({ stats }: { stats: RadarCandidate['stats'] }) {
  if (stats.trend.length < 2) return null;
  return <div className="radar-block">
    <h4 className="radar-block__title">По периодам <span>{stats.rankLabel}</span></h4>
    <table className="radar-trend">
      <caption className="sr-only">Винрейт и популярность по периодам, ранг: {stats.rankLabel}</caption>
      <thead><tr>
        <th scope="col">Период</th><th scope="col">Винрейт</th><th scope="col">к прошлому периоду</th><th scope="col">Популярность</th>
      </tr></thead>
      <tbody>
        {stats.trend.map((point, index) => {
          const delta = index ? radarTrendDelta(point.winrate, stats.trend[index - 1].winrate) : null;
          return <tr key={`${index}:${point.period}`}>
            <th scope="row">{point.label}</th>
            <td>{formatRadarPercent(point.winrate)}</td>
            <td className="radar-trend__delta" data-tone={delta === null || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down'}>
              {delta === null ? '' : `${formatRadarDelta(delta)} п. п.`}
            </td>
            <td>{formatRadarPercent(point.popularity)}</td>
          </tr>;
        })}
      </tbody>
    </table>
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
      {sentiment && <span className="radar-social__mood" data-tone={social.sentiment}>{sentiment}{stance && `, ${stance}`}</span>}
    </h4>
    {social.summary && <p className="radar-social__text">{radarLead(social.summary, 2).lead}</p>}
    {social.posts.length > 0 && <ul className="radar-posts">
      {social.posts.map(post => <li key={post.url}><RadarPostItem post={post} /></li>)}
    </ul>}
  </div>;
}

/**
 * Раскрытый кандидат: короткий вывод и цифры чипами сверху, затем причины,
 * прошлые правки, периоды и обсуждения. Полный текст вывода модели — под
 * «Полный разбор», чтобы наверху не было стены текста.
 */
export function RadarDetails({ candidate }: { candidate: RadarCandidate }) {
  const { lead, rest } = radarLead(candidate.verdict, 2);
  return <>
    <p className="radar-candidate__verdict">{lead}</p>
    <RadarFacts stats={candidate.stats} kind={candidate.kind} />
    <RadarReasons reasons={candidate.reasons} />
    <RadarPrecedents precedents={candidate.precedents} />
    <RadarPeriods stats={candidate.stats} />
    <RadarSocial social={candidate.social} />
    {rest.length > 0 && <RadarMore label="Полный разбор" className="radar-candidate__full">
      {rest.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </RadarMore>}
  </>;
}
