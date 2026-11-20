/**
 * The four mode hubs (`/standard/`, `/arena/`, `/battlegrounds/`, `/wild/`):
 * the one-line lead and the links each hub prints in its server HTML
 * (docs/specs/seo-query-clusters.md, «Mode hubs»). Server-only content: it is
 * imported by server components and never reaches the browser bundle.
 *
 * A link goes only to an indexable page of the route inventory, at its
 * canonical address (trailing slash, no query): a noindex page or a filtered
 * URL is not a hub entry.
 */
export type ModeHubId = 'standard' | 'arena' | 'battlegrounds' | 'wild';

export type ModeHubLink = { href: string; title: string; text: string };

export type ModeHub = {
  id: ModeHubId;
  /** Registry path (`config/public-seo-pages.json`), without the trailing slash. */
  path: string;
  /** The name of the mode in the list of the other hubs. */
  name: string;
  heading: string;
  /** One line under the heading, like the subtitle of any section page; no prose for robots (owner rule, #538). */
  lead: string;
  /** Heading of the block of open data. */
  nowTitle: string;
  links: readonly ModeHubLink[];
};

const PATCHES_LINK = {
  href: '/standard/patches/',
  title: 'Патчноуты',
} as const;

export const MODE_HUBS: Readonly<Record<ModeHubId, ModeHub>> = {
  standard: {
    id: 'standard',
    path: '/standard',
    name: 'Стандарт',
    heading: 'Стандарт Hearthstone: колоды, мета и архетипы',
    lead: 'Мета, архетипы, матчапы и карты Стандарта.',
    nowTitle: 'Сейчас в Стандарте',
    links: [
      { href: '/standard/meta/', title: 'Мета Hearthstone', text: 'Тир-лист колод Стандарта: винрейт, популярность и число игр каждого архетипа.' },
      { href: '/standard/archetypes/', title: 'Архетипы', text: 'Каталог архетипов с винрейтом и долей игр; у сильных архетипов есть своя страница.' },
      { href: '/standard/matchups/', title: 'Матчапы', text: 'Таблица шансов: как архетипы Стандарта играют друг против друга.' },
      { href: '/standard/fun-decks/', title: 'Фан-колоды', text: 'Необычные колоды вне меты с составом карт и числом игр.' },
      { href: '/standard/cards/', title: 'Карты Hearthstone', text: 'Библиотека карт с фильтрами и отдельной страницей каждой карты.' },
      { href: '/standard/cards/standard/', title: 'Карты Стандарта', text: 'Только карты, которые сейчас разрешены в Стандарте.' },
      { ...PATCHES_LINK, text: 'Что изменилось в картах в каждом патче: усиления и ослабления по классам.' },
    ],
  },
  arena: {
    id: 'arena',
    path: '/arena',
    name: 'Арена',
    heading: 'Арена Hearthstone: тир-лист карт и классы',
    lead: 'Тир-лист карт, классы и легендарки Арены.',
    nowTitle: 'Сейчас на Арене',
    links: [
      { href: '/tierlist/', title: 'Тир-лист карт Арены', text: 'Весь пул карт по классам и тирам с базовым винрейтом и частотой выбора.' },
      { href: '/classes/', title: 'Винрейт классов', text: 'Какой класс выбрать: все классы Арены по проценту побед на текущих данных.' },
      { href: '/legendaries/', title: 'Легендарки Арены', text: 'Группы легендарок первого выбора с процентом побед по классам.' },
    ],
  },
  battlegrounds: {
    id: 'battlegrounds',
    path: '/battlegrounds',
    name: 'Поля сражений',
    heading: 'Поля сражений Hearthstone: герои, сборки и карты',
    lead: 'Герои, сборки и библиотека карт Полей сражений.',
    nowTitle: 'Сейчас на Полях сражений',
    links: [
      { href: '/heroes/', title: 'Герои', text: 'Рейтинг героев для одиночной игры и Дуо: тир, среднее место и доля попаданий в топ-4.' },
      { href: '/battlegrounds/tier-list/', title: 'Тир-лист Полей сражений', text: 'Сборки по тирам: ключевые существа, условия перехода и пример стола.' },
      { href: '/battlegrounds/strategies/', title: 'Конструктор стратегий', text: 'Соберите свой план игры из существ, заклинаний и аксессуаров.' },
      { href: '/library/', title: 'Библиотека', text: 'Все карты Полей сражений с фильтрами и отдельной страницей каждой карты.' },
      { href: '/library/minions/', title: 'Существа', text: 'Существа по уровням таверны, типам и механикам.' },
      { href: '/library/spells/', title: 'Заклинания', text: 'Заклинания таверны из актуального пула.' },
      { href: '/library/anomalies/', title: 'Аномалии', text: 'Аномалии, которые меняют правила партии.' },
      { href: '/library/dark-gifts/', title: 'Темные дары', text: 'Эффекты и карты сезонного набора темных даров.' },
      { href: '/library/quests/', title: 'Квесты', text: 'Условия выполнения квестов.' },
      { href: '/library/rewards/', title: 'Награды', text: 'Награды за выполненные квесты.' },
      { href: '/library/darkmoon-prizes/', title: 'Призы Ярмарки Новолуния', text: 'Призы Ярмарки Новолуния с описаниями.' },
      { href: '/library/trinkets/', title: 'Аксессуары', text: 'Малые и большие аксессуары.' },
      { href: '/library/timewarped/', title: 'Хрономальные карты', text: 'Существа, заклинания и силы героев Timewarped Tavern.' },
      { ...PATCHES_LINK, text: 'Изменения карт и героев Полей сражений в каждом патче.' },
    ],
  },
  wild: {
    id: 'wild',
    path: '/wild',
    name: 'Вольный формат',
    heading: 'Вольный формат Hearthstone: колоды и карты',
    lead: 'Колоды и карты Вольного формата.',
    nowTitle: 'Сейчас в Вольном формате',
    links: [
      { href: '/standard/meta/wild/', title: 'Мета Вольного формата', text: 'Тир-лист колод Вольного: винрейт, популярность и число игр архетипов.' },
      { href: '/standard/archetypes/wild/', title: 'Архетипы', text: 'Винрейт и доля игр архетипов Вольного формата.' },
      { href: '/standard/matchups/', title: 'Матчапы', text: 'Шансы архетипов друг против друга, формат «Вольный» в переключателе.' },
      { href: '/standard/fun-decks/', title: 'Фан-колоды', text: 'Необычные колоды Стандарта и Вольного формата.' },
      { href: '/standard/cards/wild/', title: 'Карты Вольного формата', text: 'Библиотека всех карт, разрешённых в Вольном.' },
      { ...PATCHES_LINK, text: 'Изменения карт в каждом патче: что было и что стало, по классам.' },
    ],
  },
};

export const MODE_HUB_ORDER: readonly ModeHubId[] = ['standard', 'arena', 'battlegrounds', 'wild'];
