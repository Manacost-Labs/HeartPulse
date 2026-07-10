import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Clock3,
  Send,
  Sparkles,
} from 'lucide-react';
import HomeBattlegrounds from './HomeBattlegrounds';
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

interface HomeSummaryData {
  topClasses: ClassData[];
  topCards: HomeSummaryCard[];
  topLegendaries: HomeSummaryLegendary[];
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

const HOME_NAV_CARDS = [
  {
    id: 'winrates',
    href: '/classes',
    step: '01',
    art: '/main_assets/winrate-classes.png',
    eyebrow: 'Мета сейчас',
    title: 'Выберите класс',
    desc: 'Сравните классы и матчапы перед первым выбором.',
    stat: '11 классов',
    tone: 'blue',
  },
  {
    id: 'tierlist',
    href: '/tierlist',
    step: '02',
    art: '/main_assets/tier-list.png',
    eyebrow: 'Главный инструмент',
    title: 'Оцените карты',
    desc: 'Быстро оцените карту во время драфта — от S до F.',
    stat: 'S–F тиры',
    tone: 'violet',
  },
  {
    id: 'legendaries',
    href: '/legendaries',
    step: '03',
    art: '/main_assets/legendary_group.png',
    eyebrow: 'Первый выбор',
    title: 'Сравните легендарки',
    desc: 'Найдите сильнейшую группу по реальному винрейту.',
    stat: '165+ карт',
    tone: 'gold',
  },
] as const;

function formatFreshness(updatedAt?: Record<string, string | null>): string {
  const latest = Object.values(updatedAt ?? {})
    .filter((value): value is string => Boolean(value))
    .map(value => new Date(value))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];

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

export default function HomeTab({ homeSummaryData, loadingHomeSummary, onNavigate, faq }: {
  homeSummaryData: HomeSummaryData | null;
  loadingHomeSummary: boolean;
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

  const freshness = formatFreshness(homeSummaryData?.updatedAt);
  const bestClass = topClasses[0];
  const sourceCount = Object.keys(homeSummaryData?.sources ?? {}).length;
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
        <div className="home-stage__atmosphere" aria-hidden="true">
          <span className="home-stage__rune" />
          <span className="home-stage__spark home-stage__spark--one" />
          <span className="home-stage__spark home-stage__spark--two" />
        </div>

        <div className="home-stage__copy">
          <span className="home-stage__label"><span aria-hidden="true" /> HS-Arena · живая мета</span>
          <h1 id="draft-home-title">
            Выберите класс.<br />
            <span>Оцените карты.</span><br />
            Соберите колоду.
          </h1>
          <p>
            Текущие винрейты, тир-лист и легендарные группы собраны в одном месте,
            чтобы нужный ответ был перед глазами во время драфта.
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

        <aside className="home-draft-orbit" aria-live="polite" aria-label="Классы-лидеры текущей меты">
          <span className="home-draft-orbit__caption">Классы-лидеры</span>
          <div className="home-draft-orbit__board">
            <span className="home-draft-orbit__circle" aria-hidden="true" />
            <span className="home-draft-orbit__mana" aria-hidden="true">
              <img src="/assets/mana.png" alt="" width={82} height={82} decoding="async" />
            </span>
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

        <div className="home-stage__status" aria-label="Состояние данных">
          <span><i className="home-live-dot" aria-hidden="true" /> Данные обновляются автоматически</span>
          <span><small>Последний срез</small><time>{freshness}</time></span>
          <span><small>Источники</small><strong>{sourceCount || '—'}</strong></span>
          {bestClass && <span><small>Лидер</small><strong>{bestClass.name} · {bestClass.winrate.toFixed(1)}%</strong></span>}
        </div>
      </section>

      <nav className="home-page-index" aria-label="Быстрые переходы по главной странице">
        <span>На этой странице</span>
        <a href="#draft-tools-title">Инструменты</a>
        <a href="#home-data-heading">Арена сегодня</a>
        <a href="#home-bg-heading">Поля Сражений</a>
        <a href="#faq-heading">Частые вопросы</a>
      </nav>

      <section className="home-tools home-reveal" aria-labelledby="draft-tools-title">
        <div className="home-section-heading">
          <div>
            <span>Маршрут драфта</span>
            <h2 id="draft-tools-title">Три решения в каждой колоде</h2>
          </div>
          <p>Двигайтесь по порядку или сразу откройте нужный инструмент.</p>
        </div>
        <nav className="home-tool-path" aria-label="Основные этапы драфта">
          <ol>
            {HOME_NAV_CARDS.map(card => (
              <li key={card.id}>
                <a
                  href={card.href}
                  className="home-tool-step"
                  data-tone={card.tone}
                  onClick={(event: React.MouseEvent) => { event.preventDefault(); onNavigate(card.id); }}
                >
                  <span className="home-tool-step__number">{card.step}</span>
                  <span className="home-tool-step__art"><img src={card.art} alt="" width={108} height={108} loading="lazy" decoding="async" /></span>
                  <span className="home-tool-step__body">
                    <small>{card.eyebrow}</small>
                    <strong>{card.title}</strong>
                    <span>{card.desc}</span>
                  </span>
                  <span className="home-tool-step__meta">{card.stat}</span>
                  <ArrowRight className="home-tool-step__arrow" size={20} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </section>

      <section className="home-data home-arena-board home-reveal" aria-labelledby="home-data-heading">
        <div className="home-section-heading home-section-heading--data">
          <div>
            <span>Арена сегодня</span>
            <h2 id="home-data-heading">Сначала класс, затем карты</h2>
          </div>
          <p>Короткий срез текущей меты — без перехода в большие таблицы.</p>
        </div>
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

      <HomeBattlegrounds onNavigate={onNavigate} />

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
