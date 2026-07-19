import { useEffect, useId, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  CircleHelp,
  Library,
  LoaderCircle,
  LockKeyhole,
  Search,
  X,
} from 'lucide-react';
import './GlobalUtilityHeader.css';

type SearchArticle = {
  id: string;
  title: string;
  excerpt: string;
  tag: string;
  mode: string;
  date: string;
  url: string;
  image: string;
  vip: boolean;
};

type SearchCard = {
  id: string;
  name: string;
  nameEn: string;
  text: string;
  image: string;
  mana: number | null;
  className: string;
  cardType: string;
  formats: Array<'standard' | 'wild'>;
  path: string;
};

type SearchResponse = {
  query: string;
  articles: SearchArticle[];
  cards: SearchCard[];
  minimumQueryLength: number;
};

export type GlobalSearchAccess = {
  admin: boolean;
  anySubscription: boolean;
  standard: boolean;
  arenaArticles: boolean;
  battlegroundsArticles: boolean;
};

type HeaderSubscription = {
  hasAccess?: boolean;
  entitlements?: {
    standard?: boolean;
    arenaArticles?: boolean;
    battlegroundsArticles?: boolean;
  };
} | null;

function articleRequiresAccess(article: SearchArticle, access: GlobalSearchAccess): boolean {
  if (!article.vip || access.admin) return false;
  if (article.mode === 'standard' || article.mode === 'wild') return !access.standard;
  if (article.mode === 'arena') return !access.arenaArticles;
  if (article.mode === 'battlegrounds') return !access.battlegroundsArticles;
  return !access.anySubscription;
}

function articleModeLabel(mode: string): string {
  if (mode === 'standard') return 'Стандарт';
  if (mode === 'wild') return 'Вольный';
  if (mode === 'arena') return 'Арена';
  if (mode === 'battlegrounds') return 'Поля Сражений';
  return 'Статья';
}

function cardFormatsLabel(formats: SearchCard['formats']): string {
  if (formats.includes('standard') && formats.includes('wild')) return 'Стандарт · Вольный';
  return formats.includes('standard') ? 'Стандарт' : 'Вольный';
}

export default function GlobalUtilityHeader({
  accessStatus,
  onNavigate,
}: {
  accessStatus: true | HeaderSubscription;
  onNavigate: (path: string) => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchPanelId = `${useId()}-search`;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openingArticleId, setOpeningArticleId] = useState('');
  const admin = accessStatus === true;
  const subscriptionStatus = admin ? null : accessStatus;
  const access: GlobalSearchAccess = {
    admin,
    anySubscription: admin || Boolean(subscriptionStatus?.hasAccess),
    standard: admin || Boolean(subscriptionStatus?.entitlements?.standard),
    arenaArticles: admin || Boolean(subscriptionStatus?.entitlements?.arenaArticles),
    battlegroundsArticles: admin || Boolean(subscriptionStatus?.entitlements?.battlegroundsArticles),
  };

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setResults(null);
      setLoading(false);
      setError('');
      return undefined;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void fetch(`/api/search?q=${encodeURIComponent(normalizedQuery)}`, {
        credentials: 'same-origin',
        signal: controller.signal,
      })
        .then(async response => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Не удалось выполнить поиск');
          setResults(data as SearchResponse);
        })
        .catch(fetchError => {
          if (fetchError?.name !== 'AbortError') setError(fetchError?.message || 'Поиск временно недоступен');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 220);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSearchOpen(false);
        searchInputRef.current?.blur();
        return;
      }
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditing) {
        event.preventDefault();
        setSearchOpen(true);
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const closePanels = () => {
    setSearchOpen(false);
  };

  const openArticle = async (article: SearchArticle) => {
    if (articleRequiresAccess(article, access)) {
      closePanels();
      window.location.href = '/?login';
      return;
    }
    if (!article.vip) {
      window.open(article.url, '_blank', 'noopener,noreferrer');
      closePanels();
      return;
    }
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setOpeningArticleId(article.id);
    try {
      const response = await fetch('/api/articles/access-link', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: article.url, title: article.title }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось открыть статью');
      const nextUrl = String(data.url || article.url);
      if (tab) tab.location.href = nextUrl;
      else window.open(nextUrl, '_blank', 'noopener,noreferrer');
      closePanels();
    } catch (openError: any) {
      tab?.close();
      setError(openError?.message || 'Не удалось открыть статью');
    } finally {
      setOpeningArticleId('');
    }
  };

  const hasResults = Boolean(results && (results.articles.length || results.cards.length));

  return (
    <header ref={rootRef} className="global-utility-header" aria-label="Глобальный поиск и помощь">
      <div className="global-utility-header__inner">
        <div className="global-search">
          <Search size={17} aria-hidden="true" className="global-search__icon" />
          <input
            ref={searchInputRef}
            className="global-search__input"
            type="search"
            value={query}
            placeholder="Найдите статью, карту или механику…"
            aria-label="Глобальный поиск по статьям и картам"
            aria-keyshortcuts="/"
            onFocus={() => {
              setSearchOpen(true);
            }}
            onChange={event => {
              setQuery(event.target.value);
              setSearchOpen(true);
            }}
          />
          {loading && <LoaderCircle size={16} className="global-search__spinner" aria-label="Идет поиск" />}
          {!loading && query && (
            <button
              type="button"
              className="global-search__clear"
              aria-label="Очистить поиск"
              onClick={() => {
                setQuery('');
                setResults(null);
                searchInputRef.current?.focus();
              }}
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
          {!loading && !query && <kbd className="global-search__shortcut" aria-hidden="true">/</kbd>}

          {searchOpen && query.trim().length >= 2 && (
            <div id={searchPanelId} className="global-search-panel" role="region" aria-label="Результаты глобального поиска">
              {error ? (
                <p className="global-search-state is-error" role="alert">{error}</p>
              ) : loading && !results ? (
                <p className="global-search-state" role="status">Ищем статьи и карты…</p>
              ) : !hasResults ? (
                <p className="global-search-state" role="status">Ничего не найдено. Попробуйте название карты, механику или тему статьи.</p>
              ) : (
                <>
                  {results!.articles.length > 0 && (
                    <section className="global-search-group" aria-labelledby={`${searchPanelId}-articles`}>
                      <h2 id={`${searchPanelId}-articles`}><BookOpen size={15} aria-hidden="true" /> Статьи</h2>
                      {results!.articles.map(article => {
                        const locked = articleRequiresAccess(article, access);
                        return (
                          <button key={article.id} type="button" className="global-search-result" onClick={() => void openArticle(article)}>
                            <span className="global-search-result__thumb is-article">
                              {article.image ? <img src={article.image} alt="" loading="lazy" /> : <BookOpen size={18} aria-hidden="true" />}
                            </span>
                            <span className="global-search-result__copy">
                              <strong>{article.title}</strong>
                              <small>{article.tag || articleModeLabel(article.mode)} · {article.date}</small>
                            </span>
                            {openingArticleId === article.id ? <LoaderCircle size={16} className="global-search__spinner" /> : locked ? <LockKeyhole size={16} aria-label="Нужна подписка" /> : <ChevronRight size={16} aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </section>
                  )}

                  {results!.cards.length > 0 && (
                    <section className="global-search-group" aria-labelledby={`${searchPanelId}-cards`}>
                      <h2 id={`${searchPanelId}-cards`}><Library size={15} aria-hidden="true" /> Карты</h2>
                      {results!.cards.map(card => (
                        <button
                          key={card.id}
                          type="button"
                          className="global-search-result"
                          onClick={() => {
                            closePanels();
                            window.location.href = card.path;
                          }}
                        >
                          <span className="global-search-result__thumb is-card">
                            {card.image ? <img src={card.image} alt="" loading="lazy" /> : <Library size={18} aria-hidden="true" />}
                          </span>
                          <span className="global-search-result__copy">
                            <strong>{card.name}</strong>
                            <small>{card.mana !== null ? `${card.mana} маны · ` : ''}{cardFormatsLabel(card.formats)}</small>
                          </span>
                          {!access.standard && <span className="global-search-result__diamond"><LockKeyhole size={12} aria-hidden="true" /> Статистика</span>}
                          <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      ))}
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <a
          href="/faq"
          className="global-faq-button"
          aria-current={window.location.pathname.replace(/\/+$/, '') === '/faq' ? 'page' : undefined}
          onClick={event => {
            event.preventDefault();
            closePanels();
            onNavigate('/faq');
          }}
        >
          <CircleHelp size={17} aria-hidden="true" />
          <span>FAQ</span>
        </a>
      </div>
    </header>
  );
}
