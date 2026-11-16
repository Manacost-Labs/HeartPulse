import type { PublicGuideTocEntry } from '@/apps/public-web/lib/publicGuideTeaserData';

/** Server-rendered contents of the whole guide: the outline is open, the text under it is not. */
export function GuideArchiveToc({ toc }: { toc: PublicGuideTocEntry[] }) {
  if (toc.length === 0) return null;
  return <nav className="guide-archive-toc" aria-label="Содержание гайда">
    <h2>Содержание</h2>
    <ol>
      {toc.map(entry => <li key={entry.id} data-level={entry.level}><a href={`#${entry.id}`}>{entry.text}</a></li>)}
    </ol>
  </nav>;
}

/** The open part of the text, already sanitized and cut by the Express projection. */
export function GuideArchiveExcerpt({ html }: { html: string }) {
  if (!html) return null;
  return <div className="guide-archive-reader guide-archive-excerpt" dangerouslySetInnerHTML={{ __html: html }} />;
}
