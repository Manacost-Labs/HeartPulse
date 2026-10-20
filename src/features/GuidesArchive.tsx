import { SectionBanner } from '../shared/ui/EditorialRouteChrome';
import React, { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Search, Tag } from 'lucide-react';
import '../route-parchment.css';
import './GuidesArchive.css';
import './recovery/RecoverableSurface.css';
import { AsyncSurfaceState } from './recovery/RecoverableSurface';
import { LoadingBlock } from '../shared/ui/LoadingSurface';
import { GuideDetailSkeleton, GuideReaderSkeleton, GuidesArchiveSkeleton } from './GuidesArchiveSkeleton';
import { type GuideArchiveItem, type GuideDetailSeed, useGuideDetail, useGuidesArchivePage } from './GuidesArchiveData';

import { useViewerTimeZone } from '../shared/ui/useViewerTimeZone';
export type { GuideDetailSeed } from './GuidesArchiveData';

function formatGuideDate(value: string | null, timeZone?: string): string {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', timeZone });
}

function detailSlugFromPath(path: string): string | null {
  const normalized = path.replace(/\/+$/, '');
  const prefix = '/guides-archive/';
  if (!normalized.startsWith(prefix)) return null;
  const slug = decodeURIComponent(normalized.slice(prefix.length).trim());
  return slug || null;
}

function guideKindLabel(kind: string | null): string {
  return kind || 'Архив';
}

function GuideArchiveCard({ guide, navigatePath }: { key?: React.Key; guide: GuideArchiveItem; navigatePath: (path: string) => void }) {
  const href = `/guides-archive/${encodeURIComponent(guide.slug)}/`;
  const date = guide.publishedAt ? formatGuideDate(guide.publishedAt) : '';
  return (
    <a
      href={href}
      className="guide-archive-card"
      onClick={(event) => {
        event.preventDefault();
        navigatePath(href);
      }}
    >
      {guide.image ? (
        <span className="guide-archive-card-media">
          <img src={guide.image} alt="" loading="lazy" decoding="async" />
        </span>
      ) : (
        <span className="guide-archive-card-media guide-archive-card-media-empty">
          <BookOpen size={28} />
        </span>
      )}
      <span className="guide-archive-card-body">
        <span className="guide-archive-card-meta">
          <span>{guideKindLabel(guide.kind)}</span>
          {date && <span>{date}</span>}
        </span>
        <strong>{guide.title}</strong>
        {guide.description && <span className="guide-archive-card-description">{guide.description}</span>}
        {guide.menuName && <span className="guide-archive-card-section">{guide.menuName}</span>}
      </span>
    </a>
  );
}

function GuidesArchiveList({ navigatePath }: { navigatePath: (path: string) => void }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [kind, setKind] = useState('');
  const { data, pending, error, retry } = useGuidesArchivePage(page, submittedQuery, kind);

  const visibleKinds = useMemo(() => data?.filters.kinds.filter(item => item.count > 0) ?? [], [data]);

  return (
    <section className="guide-archive-page">
      <SectionBanner title="Архив гайдов" />

      <div className="guide-archive-toolbar">
        <form
          className="guide-archive-search"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSubmittedQuery(query);
          }}
        >
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по архиву..."
          />
          <button type="submit">Найти</button>
        </form>

        <div className="guide-archive-kind-filter" aria-label="Тип материала">
          <button
            type="button"
            className={!kind ? 'active' : ''}
            onClick={() => {
              setKind('');
              setPage(1);
            }}
          >
            Все
          </button>
          {visibleKinds.map(item => (
            <button
              key={item.slug}
              type="button"
              className={kind === item.slug ? 'active' : ''}
              onClick={() => {
                setKind(item.slug);
                setPage(1);
              }}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="guide-archive-summary">
        {/* The count is unknown until the page arrives: a placeholder, never «0 материалов». */}
        {(pending || data) && (
          <span>
            <BookOpen size={17} />
            {pending || !data ? <LoadingBlock className="guide-archive-summary-count-skeleton" /> : ` ${data.total} материалов`}
          </span>
        )}
        {submittedQuery && <span><Search size={17} /> Поиск: {submittedQuery}</span>}
        {kind && <span><Tag size={17} /> {visibleKinds.find(item => item.slug === kind)?.label ?? kind}</span>}
      </div>
      {error && (
        <AsyncSurfaceState variant="error" compact={Boolean(data)} title="Не удалось загрузить архив гайдов"
          message={error} actionLabel="Повторить" onAction={retry} />
      )}
      {!data && pending && <GuidesArchiveSkeleton />}

      {data && (
        <>
          <div className="guide-archive-grid data-surface" aria-busy={pending}>
            {data.items.map(item => (
              <GuideArchiveCard key={item.id} guide={item} navigatePath={navigatePath} />
            ))}
          </div>

          <div className="guide-archive-pagination">
            <button
              type="button"
              disabled={page <= 1 || pending}
              onClick={() => setPage(current => Math.max(1, current - 1))}
            >
              <ChevronLeft size={18} />
              Назад
            </button>
            <span>Страница {data.page} из {data.totalPages}</span>
            <button
              type="button"
              disabled={page >= data.totalPages || pending}
              onClick={() => setPage(current => Math.min(data.totalPages, current + 1))}
            >
              Вперед
              <ChevronRight size={18} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function GuideBackButton({ navigatePath }: { navigatePath: (path: string) => void }) {
  return (
    <button type="button" className="guide-archive-back" onClick={() => navigatePath('/guides-archive')}>
      <ArrowLeft size={18} />
      К архиву
    </button>
  );
}

/** The banner and header of a guide: the same markup for the server teaser and the full guide. */
export function GuideArchiveDetailHeader({ guide }: { guide: GuideDetailSeed }) {
  // The guest teaser is server-rendered: one zone until hydration, then the viewer's.
  const timeZone = useViewerTimeZone();
  return (
    <>
      <SectionBanner title={guide.title} />
      <header className="guide-archive-detail-header">
        {guide.image && (
          <img className="guide-archive-detail-cover" src={guide.image} alt="" loading="lazy" decoding="async" />
        )}
        <div>
          <span className="guide-archive-eyebrow">{guideKindLabel(guide.kind)}</span>
          <div className="guide-archive-detail-meta">
            {guide.publishedAt && <span><CalendarDays size={17} /> {formatGuideDate(guide.publishedAt, timeZone)}</span>}
            {guide.menuName && <span><Tag size={17} /> {guide.menuName}</span>}
          </div>
          {guide.description && <p>{guide.description}</p>}
        </div>
      </header>
    </>
  );
}

/**
 * A guide for a reader with access. The server teaser (`seed`) is already on
 * screen when access is confirmed: its back control, banner and header stay
 * as they are and only the body, which the teaser never has, waits for the
 * request. Without a teaser the whole detail waits in its fitted skeleton.
 */
function GuidesArchiveDetail({ slug, navigatePath, seed }: {
  slug: string;
  navigatePath: (path: string) => void;
  seed?: GuideDetailSeed | null;
}) {
  const { guide, error, missing, retry } = useGuideDetail(slug);
  const [seedSlug] = useState(slug);
  const header = guide ?? (slug === seedSlug ? seed : null);

  if (!guide && !error && !header) return <section className="guide-archive-page"><GuideDetailSkeleton /></section>;

  return (
    <article className="guide-archive-detail">
      <GuideBackButton navigatePath={navigatePath} />
      {header && <GuideArchiveDetailHeader guide={header} />}
      {error ? (
        <AsyncSurfaceState variant="error" title={missing ? 'Гайд не найден' : 'Не удалось загрузить гайд'}
          message={missing ? undefined : error} actionLabel={missing ? undefined : 'Повторить'} onAction={missing ? undefined : retry} />
      ) : !guide ? (
        <GuideReaderSkeleton />
      ) : guide.contentHtml ? (
        <div className="guide-archive-reader" dangerouslySetInnerHTML={{ __html: guide.contentHtml }} />
      ) : (
        <div className="guide-archive-reader">
          <p>{guide.fallbackText}</p>
        </div>
      )}
    </article>
  );
}

export default function GuidesArchive({ currentPath, navigatePath, detailSeed }: {
  currentPath: string;
  navigatePath: (path: string) => void;
  /** The server-rendered teaser of the guide at `currentPath`, kept on screen while its body loads. */
  detailSeed?: GuideDetailSeed | null;
}) {
  const slug = detailSlugFromPath(currentPath);
  if (slug) return <GuidesArchiveDetail slug={slug} navigatePath={navigatePath} seed={detailSeed} />;
  return <GuidesArchiveList navigatePath={navigatePath} />;
}
