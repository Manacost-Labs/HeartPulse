import { CONSTRUCTED_SET_LABELS, constructedSetLabel } from './constructedCardLabels';

export type ConstructedCardFilterOption = {
  value: string;
  label: string;
  icon?: string;
  iconAlt?: string;
  disabled?: boolean;
};

const STATISTIC_SORT_DEFINITIONS = [
  { value: 'popularity', label: 'В % колод' },
  { value: 'winrate', label: 'Победы колод' },
  { value: 'games', label: 'Сыграно партий' },
] as const;

export const CONSTRUCTED_CLASS_LABELS: Record<string, string> = {
  DEATHKNIGHT: 'Рыцарь смерти',
  DEMONHUNTER: 'Охотник на демонов',
  DRUID: 'Друид',
  HUNTER: 'Охотник',
  MAGE: 'Маг',
  PALADIN: 'Паладин',
  PRIEST: 'Жрец',
  ROGUE: 'Разбойник',
  SHAMAN: 'Шаман',
  WARLOCK: 'Чернокнижник',
  WARRIOR: 'Воин',
  NEUTRAL: 'Нейтральные',
  DREAM: 'Сон',
};

export const CONSTRUCTED_RARITY_LABELS: Record<string, string> = {
  FREE: 'Базовая',
  COMMON: 'Обычная',
  RARE: 'Редкая',
  EPIC: 'Эпическая',
  LEGENDARY: 'Легендарная',
};

export const CONSTRUCTED_TYPE_LABELS: Record<string, string> = {
  MINION: 'Существо',
  SPELL: 'Заклинание',
  WEAPON: 'Оружие',
  LOCATION: 'Локация',
  HERO: 'Герой',
  ENCHANTMENT: 'Эффект',
};

const SETS_WITH_LOCAL_LOGOS = new Set(Object.keys(CONSTRUCTED_SET_LABELS));
const RARITY_ICONS: Record<string, string> = {
  FREE: '/assets/common.png',
  COMMON: '/assets/common.png',
  RARE: '/assets/rare.png',
  EPIC: '/assets/epic.png',
  LEGENDARY: '/assets/legendary.png',
};

function translatedCode(value: string, labels: Record<string, string>): string {
  return labels[value] || value
    .toLocaleLowerCase('ru-RU')
    .replace(/_/g, ' ')
    .replace(/(^|\s)\S/g, letter => letter.toLocaleUpperCase('ru-RU'));
}

export function constructedClassLabel(value: string): string {
  return translatedCode(value, CONSTRUCTED_CLASS_LABELS);
}

export function constructedRarityLabel(value: string): string {
  return translatedCode(value, CONSTRUCTED_RARITY_LABELS);
}

export function constructedTypeLabel(value: string): string {
  return translatedCode(value, CONSTRUCTED_TYPE_LABELS);
}

export function constructedClassIcon(value?: string | null): string {
  const key = String(value || 'neutral').toLocaleLowerCase('ru-RU').replace(/_/g, '');
  return key === 'neutral' ? '/class_icon/neutral.webp' : `/class_icon/ui/${key}-64.webp`;
}

export function classFilterOptions(values: string[]): ConstructedCardFilterOption[] {
  return [
    { value: '', label: 'Все классы', icon: '/class_icon/all1.png', iconAlt: '' },
    ...values.map(value => ({
      value,
      label: constructedClassLabel(value),
      icon: constructedClassIcon(value),
      iconAlt: '',
    })),
  ];
}

export function setFilterOptions(values: string[]): ConstructedCardFilterOption[] {
  return [
    { value: '', label: 'Все дополнения' },
    ...values.map(value => ({
      value,
      label: constructedSetLabel(value),
      icon: SETS_WITH_LOCAL_LOGOS.has(value)
        ? `/constructed-filter-icons/sets/${value.toLocaleLowerCase('en-US')}.webp`
        : undefined,
      iconAlt: '',
    })),
  ];
}

export function numericFilterOptions(
  anyLabel: string,
  icon: string,
): ConstructedCardFilterOption[] {
  return [
    { value: '', label: anyLabel, icon, iconAlt: '' },
    ...Array.from({ length: 11 }, (_, value) => ({
      value: String(value),
      label: String(value),
      icon,
      iconAlt: '',
    })),
  ];
}

export function rarityFilterOptions(values: string[]): ConstructedCardFilterOption[] {
  return [
    { value: '', label: 'Любая' },
    ...values.map(value => ({
      value,
      label: constructedRarityLabel(value),
      icon: RARITY_ICONS[value],
      iconAlt: '',
    })),
  ];
}

export function statisticSortOptions(hasAccess: boolean): ConstructedCardFilterOption[] {
  return STATISTIC_SORT_DEFINITIONS.map(option => ({
    value: option.value,
    label: hasAccess ? option.label : `🔒 ${option.label} · Алмаз`,
    disabled: !hasAccess,
  }));
}

export function textFilterOptions(
  anyLabel: string,
  values: string[],
  label: (value: string) => string,
): ConstructedCardFilterOption[] {
  return [
    { value: '', label: anyLabel },
    ...values.map(value => ({ value, label: label(value) })),
  ];
}
