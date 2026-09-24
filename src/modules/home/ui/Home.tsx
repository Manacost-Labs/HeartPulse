import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Send, Sparkles } from 'lucide-react';
import type { HomeArticle } from './HomeLatestArticles';
import type { HomeSummaryData } from '../model/homeSummary';
import { HomeHero } from './HomeHero';
import './Home.css';

const HomeArenaDirectory = React.lazy(() => import('./HomeArenaDirectory'));
const HomeBattlegrounds = React.lazy(() => import('./HomeBattlegrounds'));
const HomeLatestArticles = React.lazy(() => import('./HomeLatestArticles'));

function HomeSectionFallback({ announce = false, label }: { announce?: boolean; label: string }) {
  return (
    <section className="home-deferred-placeholder" {...(announce ? { role: 'status', 'aria-live': 'polite' } : {})}>
      <span>Загружается раздел «{label}»…</span>
    </section>
  );
}

const HOME_SECTION_PRELOAD_MARGIN = '720px 0px';

function DeferredHomeSection({ children, label }: React.PropsWithChildren<{ label: string }>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const container = containerRef.current;
    if (!container || nearViewport) return undefined;
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

export default function HomeTab({ homeSummaryData, loadingHomeSummary, articles, loadingArticles, onNavigate, faq }: {
  homeSummaryData: HomeSummaryData | null;
  loadingHomeSummary: boolean;
  articles: HomeArticle[];
  loadingArticles: boolean;
  onNavigate: (tab: string) => void;
  faq: React.ReactNode;
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

      <DeferredHomeSection label="Последние статьи">
        <React.Suspense fallback={<HomeSectionFallback announce label="Последние статьи" />}>
          <HomeLatestArticles articles={articles} loading={loadingArticles} onNavigate={onNavigate} />
        </React.Suspense>
      </DeferredHomeSection>

      <DeferredHomeSection label="Поля Сражений">
        <React.Suspense fallback={<HomeSectionFallback announce label="Поля Сражений" />}>
          <HomeBattlegrounds onNavigate={onNavigate} />
        </React.Suspense>
      </DeferredHomeSection>

      <DeferredHomeSection label="Арена">
        <React.Suspense fallback={<HomeSectionFallback announce label="Арена" />}>
          <HomeArenaDirectory onNavigate={onNavigate} />
        </React.Suspense>
      </DeferredHomeSection>

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

      <DeferredHomeSection label="Частые вопросы">
        <div className="home-faq-zone home-reveal">{faq}</div>
      </DeferredHomeSection>
    </div>
  );
}
