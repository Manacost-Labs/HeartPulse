import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Search, Tag } from 'lucide-react';

interface GuideFilter {
  slug: string;
  label: string;
  count: number;
}

interface GuideArchiveItem {
  id: number;
  slug: string;
  title: string;
  description: string;
  image: string | null;
  publishedAt: string | null;
  menuName: string | null;
  menuCode: string | null;
  kind: string | null;
  kindSlug: string | null;
  oldUrl: string | null;
}

interface GuidesArchiveResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  items: GuideArchiveItem[];
  filters: {
    kinds: GuideFilter[];
    menus: GuideFilter[];
  };
}

interface GuideDetail extends GuideArchiveItem {
  keywords: string | null;
  replyCount: number;
  contentHtml: string;
  fallbackText: string;
  sourceUrl: string | null;
}

const PAGE_SIZE = 18;

function formatGuideDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
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
  const href = `/guides-archive/${encodeURIComponent(guide.slug)}`;
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
  const [data, setData] = useState<GuidesArchiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [kind, setKind] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (submittedQuery.trim()) params.set('q', submittedQuery.trim());
    if (kind) params.set('kind', kind);

    try {
      const response = await fetch(`/api/guides-archive?${params.toString()}`);
      if (!response.ok) throw new Error('Не удалось загрузить архив');
      const payload = await response.json();
      setData(payload);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить архив гайдов');
    } finally {
      setLoading(false);
    }
  }, [kind, page, submittedQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleKinds = useMemo(() => data?.filters.kinds.filter(item => item.count > 0) ?? [], [data]);

  return (
    <section className="guide-archive-page">
      <div className="guide-archive-hero">
        <span className="guide-archive-eyebrow">Архив Манакоста</span>
        <h1>Архив гайдов</h1>
        <p>Старые гайды, мета-отчеты и материалы Koloda Hearthstone в новом аккуратном формате для чтения.</p>
      </div>

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
        <span><BookOpen size={17} /> {data?.total ?? 0} материалов</span>
        {submittedQuery && <span><Search size={17} /> Поиск: {submittedQuery}</span>}
        {kind && <span><Tag size={17} /> {visibleKinds.find(item => item.slug === kind)?.label ?? kind}</span>}
      </div>

      {error && <div className="guide-archive-error">{error}</div>}
      {loading && <div className="guide-archive-loading">Загружаем архив...</div>}

      {!loading && data && (
        <>
          <div className="guide-archive-grid">
            {data.items.map(item => (
              <GuideArchiveCard key={item.id} guide={item} navigatePath={navigatePath} />
            ))}
          </div>

          <div className="guide-archive-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(current => Math.max(1, current - 1))}
            >
              <ChevronLeft size={18} />
              Назад
            </button>
            <span>Страница {data.page} из {data.totalPages}</span>
            <button
              type="button"
              disabled={page >= data.totalPages}
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

function GuidesArchiveDetail({ slug, navigatePath }: { slug: string; navigatePath: (path: string) => void }) {
  const [guide, setGuide] = useState<GuideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/guides-archive/${encodeURIComponent(slug)}`)
      .then(response => {
        if (!response.ok) throw new Error(response.status === 404 ? 'Гайд не найден' : 'Не удалось загрузить гайд');
        return response.json();
      })
      .then(payload => {
        if (!cancelled) setGuide(payload);
      })
      .catch(err => {
        if (!cancelled) setError(err?.message || 'Не удалось загрузить гайд');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) return <div className="guide-archive-loading">Загружаем гайд...</div>;
  if (error || !guide) {
    return (
      <section className="guide-archive-page">
        <button type="button" className="guide-archive-back" onClick={() => navigatePath('/guides-archive')}>
          <ArrowLeft size={18} />
          К архиву
        </button>
        <div className="guide-archive-error">{error || 'Гайд не найден'}</div>
      </section>
    );
  }

  return (
    <article className="guide-archive-detail">
      <button type="button" className="guide-archive-back" onClick={() => navigatePath('/guides-archive')}>
        <ArrowLeft size={18} />
        К архиву
      </button>

      <header className="guide-archive-detail-header">
        {guide.image && (
          <img className="guide-archive-detail-cover" src={guide.image} alt="" loading="lazy" decoding="async" />
        )}
        <div>
          <span className="guide-archive-eyebrow">{guideKindLabel(guide.kind)}</span>
          <h1>{guide.title}</h1>
          <div className="guide-archive-detail-meta">
            {guide.publishedAt && <span><CalendarDays size={17} /> {formatGuideDate(guide.publishedAt)}</span>}
            {guide.menuName && <span><Tag size={17} /> {guide.menuName}</span>}
          </div>
          {guide.description && <p>{guide.description}</p>}
        </div>
      </header>

      {guide.contentHtml ? (
        <div className="guide-archive-reader" dangerouslySetInnerHTML={{ __html: guide.contentHtml }} />
      ) : (
        <div className="guide-archive-reader">
          <p>{guide.fallbackText}</p>
        </div>
      )}
    </article>
  );
}

export default function GuidesArchive({ currentPath, navigatePath }: { currentPath: string; navigatePath: (path: string) => void }) {
  const slug = detailSlugFromPath(currentPath);
  if (slug) return <GuidesArchiveDetail slug={slug} navigatePath={navigatePath} />;
  return <GuidesArchiveList navigatePath={navigatePath} />;
}
