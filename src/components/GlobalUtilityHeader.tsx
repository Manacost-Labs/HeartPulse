import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ChevronRight,
  CircleHelp,
  GraduationCap,
  Search,
  X,
} from 'lucide-react';
import './GlobalUtilityHeader.css';
import type { PageTourAccess } from '../features/pageTour/pageTourDefinitions';
import { PageTourInviteLayer, PageTourLayer, usePageTourLauncher } from '../features/pageTour/usePageTourLauncher';
import {
  hasSubscriptionEntitlement,
  type SubscriptionAccess,
} from '../modules/subscriptions/public';
import type { PaletteHandle } from './globalSearch/SearchPalette';
import {
  readRecentEntries, rememberRecentEntry,
  type PaletteEntry, type SearchArticle,
} from './globalSearch/searchPaletteModel';

// The palette's results, grouping and keyboard model load on first use; a
// pointer over the field or its focus starts the download.
const loadSearchPalette = () => import('./globalSearch/SearchPalette');
const LazySearchPalette = lazy(loadSearchPalette);

const browserStorage = () => { try { return window.localStorage; } catch { return null; } };

export type GlobalSearchAccess = {
  confirmed: boolean;
  admin: boolean;
  anySubscription: boolean;
  standard: boolean;
  arenaArticles: boolean;
  battlegroundsArticles: boolean;
};

type HeaderSubscription = SubscriptionAccess | null;

function articleRequiresAccess(article: SearchArticle, access: GlobalSearchAccess): boolean {
  // A lock only for a refusal the server confirmed; while access is pending or
  // unavailable the article opens (the server checks it) and shows no lock.
  if (!access.confirmed) return false;
  if (!article.vip || access.admin) return false;
  if (article.mode === 'standard' || article.mode === 'wild') return !access.standard;
  if (article.mode === 'arena') return !access.arenaArticles;
  if (article.mode === 'battlegrounds') return !access.battlegroundsArticles;
  return !access.anySubscription;
}

export default function GlobalUtilityHeader({
  accessStatus,
  onNavigate,
  pagePath,
  auth, accessConfirmed = true, // until the server confirms access, nothing shows a lock
}: {
  accessStatus: true | HeaderSubscription; accessConfirmed?: boolean;
  onNavigate: (path: string) => void;
  pagePath: string;
  auth: boolean;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const searchPanelId = `${useId()}-search`;
  const helpPanelId = `${useId()}-help`;
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [articleError, setArticleError] = useState('');
  const [recent, setRecent] = useState<PaletteEntry[]>([]);
  const [openingArticleId, setOpeningArticleId] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const tourButtonRef = useRef<HTMLButtonElement>(null);
  const admin = accessStatus === true;
  const subscriptionStatus = admin ? null : accessStatus;
  const access: GlobalSearchAccess = {
    confirmed: accessConfirmed, admin,
    anySubscription: admin || hasSubscriptionEntitlement(subscriptionStatus, null),
    standard: admin || hasSubscriptionEntitlement(subscriptionStatus, 'standard'),
    arenaArticles: admin || hasSubscriptionEntitlement(subscriptionStatus, 'arenaArticles'),
    battlegroundsArticles: admin || hasSubscriptionEntitlement(subscriptionStatus, 'battlegroundsArticles'),
  };
  const tourAccess: PageTourAccess = {
    authenticated: auth,
    admin,
    standard: admin || hasSubscriptionEntitlement(subscriptionStatus, 'standard'),
    arena: admin || hasSubscriptionEntitlement(subscriptionStatus, 'arena'),
    battlegrounds: admin || hasSubscriptionEntitlement(subscriptionStatus, 'battlegrounds'),
  };
  const tour = usePageTourLauncher({ pagePath, auth });
  useEffect(() => {
    setSearchOpen(false);
    setHelpOpen(false);
  }, [auth, pagePath]);

  const palette = useRef<PaletteHandle | null>(null);
  const [activeOption, setActiveOption] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const onActiveOption = useCallback((id: string | undefined) => setActiveOption(id), []);
  const onLoading = useCallback((value: boolean) => setLoading(value), []);
  const openSearch = () => {
    if (!searchOpen) setRecent(readRecentEntries(browserStorage()));
    setSearchOpen(true);
  };

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
        setHelpOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const restoreHelpFocus = Boolean((document.activeElement as HTMLElement | null)?.closest('.global-help-menu'));
        setSearchOpen(false);
        setHelpOpen(false);
        if (restoreHelpFocus) window.setTimeout(() => helpButtonRef.current?.focus(), 0);
        else searchInputRef.current?.blur();
        return;
      }
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches('input, textarea, select, [contenteditable="true"]');
      const paletteKey = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key?.toLowerCase() === 'k';
      if (paletteKey || (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditing)) {
        event.preventDefault();
        setHelpOpen(false);
        // Focus opens the palette (the input's focus handler).
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
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
    setHelpOpen(false);
  };

  const runEntry = (entry: PaletteEntry) => {
    rememberRecentEntry(browserStorage(), entry);
    if (entry.kind === 'article') { void openArticle(entry.article); return; }
    closePanels();
    searchInputRef.current?.blur();
    onNavigate(entry.path);
  };

  const openArticle = async (article: SearchArticle) => {
    if (articleRequiresAccess(article, access)) {
      closePanels();
      onNavigate('/?login');
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
      setArticleError(openError?.message || 'Не удалось открыть статью');
    } finally {
      setOpeningArticleId('');
    }
  };

  return (
    <header ref={rootRef} className="global-utility-header" aria-label="Глобальный поиск и помощь">
      <div className="global-utility-header__inner">
        <div className="global-search">
          <Search size={17} aria-hidden="true" className="global-search__icon" />
          <input
            ref={searchInputRef}
            id="global-site-search"
            name="global-site-search"
            className="global-search__input"
            type="search"
            value={query}
            placeholder="Найдите статью, карту или механику…"
            aria-label="Глобальный поиск: разделы, архетипы, карты и статьи"
            aria-keyshortcuts="/ Control+K Meta+K"
            title="Поиск по сайту (/ или Ctrl+K)"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={searchOpen}
            aria-controls={searchOpen ? `${searchPanelId}-list` : undefined}
            aria-activedescendant={searchOpen ? activeOption : undefined}
            autoComplete="off"
            onPointerEnter={() => { void loadSearchPalette(); }}
            onFocus={openSearch}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
              openSearch();
              palette.current?.onKeyDown(event);
            }}
            onChange={event => {
              setQuery(event.target.value);
              setArticleError('');
              // A typed query highlights its best row, so Enter opens it.
              palette.current?.highlight(event.target.value.trim() ? 0 : -1);
              openSearch();
            }}
          />
          {!loading && query && (
            <button
              type="button"
              className="global-search__clear"
              aria-label="Очистить поиск"
              onClick={() => {
                setQuery('');
                palette.current?.highlight(-1);
                searchInputRef.current?.focus();
              }}
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
          {!loading && !query && <kbd className="global-search__shortcut" aria-hidden="true">/</kbd>}

          {searchOpen && (
            <Suspense fallback={null}>
              <LazySearchPalette panelId={searchPanelId} query={query} admin={admin} recent={recent} onRun={runEntry}
                openingArticleId={openingArticleId} articleError={articleError} handleRef={palette}
                onActiveOption={onActiveOption} onLoading={onLoading}
                locks={{ article: entry => articleRequiresAccess(entry.article, access), cardStatistics: access.confirmed && !access.standard }} />
            </Suspense>
          )}
        </div>

        {tour.available && (
          <button ref={tourButtonRef} type="button" className="global-tour-button" aria-haspopup="dialog"
            onClick={() => { closePanels(); tour.open(tourButtonRef.current); }}>
            <GraduationCap size={17} aria-hidden="true" />
            <span>Как пользоваться страницей</span>
          </button>
        )}

        <div className="global-help">
          <button
            ref={helpButtonRef}
            type="button"
            className="global-faq-button"
            aria-expanded={helpOpen}
            aria-controls={helpPanelId}
            onClick={() => {
              setSearchOpen(false);
              setHelpOpen(open => !open);
            }}
          >
            <CircleHelp size={17} aria-hidden="true" />
            <span>Помощь</span>
          </button>
          {helpOpen && (
            <div id={helpPanelId} className="global-help-menu" role="region" aria-label="Помощь по сайту">
              {tour.available && (
                <button
                  type="button"
                  className="global-help-menu__item is-tour"
                  onClick={() => {
                    closePanels();
                    tour.open(helpButtonRef.current);
                  }}
                >
                  <span><strong>Обучение по странице</strong><small>Покажем ключевые функции по шагам</small></span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              )}
              <a
                href="/faq/"
                className="global-help-menu__item"
                aria-current={window.location.pathname.replace(/\/+$/, '') === '/faq' ? 'page' : undefined}
                onClick={event => {
                  event.preventDefault();
                  closePanels();
                  onNavigate('/faq');
                }}
              >
                <span><strong>FAQ и доступ</strong><small>Авторизация, подписка и ответы на вопросы</small></span>
                <ChevronRight size={17} aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      </div>
      <PageTourLayer pagePath={pagePath} access={tourAccess} launch={tour.launch} onClose={tour.close} />
      <PageTourInviteLayer invite={tour.invite} launch={tour.launch} onAccept={tour.acceptInvite} onDismiss={tour.dismissInvite} />
    </header>
  );
}
