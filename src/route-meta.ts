import type { TabId } from './routes';

export const ROUTE_META: Record<TabId, { title: string; description: string }> = {
  home: {
    title: 'HS-Arena — Тир-лист и Винрейты для Арены Hearthstone',
    description: 'Статистика Арены Hearthstone: тир-лист карт, винрейты классов и легендарные группы.',
  },
  articles: {
    title: 'Статьи и гайды по Арене Hearthstone | HS-Arena',
    description: 'Гайды, разборы и советы по режиму Арена в Hearthstone от команды Manacost.',
  },
  faq: {
    title: 'FAQ и помощь по Manacost Stats — вход, подписка и доступ',
    description: 'Подробная помощь по регистрации, входу, Boosty, Telegram, уровням подписки, paywall, статистике и разделам Manacost Stats.',
  },
  gallery: {
    title: 'Галерея артов Hearthstone | HS-Arena',
    description: 'Публичная галерея артов Манакоста в высоком качестве: просмотр и скачивание доступны всем пользователям.',
  },
  'guides-archive': {
    title: 'Архив гайдов Hearthstone | Manacost Stats',
    description: 'Архив старых гайдов, мета-отчетов и материалов Koloda Hearthstone в удобном формате для чтения.',
  },
  contests: {
    title: 'Конкурсы Манакоста | Manacost Stats',
    description: 'Конкурсы для подписчиков Манакоста: участие, проверка подписки и публикация ID победителей.',
  },
  'standard-matchups': {
    title: 'Матчапы Стандарта Hearthstone | Manacost Stats',
    description: 'Матрица матчапов актуальной меты Стандарта по данным HSGuru: винрейты архетипов против друг друга.',
  },
  'standard-meta': {
    title: 'Мета Hearthstone: архетипы и колоды | Manacost Stats',
    description: 'Мета Стандарта и Вольного режима по данным HSGuru: винрейты, популярность, русские названия и сборки.',
  },
  'standard-vicious-gold': {
    title: 'Vicious Syndicate Gold — мета Стандарта | Manacost Stats',
    description: 'Классы, колоды, сборки и Power Tier по всем доступным рангам Vicious Syndicate Live.',
  },
  'standard-cards': {
    title: 'Карты Hearthstone: Стандарт и Вольный | Manacost Stats',
    description: 'Карты Hearthstone со статистикой Легенды, фильтрами и подробными страницами.',
  },
  winrates: {
    title: 'Винрейт классов — Арена Hearthstone | HS-Arena',
    description: 'Актуальные винрейты всех 11 классов в режиме Арена Hearthstone. Рейтинг на основе миллионов партий, обновляется автоматически.',
  },
  tierlist: {
    title: 'Тир-лист карт — Арена Hearthstone | HS-Arena',
    description: 'Полный тир-лист карт для каждого класса в режиме Арена Hearthstone. Лучшие карты текущего патча с оценками от S до F.',
  },
  legendaries: {
    title: 'Легендарки на Арене Hearthstone — Лучшие группы | HS-Arena',
    description: 'Какую легендарную карту выбрать на Арене? Все группы первого выбора с процентом побед. Обновляется автоматически.',
  },
  'bg-heroes': {
    title: 'Герои Полей Сражений Hearthstone | HS-Arena',
    description: 'Тир-лист героев Hearthstone Battlegrounds с отдельными страницами героев, способностями, компаньонами и статистикой.',
  },
  'bg-library': {
    title: 'Библиотека Полей Сражений Hearthstone | HS-Arena',
    description: 'Существа и заклинания Hearthstone Battlegrounds: пул, архив, фильтры и статистика.',
  },
  'bg-tier-list': {
    title: 'Тир-лист Полей Сражений Hearthstone | HS-Arena',
    description: 'Тир-лист Hearthstone Battlegrounds: существа, стратегии, заклинания и аксессуары с фильтрами и просмотром карт.',
  },
  'bg-strategies': {
    title: 'Конструктор стратегий Полей Сражений | HS-Arena',
    description: 'Инструмент для сборки и визуализации стратегий Hearthstone Battlegrounds.',
  },
  'bg-tier-builder': {
    title: 'Конструктор тир-листов Полей Сражений | HS-Arena',
    description: 'Инструмент для создания собственных тир-листов карт Hearthstone Battlegrounds.',
  },
  'admin-panel': {
    title: 'Админ панель конкурсов | Manacost Stats',
    description: 'Панель администратора конкурсов Манакоста: создание конкурсов, заявки, победители и поиск профилей.',
  },
};
