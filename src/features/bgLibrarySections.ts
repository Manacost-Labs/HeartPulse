import type { BgLibraryCatalogKind } from './bgLibraryCatalogModel';

export type LibraryKind = BgLibraryCatalogKind;
export type PoolMode = 'current' | 'archive';

export interface LibrarySectionConfig {
  id: string;
  kind: LibraryKind;
  activeHref: string;
  archiveHref: string;
  endpoint?: string;
  title: string;
  shortTitle: string;
  description: string;
  archiveDescription: string;
  icon: 'book' | 'archive' | 'sparkles';
  supportsArchive: boolean;
  accent: string;
}

/** The sections of the library, in the order of the section switcher. */
export const LIBRARY_SECTIONS: LibrarySectionConfig[] = [
  {
    id: 'current-minions',
    kind: 'minion',
    activeHref: '/library/minions',
    archiveHref: '/library/archive/minions',
    title: 'Существа в пуле',
    shortTitle: 'Существа',
    description: 'Все доступные сейчас существа с фильтрами, golden-версией и страницами статистики.',
    archiveDescription: 'Существа, которые раньше были в Полях сражений, но сейчас не входят в активный пул.',
    icon: 'book',
    supportsArchive: true,
    accent: '#3f7fba',
  },
  {
    id: 'current-spells',
    kind: 'spell',
    activeHref: '/library/spells',
    archiveHref: '/library/archive/spells',
    title: 'Заклинания в пуле',
    shortTitle: 'Заклинания',
    description: 'Текущие заклинания таверны: уровень, текст, impact и среднее место.',
    archiveDescription: 'Старые заклинания таверны вне активного пула, с карточками и поиском.',
    icon: 'sparkles',
    supportsArchive: true,
    accent: '#8a5fb8',
  },
  {
    id: 'anomalies',
    kind: 'anomaly',
    activeHref: '/library/anomalies',
    archiveHref: '/library/archive/anomalies',
    title: 'Аномалии',
    shortTitle: 'Аномалии',
    description: 'Активные аномалии Полей сражений с описанием эффекта и ссылкой на источник.',
    archiveDescription: 'Удаленные аномалии, которые больше не появляются в активном пуле.',
    icon: 'sparkles',
    supportsArchive: true,
    endpoint: 'anomaly',
    accent: '#7c3aed',
  },
  {
    id: 'dark-gifts',
    kind: 'dark_gift',
    activeHref: '/library/dark-gifts',
    archiveHref: '/library/archive/dark-gifts',
    title: 'Темные дары',
    shortTitle: 'Темные дары',
    description: 'Все 43 Темных дара сезона 14 с русскими описаниями и изображениями карт.',
    archiveDescription: 'Архив Темных даров прошлых сезонов.',
    icon: 'sparkles',
    supportsArchive: false,
    endpoint: 'dark_gift',
    accent: '#5b3a8e',
  },
  {
    id: 'quests',
    kind: 'quest',
    activeHref: '/library/quests',
    archiveHref: '/library/archive/quests',
    title: 'Квесты',
    shortTitle: 'Квесты',
    description: 'Активные задания квестов: условия выполнения и русские описания.',
    archiveDescription: 'Удаленные квесты из прошлых пулов Полей сражений.',
    icon: 'book',
    supportsArchive: true,
    endpoint: 'quest',
    accent: '#b7791f',
  },
  {
    id: 'rewards',
    kind: 'reward',
    activeHref: '/library/rewards',
    archiveHref: '/library/archive/rewards',
    title: 'Награды',
    shortTitle: 'Награды',
    description: 'Награды квестов с эффектами и официальными картами.',
    archiveDescription: 'Архив наград квестов, если источник отмечает их как удаленные.',
    icon: 'sparkles',
    supportsArchive: true,
    endpoint: 'reward',
    accent: '#2f855a',
  },
  {
    id: 'darkmoon-prizes',
    kind: 'darkmoon_prize',
    activeHref: '/library/darkmoon-prizes',
    archiveHref: '/library/archive/darkmoon-prizes',
    title: 'Призы Ярмарки Новолуния',
    shortTitle: 'Призы',
    description: 'Активные призы Ярмарки Новолуния с русскими текстами карт.',
    archiveDescription: 'Старые призы Ярмарки Новолуния вне активного пула.',
    icon: 'archive',
    supportsArchive: true,
    endpoint: 'darkmoon_prize',
    accent: '#be185d',
  },
  {
    id: 'trinkets',
    kind: 'trinket',
    activeHref: '/library/trinkets',
    archiveHref: '/library/archive/trinkets',
    title: 'Аксессуары',
    shortTitle: 'Аксессуары',
    description: 'Малые и большие аксессуары с группами, эффектами и карточками.',
    archiveDescription: 'Удаленные аксессуары из прошлых сезонов Полей сражений.',
    icon: 'sparkles',
    supportsArchive: true,
    endpoint: 'trinket',
    accent: '#c05621',
  },
  {
    id: 'timewarped',
    kind: 'timewarped',
    activeHref: '/library/timewarped',
    archiveHref: '/library/archive/timewarped',
    title: 'Хрономальные карты',
    shortTitle: 'Хрономальные',
    description: 'Отдельная библиотека Timewarped Tavern: существа, заклинания и силы героя.',
    archiveDescription: 'Источник пока не разделяет хрономальные карты на активные и архивные, поэтому показывается полный набор.',
    icon: 'archive',
    supportsArchive: false,
    endpoint: 'timewarped',
    accent: '#2563eb',
  },
];

export function isBaseLibraryKind(kind: LibraryKind): boolean {
  return kind === 'minion' || kind === 'spell';
}

export function sectionFor(kind: LibraryKind): LibrarySectionConfig {
  return LIBRARY_SECTIONS.find(section => section.kind === kind) || LIBRARY_SECTIONS[0];
}

export function sectionHref(kind: LibraryKind, pool: PoolMode): string {
  const section = sectionFor(kind);
  return pool === 'archive' ? section.archiveHref : section.activeHref;
}

export function libraryKindLabel(kind: LibraryKind): string {
  return sectionFor(kind).shortTitle;
}
