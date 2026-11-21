import { canonicalPagePath } from '@/src/app/routing/canonicalPagePath';
import { NAVIGATION_DATA, NAVIGATION_MODES, WILD_NAVIGATION_ITEMS, type NavigationGroupId } from '@/src/app/routing/navigationData';
import { FOOTER_COLUMNS, FOOTER_LEGAL_LINKS } from '@/src/components/siteFooterContent';
import { UNAVAILABLE_PAGE_CSS } from './unavailablePageStyles';

/**
 * The document the proxy answers with while Express cannot serve a page
 * (`proxy.ts`). It is one self-contained string: no React tree, no script
 * bundle and no request to `/api`, so it renders the same however badly the
 * data service is failing. The only script is a few lines that make the search
 * field open a section; without it the menu and the links work as plain anchors.
 */

type Link = { label: string; path: string; hint?: string };
type Section = { title?: string; links: readonly Link[] };

/** Menu blocks in the order of the site menu (`PublicNavigation`); a group missing here is not shown. */
const MENU_BLOCKS: readonly { groups: readonly (NavigationGroupId | 'wild')[]; title?: string }[] = [
  { groups: ['home'] },
  { groups: ['standard'], title: 'Стандарт' },
  { groups: ['wild'], title: NAVIGATION_MODES.find(mode => mode.id === 'wild')?.label },
  { groups: ['arena'], title: 'Арена' },
  { groups: ['battlegrounds'], title: 'Поля сражений' },
  { groups: ['community'], title: 'Сообщество' },
];

/** The site menu, built from the shared navigation data: the help page (FAQ) lives in the header and the admin items stay out. */
const UNAVAILABLE_PAGE_NAVIGATION: readonly Section[] = MENU_BLOCKS.map(block => ({
  title: block.title,
  // The Wild items repeat the labels of their Standard twins: the block's title is their mode.
  links: block.groups.flatMap(group => (group === 'wild' ? WILD_NAVIGATION_ITEMS : NAVIGATION_DATA)
    .filter(route => route.group === group && route.id !== 'faq')
    .map(route => ({ label: route.label, path: canonicalPagePath(route.path) }))),
}));

const WAYS: readonly (Link & { hint: string })[] = [
  { label: 'Тир-лист Арены', path: '/tierlist/', hint: 'Оценки карт для каждого класса' },
  { label: 'Мета', path: '/standard/meta/', hint: 'Сильные колоды традиционного режима' },
  { label: 'Поля сражений', path: '/heroes/', hint: 'Герои, библиотека и тир-лист' },
];

const TELEGRAM = 'https://t.me/manacost_ru';

const ICON = (body: string) => `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${body}</svg>`;
const MENU_ICON = ICON('<path d="M4 7h16M4 12h16M4 17h16"/>');
const CLOSE_ICON = ICON('<path d="M6 6l12 12M18 6L6 18"/>');
const SEARCH_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

const navLinks = (sections: readonly Section[]) => sections.map(section => `${section.title ? `<p class="nav-title">${section.title}</p>` : ''}<ul class="nav-list">${
  section.links.map(link => `<li><a class="nav-link" href="${link.path}">${link.label}</a></li>`).join('')}</ul>`).join('');

const brand = '<a class="brand" href="/" aria-label="HearthPulse — на главную"><img src="/hearthpulse-logo.webp" width="30" height="32" alt=""><span>HearthPulse</span></a>';

const external = (link: { external?: boolean }) => (link.external ? ' target="_blank" rel="noopener noreferrer"' : '');
const footer = `<footer class="footer" aria-label="Подвал сайта"><div class="footer-in">${FOOTER_COLUMNS.map(column => `<div><p class="foot-title">${column.title}</p><ul>${
  column.links.map(link => `<li><a href="${link.href}"${external(link)}>${link.label}</a></li>`).join('')}</ul></div>`).join('')}</div><div class="legal"><p>© 2024–${new Date().getFullYear()} Manacost. Все права защищены.</p><p>${
  FOOTER_LEGAL_LINKS.map(link => `<a href="${link.href}">${link.label}</a>`).join(' · ')}</p><p>Hearthstone® — зарегистрированная торговая марка Blizzard Entertainment.</p></div></footer>`;

// Opens the section whose name contains the query; everything else stays a plain form.
// Registered in `inlineScripts.ts`, so the Content-Security-Policy allows it by hash.
export const SEARCH_SCRIPT = `(function(){var f=document.getElementById('site-search'),n=document.getElementById('search-note');if(!f)return;f.addEventListener('submit',function(e){e.preventDefault();var q=f.q.value.trim().toLowerCase();if(!q)return;var a=[].slice.call(document.querySelectorAll('.rail .nav-link'));var hit=a.filter(function(l){var t=l.textContent.toLowerCase(),s=l.closest('ul').previousElementSibling,c=s&&s.classList.contains('nav-title')?s.textContent.toLowerCase():'';return t.indexOf(q)>-1||(c+' '+t).indexOf(q)>-1})[0];if(hit){location.href=hit.getAttribute('href')}else{n.hidden=false}})})();`;

const searchForm = `<div class="utility"><form id="site-search" class="search" role="search" action="/" method="get"><label for="q">Найти раздел сайта</label><input id="q" name="q" type="search" autocomplete="off" placeholder="Найдите раздел сайта…"><button type="submit" aria-label="Найти">${SEARCH_ICON}</button></form><p id="search-note" class="search-note" role="status" hidden>Такого раздела нет. Поиск по картам и статьям заработает, когда вернутся данные.</p><noscript><p class="search-note">Поиск по разделам работает только с включённым JavaScript. Выберите раздел в меню — оно открывается кнопкой «Меню» вверху страницы или стоит слева.</p></noscript></div>`;

const content = `<h1>Данные временно недоступны</h1><p class="lead">Мы не смогли загрузить эти данные: сервер обновляется или не справляется с нагрузкой. Ничего делать не нужно — данные вернутся сами, обычно через несколько минут.</p><a class="btn" href="">Повторить</a><h2>А пока откройте то, что работает</h2><ul class="ways">${
  WAYS.map(way => `<li><a class="way" href="${way.path}"><strong>${way.label}</strong><span>${way.hint}</span></a></li>`).join('')}</ul><p class="code">Код ошибки: 503. Если страница не открывается больше часа, напишите нам в <a href="${TELEGRAM}" target="_blank" rel="noopener noreferrer">Telegram</a>.</p>`;

/** `noindex` only where the caller asks for it: the card catalog's outage is transient and must stay indexable. */
export function unavailablePageHtml(options: { noindex: boolean }): string {
  const preload = ['/fonts/hsdisplay-2026-10.woff2', '/fonts/google/inter-cyrillic-400-700.woff2', '/fonts/google/inter-latin-400-700.woff2']
    .map(href => `<link rel="preload" as="font" type="font/woff2" href="${href}" crossorigin>`).join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#741a1a">${
    options.noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}<title>Данные временно недоступны | HearthPulse</title>${preload}<link rel="icon" href="/favicon.ico"><noscript><style>.utility .search{display:none}</style></noscript><style>${UNAVAILABLE_PAGE_CSS}</style></head><body><a class="skip" href="#main-content">К основному содержимому</a><div class="shell"><header class="topbar red-surface">${brand}<details class="drawer"><summary aria-label="Меню"><span class="open">${MENU_ICON}</span><span class="close">${CLOSE_ICON}</span></summary><nav class="drawer-nav" aria-label="Разделы сайта">${navLinks(UNAVAILABLE_PAGE_NAVIGATION)}</nav></details></header><aside class="rail red-surface">${brand}<nav aria-label="Основная навигация">${navLinks(UNAVAILABLE_PAGE_NAVIGATION)}</nav></aside><div class="work">${searchForm}<main id="main-content" tabindex="-1"><div class="panel">${content}</div></main>${footer}</div></div><script>${SEARCH_SCRIPT}</script></body></html>`;
}
