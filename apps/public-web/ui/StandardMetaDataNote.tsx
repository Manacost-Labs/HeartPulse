import './StandardMetaDataNote.css';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import { hsguruSourceUrl } from '@/apps/public-web/lib/seoDataSource';
import { standardMetaPeriodLabel } from '@/src/features/standardMetaFilterModel';
import type { StandardMetaTeaserSeed } from '@/src/features/standardMetaTeaser';

/**
 * The line a reader without JavaScript (and a search engine) gets under the
 * meta page: the date of the data, the open general slice and the
 * source. Server-rendered from the same teaser as the page, so it never
 * disagrees with the numbers above it; nothing without a teaser or a date.
 */
export function StandardMetaDataNote({ teaser }: { teaser: StandardMetaTeaserSeed | null }) {
  const date = teaser && seoDataDate(teaser.data.updatedAt, Date.now());
  if (!teaser || !date) return null;
  const { data, period } = teaser;
  const href = hsguruSourceUrl(data.sourceUrl);
  return (
    <p className="standard-meta-data-note">
      Данные на <time dateTime={date.iso}>{date.date}, {date.time} МСК</time> · {data.formatLabel} · {data.rankLabel} · период «{standardMetaPeriodLabel(period)}» · от {data.minGames} игр · источник {href ? <a href={href} rel="noopener noreferrer">HSGuru</a> : 'HSGuru'}.
      Это общий срез меты: ранги «Легенда» и «Топ-1000», очерёдность хода, периоды патчей, динамика и рекомендации — в подписке.
    </p>
  );
}
