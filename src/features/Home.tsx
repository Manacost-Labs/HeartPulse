import React, { useMemo } from 'react';
import {
  ArrowRight,
  BarChart3,
  Send,
  Sparkles,
} from 'lucide-react';
import type { HomeArticle } from './HomeLatestArticles';
import './Home.css';

const HOME_SECTION_RELOAD_PREFIX = 'home_section_reload_v1:';

function lazyHomeSection<T extends React.ComponentType<any>>(
  section: string,
  loader: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const reloadKey = `${HOME_SECTION_RELOAD_PREFIX}${section}`;
    try {
      const module = await loader();
      try { window.sessionStorage.removeItem(reloadKey); } catch { /* private mode */ }
      return module;
    } catch (error) {
      try {
        if (window.sessionStorage.getItem(reloadKey) !== '1') {
          window.sessionStorage.setItem(reloadKey, '1');
          window.location.reload();
          return await new Promise<never>(() => {});
        }
      } catch {
        // Storage can be unavailable in strict privacy modes; the boundary below remains usable.
      }
      throw error;
    }
  });
}

const HomeArenaDirectory = lazyHomeSection('arena', () => import('./HomeArenaDirectory'));
const HomeBattlegrounds = lazyHomeSection('battlegrounds', () => import('./HomeBattlegrounds'));
const HomeLatestArticles = lazyHomeSection('articles', () => import('./HomeLatestArticles'));

function HomeSectionFallback({ label }: { label: string }) {
  return (
    <section className="home-deferred-placeholder" role="status" aria-live="polite">
      <span>Загружается раздел «{label}»…</span>
    </section>
  );
}

interface ClassData {
  id: string;
  name: string;
  winrate: number;
}

interface HomeSummaryCard {
  cardId: string;
  name: string;
  imageHa?: string | null;
  imageRu?: string | null;
}

interface HomeSummaryLegendary {
  cardId: string;
  name: string;
  imageHa?: string | null;
  imageRu?: string | null;
  winRate: number | null;
}

interface HomeBattlegroundSpotlight {
  dbfId: number;
  name: string;
  image: string;
  tier: string;
  avgPlacement: number;
  pickRate: number | null;
  placementDistribution: number[];
  heroPower?: {
    name?: string;
    text?: string;
    image?: string;
  };
  updatedAt?: string | null;
  source?: string;
}

interface HomeSummaryData {
  topClasses: ClassData[];
  topCards: HomeSummaryCard[];
  topLegendaries: HomeSummaryLegendary[];
  battlegroundSpotlight?: HomeBattlegroundSpotlight | null;
  updatedAt?: Record<string, string | null>;
  sources?: Record<string, string>;
}

const CLASS_ICON_BY_ID: Record<string, string> = {
  dk: '/class_icon/ui/deathknight-64.webp',
  'death-knight': '/class_icon/ui/deathknight-64.webp',
  dh: '/class_icon/ui/demonhunter-64.webp',
  'demon-hunter': '/class_icon/ui/demonhunter-64.webp',
  druid: '/class_icon/ui/druid-64.webp',
  hunter: '/class_icon/ui/hunter-64.webp',
  mage: '/class_icon/ui/mage-64.webp',
  paladin: '/class_icon/ui/paladin-64.webp',
  priest: '/class_icon/ui/priest-64.webp',
  rogue: '/class_icon/ui/rogue-64.webp',
  shaman: '/class_icon/ui/shaman-64.webp',
  warlock: '/class_icon/ui/warlock-64.webp',
  warrior: '/class_icon/ui/warrior-64.webp',
};

export default function HomeTab({ homeSummaryData, loadingHomeSummary, articles, loadingArticles, onNavigate, faq }: {
  homeSummaryData: HomeSummaryData | null;
  loadingHomeSummary: boolean;
  articles: HomeArticle[];
  loadingArticles: boolean;
  onNavigate: (tab: string) => void;
  faq: React.ReactNode;
}) {
  const topClasses = useMemo(
    () => [...(homeSummaryData?.topClasses ?? [])]
      .sort((a, b) => b.winrate - a.winrate)
      .slice(0, 3),
    [homeSummaryData?.topClasses],
  );

  return (
    <div className="home-modern home-workbench">
      <section className="home-stage" aria-labelledby="draft-home-title">
        <div className="home-stage__copy">
          <span className="home-stage__label"><span aria-hidden="true" /> Данные обновляются автоматически</span>
          <h1 id="draft-home-title">Мета <span>на сегодня</span></h1>
          <p>
            Сразу видно лидера Арены, свежесть данных и ключевые инструменты. Ниже — отдельные рабочие зоны Арены и Полей Сражений без повторяющихся вступлений.
          </p>
          <div className="home-stage__actions">
            <a
              href="/tierlist"
              className="home-action home-action--primary"
              onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('tierlist'); }}
            >
              Открыть тир-лист <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a
              href="/classes"
              className="home-action home-action--secondary"
              onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('winrates'); }}
            >
              Сравнить классы
            </a>
          </div>
        </div>

        <figure className="home-stage__character" aria-hidden="true">
          <img
            src="/wallpaper/home-paladin-hero.webp"
            alt=""
            width={1280}
            height={853}
            decoding="async"
            fetchPriority="high"
          />
        </figure>

        <aside className="home-draft-orbit" aria-live="polite" aria-label="Классы-лидеры текущей меты">
          <span className="home-draft-orbit__caption">Топ классов Арены</span>
          <div className="home-draft-orbit__board">
            {loadingHomeSummary && topClasses.length === 0
              ? [0, 1, 2].map(index => <span key={index} className={`home-orbit-class home-orbit-class--${index + 1} home-orbit-class--loading`} />)
              : topClasses.map((classItem, index) => {
                const icon = CLASS_ICON_BY_ID[classItem.id];
                return (
                  <a
                    key={classItem.id}
                    href="/classes"
                    className={`home-orbit-class home-orbit-class--${index + 1}`}
                    onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('winrates'); }}
                  >
                    <span className="home-orbit-class__icon">
                      {icon
                        ? <img src={icon} alt="" width={64} height={64} decoding="async" />
                        : <BarChart3 size={24} aria-hidden="true" />}
                    </span>
                    <span className="home-orbit-class__copy">
                      <small>#{index + 1}</small>
                      <strong>{classItem.name}</strong>
                      <b>{classItem.winrate.toFixed(1)}%</b>
                    </span>
                  </a>
                );
              })}
            {!loadingHomeSummary && topClasses.length === 0 && (
              <a
                href="/classes"
                className="home-orbit-empty"
                onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('winrates'); }}
              >
                <BarChart3 size={22} aria-hidden="true" />
                <span><strong>Срез меты обновляется</strong><small>Рейтинг классов доступен на отдельной странице</small></span>
              </a>
            )}
          </div>
          <a
            href="/classes"
            className="home-orbit-action"
            onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('winrates'); }}
          >
            Полный рейтинг классов <ArrowRight size={15} aria-hidden="true" />
          </a>
        </aside>
      </section>

      <nav className="home-page-index" aria-label="Быстрые переходы по главной странице">
        <span>На этой странице</span>
        <a href="#home-articles-heading">Статьи</a>
        <a href="#home-bg-heading">Поля Сражений</a>
        <a href="#home-arena-directory-heading">Арена</a>
        <a href="#faq-heading">Частые вопросы</a>
      </nav>

      <React.Suspense fallback={<HomeSectionFallback label="Последние статьи" />}>
        <HomeLatestArticles articles={articles} loading={loadingArticles} onNavigate={onNavigate} />
      </React.Suspense>

      <React.Suspense fallback={<HomeSectionFallback label="Поля Сражений" />}>
        <HomeBattlegrounds onNavigate={onNavigate} />
      </React.Suspense>

      <React.Suspense fallback={<HomeSectionFallback label="Арена" />}>
        <HomeArenaDirectory onNavigate={onNavigate} />
      </React.Suspense>

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
