import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Clock3,
  Send,
  Sparkles,
} from 'lucide-react';
import HomeArenaDirectory from './HomeArenaDirectory';
import HomeBattlegrounds from './HomeBattlegrounds';
import HomeLatestArticles, { type HomeArticle } from './HomeLatestArticles';
import './Home.css';

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

function formatFreshness(updatedAt?: Record<string, string | null>): string {
  const timestamps = Object.values(updatedAt ?? {})
    .filter((value): value is string => Boolean(value))
    .map(value => new Date(value))
    .filter(date => !Number.isNaN(date.getTime()));
  const latestTimestamp = timestamps.length
    ? Math.max(...timestamps.map(date => date.getTime()))
    : Number.NaN;
  const latest = Number.isNaN(latestTimestamp) ? null : new Date(latestTimestamp);

  if (!latest) return 'Синхронизация данных';

  const now = new Date();
  const sameDay = latest.toDateString() === now.toDateString();
  const time = latest.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Сегодня, ${time}`;

  return latest.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function EmptyRail({ text }: { text: string }) {
  return (
    <div className="draft-empty-state" role="status">
      <Clock3 size={18} aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

function DeferredCardImage({ src, alt }: { src: string; alt: string }) {
  const slotRef = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    if (!('IntersectionObserver' in window)) {
      setReady(true);
      return;
    }

    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setReady(true);
      observer.disconnect();
    }, { rootMargin: '350px 0px' });

    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={slotRef} className="draft-card-image">
      {ready
        ? <img src={src} alt={alt} loading="lazy" decoding="async" fetchPriority="low" width={96} height={144} />
        : <span className="draft-card-image__placeholder" aria-hidden="true" />}
    </span>
  );
}

function HomeBattlegroundSpotlightChart({ spotlight, onNavigate }: {
  spotlight?: HomeBattlegroundSpotlight | null;
  onNavigate: (tab: string) => void;
}) {
  const values = spotlight?.placementDistribution ?? [];
  const width = 680;
  const height = 230;
  const padX = 42;
  const padTop = 24;
  const padBottom = 42;
  const maxValue = Math.max(1, ...values);
  const chartBottom = height - padBottom;
  const points = values.map((value, index) => ({
    value,
    x: padX + (index / Math.max(1, values.length - 1)) * (width - padX * 2),
    y: padTop + (1 - value / maxValue) * (chartBottom - padTop),
  }));
  const linePath = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const areaPath = points.length
    ? `M ${points[0].x.toFixed(1)} ${chartBottom} ${points.map(point => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')} L ${points[points.length - 1].x.toFixed(1)} ${chartBottom} Z`
    : '';

  return (
    <section className="home-bg-spotlight" aria-labelledby="home-bg-spotlight-heading">
      <div className="home-bg-spotlight__hero">
        <div>
          <span>Пример из текущей BG-меты</span>
          <h3 id="home-bg-spotlight-heading">Распределение мест героя</h3>
        </div>
        {spotlight ? (
          <React.Fragment>
            <div className="home-bg-spotlight__identity">
              {spotlight.image && <img src={spotlight.image} alt="" loading="lazy" decoding="async" />}
              <div>
                <strong>{spotlight.name}</strong>
                <span>Тир {spotlight.tier} · среднее место {spotlight.avgPlacement.toFixed(2).replace('.', ',')}</span>
                {spotlight.pickRate !== null && <small>Выбор героя: {spotlight.pickRate.toFixed(1).replace('.', ',')}%</small>}
              </div>
            </div>
            {spotlight.heroPower?.name && (
              <p className="home-bg-spotlight__power">
                <b>{spotlight.heroPower.name}</b>
                {spotlight.heroPower.text && <span>{spotlight.heroPower.text}</span>}
              </p>
            )}
          </React.Fragment>
        ) : (
          <p className="home-bg-spotlight__empty">BG-срез обновляется. Полный рейтинг героев уже доступен в разделе Полей Сражений.</p>
        )}
        <a
          href="/heroes"
          onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('bg-heroes'); }}
        >
          Все герои <ArrowRight size={15} aria-hidden="true" />
        </a>
      </div>

      <div className="home-bg-spotlight__chart">
        {points.length > 0 ? (
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="home-bg-chart-title home-bg-chart-desc">
            <title id="home-bg-chart-title">Вероятность занять каждое место героем {spotlight?.name}</title>
            <desc id="home-bg-chart-desc">График показывает долю первых, вторых и последующих мест до восьмого.</desc>
            <defs>
              <linearGradient id="homeBgChartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d9ab49" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#8f536d" stopOpacity="0.04" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75, 1].map(level => {
              const y = padTop + (1 - level) * (chartBottom - padTop);
              return <line key={level} x1={padX} x2={width - padX} y1={y} y2={y} className="home-bg-chart__grid" />;
            })}
            <path d={areaPath} fill="url(#homeBgChartFill)" />
            <path d={linePath} className="home-bg-chart__line" />
            {points.map((point, index) => (
              <g key={`place-${index + 1}`}>
                <circle cx={point.x} cy={point.y} r="6" className="home-bg-chart__dot" />
                <text x={point.x} y={point.y - 13} textAnchor="middle" className="home-bg-chart__value">{point.value.toFixed(1)}%</text>
                <text x={point.x} y={height - 14} textAnchor="middle" className="home-bg-chart__label">{index + 1} место</text>
              </g>
            ))}
          </svg>
        ) : (
          <div className="home-bg-chart__placeholder" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => <span key={`place-placeholder-${index + 1}`} style={{ height: `${35 + index * 5}%` }} />)}
          </div>
        )}
      </div>
    </section>
  );
}

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

  const topLegendaries = useMemo(
    () => [...(homeSummaryData?.topLegendaries ?? [])]
      .filter(group => group.winRate !== null)
      .slice(0, 6),
    [homeSummaryData?.topLegendaries],
  );

  const topCards = useMemo(
    () => [...(homeSummaryData?.topCards ?? [])].slice(0, 6),
    [homeSummaryData?.topCards],
  );

  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;

    const sections: HTMLElement[] = Array.from(root.querySelectorAll('.home-reveal')) as HTMLElement[];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      sections.forEach(section => section.classList.add('is-visible'));
      return;
    }

    root.classList.add('home-reveal-enabled');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={pageRef} className="home-modern home-workbench">
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
        <a href="#home-bg-heading">Поля Сражений</a>
        <a href="#home-arena-directory-heading">Арена</a>
        <a href="#home-data-heading">Статистика</a>
        <a href="#home-articles-heading">Статьи</a>
        <a href="#faq-heading">Частые вопросы</a>
      </nav>

      <HomeBattlegrounds onNavigate={onNavigate} />

      <HomeArenaDirectory onNavigate={onNavigate} />

      <section className="home-data home-arena-board home-reveal" aria-labelledby="home-data-heading">
        <div className="home-section-heading home-section-heading--data">
          <div>
            <span>Полезная статистика</span>
            <h2 id="home-data-heading">Мета в цифрах</h2>
          </div>
          <p>Реальные данные Арены и Полей Сражений в компактной форме.</p>
        </div>
        <HomeBattlegroundSpotlightChart spotlight={homeSummaryData?.battlegroundSpotlight} onNavigate={onNavigate} />
        <div className="home-data__layout">
          <section className="home-ranking" aria-labelledby="top-classes-heading">
            <div className="home-subheading">
              <h3 id="top-classes-heading">Классы-лидеры</h3>
              <a
                href="/classes"
                onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('winrates'); }}
              >
                Все классы <ArrowRight size={15} aria-hidden="true" />
              </a>
            </div>
            <div className="home-ranking__list">
              {loadingHomeSummary && topClasses.length === 0
                ? [0, 1, 2].map(index => <div key={index} className="home-ranking__row draft-skeleton" />)
                : topClasses.map((classItem, index) => {
                  const icon = CLASS_ICON_BY_ID[classItem.id];
                  const relativeWinrate = Math.max(8, Math.min(100, ((classItem.winrate - 40) / 20) * 100));
                  return (
                    <a
                      key={classItem.id}
                      href="/classes"
                      className="home-ranking__row"
                      onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('winrates'); }}
                    >
                      <span className="home-ranking__rank">{index + 1}</span>
                      {icon && <img src={icon} alt="" width={44} height={44} decoding="async" />}
                      <span className="home-ranking__name">{classItem.name}</span>
                      <strong>{classItem.winrate.toFixed(1)}%</strong>
                      <span className="home-ranking__bar" aria-hidden="true">
                        <span style={{ width: `${relativeWinrate}%` }} />
                      </span>
                    </a>
                  );
                })}
              {!loadingHomeSummary && topClasses.length === 0 && <EmptyRail text="Статистика классов обновляется" />}
            </div>
          </section>

          <div className="home-card-strips">
            <section className="home-card-strip" aria-labelledby="top-cards-heading">
              <div className="home-subheading">
                <h3 id="top-cards-heading">Лучшие карты</h3>
                <a
                  href="/tierlist"
                  onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('tierlist'); }}
                >
                  Тир-лист <ArrowRight size={15} aria-hidden="true" />
                </a>
              </div>
              <div className="home-card-rail-shell">
                <div className="draft-card-rail">
                {loadingHomeSummary && topCards.length === 0
                  ? Array.from({ length: 5 }).map((_, index) => <div key={index} className="draft-card-item draft-skeleton" />)
                  : topCards.map(card => {
                    const image = card.imageRu || card.imageHa || null;
                    return (
                      <a
                        key={card.cardId}
                        href="/tierlist"
                        className="draft-card-item"
                        onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('tierlist'); }}
                      >
                        {image
                          ? <DeferredCardImage src={image} alt={card.name} />
                          : <span className="draft-card-item__fallback">{card.name}</span>}
                        <span>{card.name}</span>
                      </a>
                    );
                  })}
                {!loadingHomeSummary && topCards.length === 0 && <EmptyRail text="Карты скоро появятся" />}
                </div>
                <span className="home-rail-hint" aria-hidden="true">Проведите, чтобы увидеть ещё →</span>
              </div>
            </section>

            <section className="home-card-strip" aria-labelledby="top-legendaries-heading">
              <div className="home-subheading">
                <h3 id="top-legendaries-heading">Легендарные группы</h3>
                <a
                  href="/legendaries"
                  onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('legendaries'); }}
                >
                  Все группы <ArrowRight size={15} aria-hidden="true" />
                </a>
              </div>
              <div className="home-card-rail-shell">
                <div className="draft-card-rail">
                {loadingHomeSummary && topLegendaries.length === 0
                  ? Array.from({ length: 5 }).map((_, index) => <div key={index} className="draft-card-item draft-skeleton" />)
                  : topLegendaries.map(group => {
                    const image = group.imageRu || group.imageHa || null;
                    return (
                      <a
                        key={group.cardId}
                        href="/legendaries"
                        className="draft-card-item"
                        onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate('legendaries'); }}
                      >
                        <span className="draft-card-item__art">
                          {image
                            ? <DeferredCardImage src={image} alt={group.name} />
                            : <span className="draft-card-item__fallback">{group.name}</span>}
                          {group.winRate !== null && <strong>{group.winRate.toFixed(1)}%</strong>}
                        </span>
                        <span>{group.name}</span>
                      </a>
                    );
                  })}
                {!loadingHomeSummary && topLegendaries.length === 0 && <EmptyRail text="Легендарные группы обновляются" />}
                </div>
                <span className="home-rail-hint" aria-hidden="true">Проведите, чтобы увидеть ещё →</span>
              </div>
            </section>
          </div>
        </div>
      </section>

      <HomeLatestArticles articles={articles} loading={loadingArticles} onNavigate={onNavigate} />

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
