import './StandardMetaDataNote.css';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import { standardMetaPeriodLabel } from '@/src/features/standardMetaFilterModel';
import type { StandardMetaTeaserSeed } from '@/src/features/standardMetaTeaser';

const HSGURU_HOSTS = new Set(['hsguru.com', 'www.hsguru.com']);

/**
 * HSGuru's own page, linked only when the teaser names an https address on
 * HSGuru: the link is labelled «HSGuru», so any other host stays plain text.
 */
function sourceHref(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl);
    return url.protocol === 'https:' && HSGURU_HOSTS.has(url.hostname) ? sourceUrl : null;
  } catch {
    return null;
  }
}

/**
 * The line a reader without JavaScript (and a search engine) gets under the
 * meta page: the date of the data, the slice the free preview shows and the
 * source. Server-rendered from the same teaser as the page, so it never
 * disagrees with the numbers above it; nothing without a teaser or a date.
 */
export function StandardMetaDataNote({ teaser }: { teaser: StandardMetaTeaserSeed | null }) {
  const date = teaser && seoDataDate(teaser.data.updatedAt, Date.now());
  if (!teaser || !date) return null;
  const { data, period } = teaser;
  const href = sourceHref(data.sourceUrl);
  return (
    <p className="standard-meta-data-note">
      Данные на <time dateTime={date.iso}>{date.date}, {date.time} МСК</time> · {data.formatLabel} · {data.rankLabel} · период «{standardMetaPeriodLabel(period)}» · от {data.minGames} игр · источник {href ? <a href={href} rel="noopener noreferrer">HSGuru</a> : 'HSGuru'}.
      Это срез бесплатного предпросмотра: подписчики могут переключать формат, ранг и период.
    </p>
  );
}
