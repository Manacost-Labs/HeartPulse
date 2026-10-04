import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Send, Sparkles } from 'lucide-react';
import type { HomeArticle } from './HomeLatestArticles';
import type { HomeSummaryData } from '../model/homeSummary';
import { LoadingSurface } from '../../../shared/ui/LoadingSurface';
import { HomeHero } from './HomeHero';
import './Home.css';
// After Home.css: the directories' own rules win ties with its older ones,
// as they did when the directories loaded later as separate chunks.
import HomeArenaDirectory from './HomeArenaDirectory';
import HomeBattlegrounds from './HomeBattlegrounds';

// Latest articles stay lazy: a legacy host renders them without server data.
// The directories and the FAQ are static links and text, so they render with
// the page; behind a placeholder they shifted it and broke its index links.
const HomeLatestArticles = React.lazy(() => import('./HomeLatestArticles'));

function HomeSectionFallback({ label }: { label: string }) {
  return <LoadingSurface label={`Загружаем раздел «${label}»`} className="home-section-loading" />;
}

const HOME_SECTION_PRELOAD_MARGIN = '720px 0px';

function DeferredHomeSection({ children, label, eager = false }: React.PropsWithChildren<{ label: string; eager?: boolean }>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(eager);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || nearViewport) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setNearViewport(true);
      observer.disconnect();
    }, { rootMargin: HOME_SECTION_PRELOAD_MARGIN });
    observer.observe(container);
    return () => observer.disconnect();
  }, [nearViewport]);

  return (
    <div ref={containerRef} data-home-deferred-section={label}>
      {nearViewport
        ? <HomeSectionBoundary label={label}>{children}</HomeSectionBoundary>
        : <HomeSectionFallback label={label} />}
    </div>
  );
}

class HomeSectionBoundary extends React.Component<
  React.PropsWithChildren<{ label: string }>,
  { failed: boolean }
> {
  declare readonly props: React.PropsWithChildren<{ label: string }>;
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="home-deferred-placeholder" data-home-error role="alert">
        <strong>Не загрузился раздел «{this.props.label}»</strong>
        <button className="home-action home-action--primary" type="button" onClick={() => window.location.reload()}>
          Повторить
        </button>
      </section>
    );
  }
}

export default function HomeTab({ homeSummaryData, loadingHomeSummary, articles, loadingArticles, onNavigate, faq, serverArticles = false }: {
  homeSummaryData: HomeSummaryData | null;
  loadingHomeSummary: boolean;
  articles: HomeArticle[];
  loadingArticles: boolean;
  onNavigate: (tab: string) => void;
  faq: React.ReactNode;
  serverArticles?: boolean;
}) {
  return (
    <div className="home-modern home-workbench">
      <HomeHero homeSummaryData={homeSummaryData} loadingHomeSummary={loadingHomeSummary} onNavigate={onNavigate} />
      <nav className="home-page-index" aria-label="Быстрые переходы по главной странице">
        <span>На этой странице</span>
        <a href="#home-articles-heading">Статьи</a>
        <a href="#home-bg-heading">Поля Сражений</a>
        <a href="#home-arena-directory-heading">Арена</a>
        <a href="#faq-heading">Частые вопросы</a>
      </nav>

      <DeferredHomeSection label="Последние статьи" eager={serverArticles}>
        <React.Suspense fallback={<HomeSectionFallback label="Последние статьи" />}>
          <HomeLatestArticles articles={articles} loading={loadingArticles} onNavigate={onNavigate} />
        </React.Suspense>
      </DeferredHomeSection>

      <HomeSectionBoundary label="Поля Сражений">
        <HomeBattlegrounds onNavigate={onNavigate} />
      </HomeSectionBoundary>

      <HomeSectionBoundary label="Арена">
        <HomeArenaDirectory onNavigate={onNavigate} />
      </HomeSectionBoundary>

      <aside className="home-community home-reveal" aria-label="Сообщество и поддержка">
        <span className="home-community__lead">
          <small>Оставайтесь на связи</small>
          <strong>Новости, патчи и развитие проекта</strong>
        </span>
        <a href="https://t.me/manacost_ru" target="_blank" rel="noreferrer">
          <Send size={19} aria-hidden="true" />
          <span><strong>Telegram</strong><small>Патчи и мета</small></span>
          <ArrowRight size={17} aria-hidden="true" />
        </a>
        <a href="https://boosty.to/kolodahearthstone" target="_blank" rel="noreferrer">
          <Sparkles size={19} aria-hidden="true" />
          <span><strong>Boosty</strong><small>Поддержать проект</small></span>
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </aside>

      <div className="home-faq-zone home-reveal">{faq}</div>
    </div>
  );
}
