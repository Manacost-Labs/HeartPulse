import React, { useMemo } from 'react';

interface ClassData {
  id: string;
  name: string;
  winrate: number;
}

interface WinratesData {
  classes: ClassData[];
}

interface HomeSummaryCard {
  cardId: string;
  name: string;
  imageHa: string | null;
  imageRu: string | null;
}

interface HomeSummaryLegendary {
  cardId: string;
  name: string;
  imageHa: string | null;
  imageRu: string | null;
  winRate: number | null;
}

interface HomeSummaryData {
  topClasses: ClassData[];
  topCards: HomeSummaryCard[];
  topLegendaries: HomeSummaryLegendary[];
}

const CLASS_ICON_BY_ID: Record<string, string> = {
  dk: '/class_icon/deathknight.png',
  'death-knight': '/class_icon/deathknight.png',
  dh: '/class_icon/demonhunter.png',
  'demon-hunter': '/class_icon/demonhunter.png',
  druid: '/class_icon/druid.png',
  hunter: '/class_icon/hunter.png',
  mage: '/class_icon/mage.png',
  paladin: '/class_icon/paladin.png',
  priest: '/class_icon/priest.png',
  rogue: '/class_icon/rogue.png',
  shaman: '/class_icon/shaman.png',
  warlock: '/class_icon/warlock.png',
  warrior: '/class_icon/warrior.png',
};

const LazyHomeBattlegrounds = React.lazy(() => import('./HomeBattlegrounds'));

// ─── HomeTab ──────────────────────────────────────────────────────────────────

const HOME_NAV_CARDS: Array<{
  id: 'winrates' | 'tierlist' | 'legendaries';
  href: string; img: string; title: string; desc: string; stat: string;
}> = [
  { id: 'winrates', href: '/classes',   img: '/main_assets/winrate-classes.png', title: 'Винрейт классов',   desc: 'Сравнение классов, источник данных и матчапы для выбора драфта.', stat: '11 классов' },
  { id: 'tierlist', href: '/tierlist',   img: '/main_assets/tier-list.png',       title: 'Тир-лист карт',     desc: 'Оценки карт по классам, поиск, галерея и таблица без лишнего шума.', stat: 'S-F tiers' },
  { id: 'legendaries', href: '/legendaries', img: '/main_assets/legendary_group.png', title: 'Легендарные группы', desc: 'Пакеты первого выбора с винрейтом и быстрым просмотром карт.', stat: '165+ карт' },
];

export default function HomeTab({ winratesData, loadingWinrates, homeSummaryData, loadingHomeSummary, onNavigate, faq }: {
  winratesData: WinratesData;
  loadingWinrates: boolean;
  homeSummaryData: HomeSummaryData | null;
  loadingHomeSummary: boolean;
  onNavigate: (tab: string) => void;
  faq: React.ReactNode;
}) {
  const topClasses = useMemo(
    () => {
      const summaryClasses = homeSummaryData?.topClasses ?? [];
      const source = summaryClasses.length ? summaryClasses : winratesData.classes;
      return [...source].sort((a, b) => b.winrate - a.winrate).slice(0, 3);
    },
    [homeSummaryData?.topClasses, winratesData.classes],
  );

  const topLegendaries = useMemo(
    () => [...(homeSummaryData?.topLegendaries ?? [])]
      .filter(g => g.winRate !== null)
      .slice(0, 8),
    [homeSummaryData?.topLegendaries],
  );

  const topCards = useMemo(() => {
    return [...(homeSummaryData?.topCards ?? [])].slice(0, 10);
  }, [homeSummaryData?.topCards]);

  return (
    <div className="home-modern flex flex-col gap-8">
      <h1 className="sr-only">HS-Arena — статистика Арены Hearthstone: тир-лист карт, винрейты классов, легендарные группы</h1>
      <section className="home-boosty-banner" aria-label="Баннер Манакоста">
        <a
          href="https://boosty.to/kolodahearthstone"
          target="_blank"
          rel="noopener noreferrer"
          className="home-boosty-banner-link"
        >
          <picture>
            <source
              media="(max-width: 640px)"
              type="image/avif"
              srcSet="/main_assets/boosty-feed-banner-mobile.avif?v=boosty-feed-20260625"
            />
            <source
              media="(max-width: 640px)"
              type="image/webp"
              srcSet="/main_assets/boosty-feed-banner-mobile.webp?v=boosty-feed-20260625"
            />
            <source
              media="(max-width: 640px)"
              type="image/jpeg"
              srcSet="/main_assets/boosty-feed-banner-mobile.jpg?v=boosty-feed-20260625"
            />
            <source type="image/avif" srcSet="/main_assets/manacost-arena-boosty-banner.avif?v=boosty-20260625" />
            <source type="image/webp" srcSet="/main_assets/manacost-arena-boosty-banner.webp?v=boosty-20260625" />
            <img
              src="/main_assets/manacost-arena-boosty-banner.jpg?v=boosty-20260625"
              alt="Manacost: гайды, статистика и тир-листы Hearthstone. Поддержите команду на Boosty."
              width={1600}
              height={327}
              decoding="async"
              fetchPriority="high"
              draggable={false}
            />
          </picture>
        </a>
      </section>

      {/* Stats grid */}
      <section aria-label="Разделы сайта">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {HOME_NAV_CARDS.map(card => (
          <div
            key={card.id}
            className="modern-feature-card hs-card hs-card-interactive group rounded-2xl p-5 flex flex-col gap-4"
          >
            <div className="flex items-start justify-between gap-3">
            <div className="w-16 h-16 flex-shrink-0">
              <img src={card.img} alt={card.title}
                className="w-full h-full object-contain transition-transform duration-200 group-hover:scale-105"
                draggable={false}
                style={{ filter: 'drop-shadow(0 3px 6px rgba(74,40,16,0.38))' }} />
            </div>
            <span className="modern-mini-stat">{card.stat}</span>
            </div>
            <div>
              <h3 className="font-hs text-[#3d2208] text-lg mb-1">{card.title}</h3>
              <p className="text-[#8b6c42] text-sm leading-relaxed">{card.desc}</p>
            </div>
            <a
              href={card.href}
              onClick={(e: React.MouseEvent) => { e.preventDefault(); onNavigate(card.id); }}
              className="hs-btn mt-auto self-start px-4 py-2 rounded-lg text-sm font-hs"
              style={{ textDecoration: 'none' }}
            >
              Перейти →
            </a>
          </div>
        ))}
      </div>
      </section>

      <React.Suspense fallback={<div className="home-bg-section hs-card rounded-2xl p-5 min-h-[220px] animate-pulse" />}>
        <LazyHomeBattlegrounds onNavigate={onNavigate} />
      </React.Suspense>

      {/* Top classes row */}
      <section aria-labelledby="top-classes-heading">
      <div className="flex flex-col gap-3">
        <h3 id="top-classes-heading" className="font-hs text-[#3d2208] text-xl">Топ классы по винрейту</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {loadingWinrates
            ? [0, 1, 2].map(i => (
                <div key={i} className="rounded-2xl p-4 animate-pulse"
                  style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '1.5px solid #c4a46a', height: 80 }} />
              ))
            : topClasses.map((cls, i) => {
                const icon = CLASS_ICON_BY_ID[cls.id];
                const pct = Math.max(0, Math.min(100, (cls.winrate - 40) / 20 * 100));
                return (
                  <div key={cls.id} className="hs-card hs-card-interactive rounded-2xl p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-hs font-bold text-lg" style={{ minWidth: 24, color: i === 0 ? '#b8860b' : '#8b6c42' }}>#{i + 1}</span>
                      {icon && <img src={icon} alt={cls.name} className="w-8 h-8 rounded-full object-cover" />}
                      <span className="font-hs text-[#3d2208] text-base flex-1">{cls.name}</span>
                      <span className="font-hs text-[#6b4c2a] text-sm font-bold">{cls.winrate.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full" style={{ background: 'rgba(148,163,184,0.22)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#2563eb,#38bdf8)' }} />
                    </div>
                  </div>
                );
              })
          }
        </div>
      </div>
      </section>

      {/* Top cards from tier list */}
      <section aria-labelledby="top-cards-heading">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 id="top-cards-heading" className="font-hs text-[#3d2208] text-xl">Лучшие карты</h3>
          <a
            href="/tierlist"
            onClick={(e: React.MouseEvent) => { e.preventDefault(); onNavigate('tierlist'); }}
            className="text-sm font-hs text-[#8b4513] hover:text-[#fcd34d] transition-colors"
            style={{ textDecoration: 'none' }}
          >
            Тир-лист →
          </a>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hs pb-2">
          {loadingHomeSummary && topCards.length === 0
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-24 sm:w-28 rounded-xl animate-pulse"
                  style={{ height: 150, background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '1.5px solid #c4a46a' }} />
              ))
            : topCards.map(card => {
                const imgSrc = card.imageRu || card.imageHa || null;
                return (
                  <a
                    key={card.cardId}
                    href="/tierlist"
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); onNavigate('tierlist'); }}
                    className="flex-shrink-0 flex flex-col items-center gap-1 group"
                    style={{ WebkitTapHighlightColor: 'transparent', textDecoration: 'none' }}
                  >
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={card.name}
                        loading="lazy"
                        className="w-20 sm:w-24 h-auto transition-transform duration-200 group-hover:scale-105"
                        draggable={false}
                        style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.55)) drop-shadow(0 1px 3px rgba(0,0,0,0.4))' }}
                      />
                    ) : (
                      <div className="w-20 sm:w-24 h-32 rounded-xl flex items-center justify-center text-center px-1.5 transition-transform duration-200 group-hover:scale-105"
                        style={{
                          background: 'linear-gradient(135deg,#2c1e16,#1a110a)',
                          border: '1.5px solid #a88a45',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                        }}>
                        <span className="font-hs text-[#fcd34d] text-[10px] leading-tight">{card.name}</span>
                      </div>
                    )}
                    <span className="font-hs text-[#3d2208] text-[10px] sm:text-[11px] text-center leading-tight max-w-[5rem] sm:max-w-[6rem] line-clamp-2">{card.name}</span>
                  </a>
                );
              })
          }
        </div>
      </div>
      </section>

      {/* Top legendaries */}
      <section aria-labelledby="top-legendaries-heading">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 id="top-legendaries-heading" className="font-hs text-[#3d2208] text-xl">Лучшие легендарки</h3>
          <a
            href="/legendaries"
            onClick={(e: React.MouseEvent) => { e.preventDefault(); onNavigate('legendaries'); }}
            className="text-sm font-hs text-[#8b4513] hover:text-[#fcd34d] transition-colors"
            style={{ textDecoration: 'none' }}
          >
            Все →
          </a>
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-hs pb-2">
          {loadingHomeSummary && topLegendaries.length === 0
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-20 sm:w-24 rounded-xl animate-pulse"
                  style={{ height: 130, background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '1.5px solid #c4a46a' }} />
              ))
            : topLegendaries.map(g => {
                const imgSrc = g.imageRu || g.imageHa || null;
                return (
                  <a
                    key={g.cardId}
                    href="/legendaries"
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); onNavigate('legendaries'); }}
                    className="flex-shrink-0 flex flex-col items-center gap-1 group cursor-pointer"
                    style={{ WebkitTapHighlightColor: 'transparent', textDecoration: 'none' }}
                  >
                    <div className="relative">
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={g.name}
                          loading="lazy"
                          className="w-20 sm:w-24 h-auto transition-transform duration-200 group-hover:scale-105"
                          draggable={false}
                          style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.55)) drop-shadow(0 1px 3px rgba(0,0,0,0.4))' }}
                        />
                      ) : (
                        <div className="w-20 sm:w-24 h-32 rounded-xl flex items-center justify-center text-center px-2"
                          style={{ background: 'linear-gradient(135deg,#2c1e16,#1a110a)', border: '1.5px solid #a88a45' }}>
                          <span className="font-hs text-[#fcd34d] text-xs leading-tight">{g.name}</span>
                        </div>
                      )}
                      {g.winRate !== null && (
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap"
                          style={{
                            background: 'linear-gradient(135deg,#6b4c2a,#3a2210)',
                            border: '1px solid #a88a45',
                            color: '#fcd34d',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                          }}>
                          {g.winRate.toFixed(1)}%
                        </div>
                      )}
                    </div>
                    <span className="font-hs text-[#3d2208] text-[11px] sm:text-xs text-center leading-tight max-w-[5rem] sm:max-w-[6rem] line-clamp-2">{g.name}</span>
                  </a>
                );
              })
          }
        </div>
      </div>
      </section>

      {/* ── Promo banners ──────────────────────────────────────────────────── */}
      <aside aria-label="Сообщество и поддержка">
      <div className="flex flex-col gap-3">
        {/* Telegram */}
        <a
          href="https://t.me/manacost_ru"
          target="_blank"
          rel="noreferrer"
          className="community-promo-card community-promo-card-telegram group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-4 rounded-2xl no-underline transition-all duration-200 hover:scale-[1.01]"
          style={{
            background: 'linear-gradient(135deg, rgba(8,20,38,0.96) 0%, rgba(16,45,78,0.94) 54%, rgba(7,18,34,0.98) 100%)',
            border: '1px solid rgba(56,189,248,0.32)',
            boxShadow: '0 18px 34px rgba(15,23,42,0.24), inset 0 1px 0 rgba(147,197,253,0.16)',
          }}
        >
          {/* Icon */}
          <div className="flex-shrink-0 w-11 h-11 rounded-full overflow-hidden"
            style={{ boxShadow: '0 0 0 2px rgba(56,189,248,0.5), 0 10px 22px rgba(14,165,233,0.18)' }}>
            <img src="/ad/telegram.png" alt="Telegram" className="w-full h-full object-cover" draggable={false} />
          </div>

          {/* Text */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-hs text-sm sm:text-base leading-tight" style={{ color: '#e5f2ff' }}>Telegram-канал Manacost</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0"
                style={{ background: 'rgba(14,165,233,0.18)', color: '#bae6fd', border: '1px solid rgba(56,189,248,0.35)' }}>
                Новости
              </span>
            </div>
            <span className="text-xs leading-snug" style={{ color: '#a9bdd6' }}>
              Патчи, обзоры мета и советы по Арене — первыми
            </span>
          </div>

          {/* CTA */}
          <div className="flex-shrink-0 flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-hs transition-all duration-200 group-hover:brightness-110"
            style={{ background: 'rgba(37,99,235,0.22)', border: '1px solid rgba(56,189,248,0.45)', color: '#dbeafe', whiteSpace: 'nowrap' }}>
            Подписаться
            <span className="text-base leading-none">→</span>
          </div>
        </a>

        {/* Boosty */}
        <a
          href="https://boosty.to/kolodahearthstone"
          target="_blank"
          rel="noreferrer"
          className="community-promo-card community-promo-card-boosty group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-4 rounded-2xl no-underline transition-all duration-200 hover:scale-[1.01]"
          style={{
            background: 'linear-gradient(135deg, rgba(8,20,38,0.98) 0%, rgba(23,37,60,0.96) 50%, rgba(7,18,34,0.98) 100%)',
            border: '1px solid rgba(96,165,250,0.26)',
            boxShadow: '0 18px 34px rgba(15,23,42,0.24), inset 0 1px 0 rgba(147,197,253,0.12)',
          }}
        >
          {/* Icon */}
          <div className="flex-shrink-0 w-11 h-11 rounded-xl overflow-hidden p-1.5"
            style={{ background: 'rgba(249,115,22,0.12)', boxShadow: '0 0 0 2px rgba(96,165,250,0.32), 0 10px 22px rgba(37,99,235,0.14)' }}>
            <img src="/ad/boosty.png" alt="Boosty" className="w-full h-full object-contain" draggable={false} />
          </div>

          {/* Text */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-hs text-sm sm:text-base leading-tight" style={{ color: '#e5f2ff' }}>Koloda на Boosty</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0"
                style={{ background: 'rgba(37,99,235,0.2)', color: '#bfdbfe', border: '1px solid rgba(96,165,250,0.34)' }}>
                Эксклюзив
              </span>
            </div>
            <span className="text-xs leading-snug" style={{ color: '#a9bdd6' }}>
              Авторские гайды, разборы и контент для подписчиков
            </span>
          </div>

          {/* CTA */}
          <div className="flex-shrink-0 flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-hs transition-all duration-200 group-hover:brightness-110"
            style={{ background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(96,165,250,0.42)', color: '#dbeafe', whiteSpace: 'nowrap' }}>
            Поддержать
            <span className="text-base leading-none">→</span>
          </div>
        </a>
      </div>
      </aside>

      {/* FAQ */}
      {faq}
    </div>
  );
}
