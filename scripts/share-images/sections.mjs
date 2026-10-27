/*
 * Copy and artwork of each link-preview image. Every asset is a file the site
 * already ships from `public/`; the trophy is drawn inline because the site
 * has no leaderboard artwork of its own. Titles stay within two short lines
 * so they survive the 300–400 px previews of Telegram, Discord, VK and X.
 */

const ARENA_RED = { accent: '#8d171d', accentDark: '#5d0d13', title: '#8d171d', glow: 'rgba(217, 171, 73, 0.42)' };
const BG_VIOLET = { accent: '#8f536d', accentDark: '#3d2335', title: '#3d2335', glow: 'rgba(143, 83, 109, 0.45)' };

const TROPHY_SVG = `<svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#efc96f"/><stop offset=".55" stop-color="#d9ab49"/><stop offset="1" stop-color="#8a5a1e"/>
  </linearGradient></defs>
  <path d="M30 14h60v30c0 20-13 36-30 36S30 64 30 44z" fill="url(#g)" stroke="#2e160b" stroke-width="4"/>
  <path d="M30 22H14c0 20 8 30 20 32M90 22h16c0 20-8 30-20 32" fill="none" stroke="#2e160b" stroke-width="5" stroke-linecap="round"/>
  <path d="M52 80h16v18H52z" fill="url(#g)" stroke="#2e160b" stroke-width="4"/>
  <path d="M34 98h52l6 16H28z" fill="#5f371d" stroke="#2e160b" stroke-width="4" stroke-linejoin="round"/>
  <rect x="22" y="114" width="76" height="14" rx="3" fill="#2e160b"/>
  <text x="60" y="56" text-anchor="middle" font-family="HSDisplay" font-size="30" fill="#2e160b">1</text>
</svg>`;

const img = (src, size, extra = '') => `<img src="${src}" alt="" style="width:${size}px;height:${size}px;${extra}">`;

const ART = {
  overview: `<div class="art-grid">
    ${img('/card-format-standard.webp', 136)}
    ${img('/bg-tier-emblem-s-v1.svg', 136)}
    ${img('/class_icon/mage.png', 136)}
    <div class="art-trophy" style="width:136px;height:136px">${TROPHY_SVG}</div>
  </div>`,
  standard: img('/card-format-standard.webp', 290),
  battlegrounds: img('/bg-tier-emblem-s-v1.svg', 300),
  arena: `<div class="art-fan">
    ${img('/class_icon/paladin.png', 170, 'transform:translate(-104px,22px) rotate(-12deg)')}
    ${img('/class_icon/warrior.png', 170, 'transform:translate(104px,22px) rotate(12deg)')}
    ${img('/class_icon/mage.png', 196, 'transform:translateY(-14px)')}
  </div>`,
  leaderboards: `<div class="art-trophy" style="width:260px;height:300px">${TROPHY_SVG}</div>`,
  articles: img('/bg-library-catalog-seal-v1.svg', 280),
};

/** @type {Record<import('../../shared/shareImages.ts').ShareImageSection, object>} */
export const SHARE_IMAGE_CONTENT = {
  default: {
    kicker: '',
    title: 'Мета и тир-листы<br>Hearthstone',
    subtitle: 'Стандарт · Поля сражений · Арена · Лидеры',
    art: ART.overview, palette: ARENA_RED,
  },
  standard: {
    kicker: 'Стандарт',
    title: 'Мета и архетипы<br>Стандарта',
    subtitle: 'Винрейты, матчапы и колоды',
    art: ART.standard, palette: ARENA_RED,
  },
  battlegrounds: {
    kicker: 'Поля сражений',
    title: 'Тир-лист<br>Полей сражений',
    subtitle: 'Существа, герои и стратегии',
    art: ART.battlegrounds, palette: BG_VIOLET,
  },
  arena: {
    kicker: 'Арена',
    title: 'Тир-лист<br>Арены',
    subtitle: 'Карты, классы и легендарки',
    art: ART.arena, palette: ARENA_RED,
  },
  leaderboards: {
    kicker: 'Рейтинг',
    title: 'Таблицы лидеров<br>Hearthstone',
    subtitle: 'Европа, Америка и Азия, все режимы',
    art: ART.leaderboards, palette: ARENA_RED,
  },
  articles: {
    kicker: 'Статьи',
    title: 'Статьи<br>о Hearthstone',
    subtitle: 'Гайды, разборы и новости',
    art: ART.articles, palette: ARENA_RED,
  },
};
