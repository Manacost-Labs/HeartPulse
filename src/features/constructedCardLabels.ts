export const CONSTRUCTED_SET_LABELS: Record<string, string> = {
  ESCAPEFROM_VIOLET_HOLD: 'Побег из Аметистовой крепости',
  CATACLYSM: 'Катаклизм',
  TIME_TRAVEL: 'Сквозь потоки времени',
  THE_LOST_CITY: 'Затерянный город Ун\’Горо',
  EMERALD_DREAM: 'В Изумрудный Сон',
  SPACE: 'Бескрайняя тьма',
  ISLAND_VACATION: 'Раздор в тропиках',
  WHIZBANGS_WORKSHOP: 'Мастерская Чудастера',
  WILD_WEST: 'Битва в Бесплодных землях',
  WONDERS: 'Пещеры Времени',
  TITANS: 'ТИТАНЫ',
  BATTLE_OF_THE_BANDS: 'Фестиваль легенд',
  RETURN_OF_THE_LICH_KING: 'Марш Короля-лича',
  PATH_OF_ARTHAS: 'Путь Артаса',
  REVENDRETH: 'Убийство в замке Нафрия',
  THE_SUNKEN_CITY: 'Путешествие в Затонувший город',
  ALTERAC_VALLEY: 'Разделённые Альтераком',
  STORMWIND: 'Сплочённые Штормградом',
  THE_BARRENS: 'Закалённые Степями',
  DARKMOON_FAIRE: 'Ярмарка безумия',
  SCHOLOMANCE: 'Некроситет',
  BLACK_TEMPLE: 'Руины Запределья',
  YEAR_OF_THE_DRAGON: 'Пробуждение Галакронда',
  DRAGONS: 'Натиск драконов',
  ULDUM: 'Спасители Ульдума',
  DALARAN: 'Возмездие теней',
  TROLL: 'Растахановы игрища',
  BOOMSDAY: 'Проект Бумного дня',
  GILNEAS: 'Ведьмин лес',
  LOOTAPALOOZA: 'Кобольды и катакомбы',
  ICECROWN: 'Рыцари Ледяного Трона',
  UNGORO: 'Экспедиция в Ун\’Горо',
  GANGS: 'Злачный город Прибамбасск',
  KARA: 'Вечеринка в Каражане',
  OG: 'Пробуждение древних богов',
  LOE: 'Лига исследователей',
  TGT: 'Большой турнир',
  BRM: 'Чёрная гора',
  GVG: 'Гоблины и гномы',
  NAXX: 'Проклятие Наксрамаса',
  DEMON_HUNTER_INITIATE: 'Иллидари',
  EXPERT1: 'Классический набор',
  CORE: 'Основной набор',
  LEGACY: 'Наследие',
  EVENT: 'Событийный набор',
};

const CONSTRUCTED_SET_ORDER = [
  'ESCAPEFROM_VIOLET_HOLD', 'CATACLYSM', 'TIME_TRAVEL', 'THE_LOST_CITY', 'EMERALD_DREAM',
  'SPACE', 'ISLAND_VACATION', 'WHIZBANGS_WORKSHOP', 'WILD_WEST', 'WONDERS', 'TITANS',
  'BATTLE_OF_THE_BANDS', 'RETURN_OF_THE_LICH_KING', 'PATH_OF_ARTHAS', 'REVENDRETH',
  'THE_SUNKEN_CITY', 'ALTERAC_VALLEY', 'STORMWIND', 'THE_BARRENS', 'DARKMOON_FAIRE',
  'SCHOLOMANCE', 'BLACK_TEMPLE', 'YEAR_OF_THE_DRAGON', 'DRAGONS', 'ULDUM', 'DALARAN',
  'TROLL', 'BOOMSDAY', 'GILNEAS', 'LOOTAPALOOZA', 'ICECROWN', 'UNGORO', 'GANGS',
  'KARA', 'OG', 'LOE', 'TGT', 'BRM', 'GVG', 'NAXX', 'DEMON_HUNTER_INITIATE',
  'EXPERT1', 'CORE', 'LEGACY', 'EVENT',
];

const SET_ORDER_INDEX = new Map(CONSTRUCTED_SET_ORDER.map((value, index) => [value, index]));

export function constructedSetLabel(value: string): string {
  if (CONSTRUCTED_SET_LABELS[value]) return CONSTRUCTED_SET_LABELS[value];
  return value.toLocaleLowerCase('ru').replace(/_/g, ' ').replace(/(^|\s)\S/g, letter => letter.toLocaleUpperCase('ru'));
}

export function compareConstructedSets(left: string, right: string): number {
  const leftIndex = SET_ORDER_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = SET_ORDER_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER;
  return leftIndex - rightIndex || constructedSetLabel(left).localeCompare(constructedSetLabel(right), 'ru');
}

const SOUND_GROUP_LABELS: Record<string, string> = {
  PLAY: 'Разыгрывание', ATTACK: 'Атака', DEATH: 'Смерть', TRIGGER: 'Срабатывание',
  DRAW: 'Взятие карты', OPENING: 'Начало матча', ENTER: 'Появление', LOOP: 'Фоновый звук',
  SUMMON: 'Призыв', OTHER: 'Другое',
  DRUID: 'Друид', HUNTER: 'Охотник', MAGE: 'Маг', PALADIN: 'Паладин', PRIEST: 'Жрец',
  ROGUE: 'Разбойник', SHAMAN: 'Шаман', WARLOCK: 'Чернокнижник', WARRIOR: 'Воин',
};

export function constructedSoundGroupLabel(value: string): string {
  const normalized = value.trim();
  const exact = SOUND_GROUP_LABELS[normalized.toUpperCase()];
  if (exact) return exact;
  if (/played against|summoned against|alternative summon/i.test(normalized)) return 'Особая реплика при встрече';
  if (/summon/i.test(normalized)) return 'Особая реплика при призыве';
  return normalized;
}
