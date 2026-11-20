import type {
  BattlegroundHeroDetailLibraryHero,
  BattlegroundHeroDetailStats,
  BattlegroundHeroSoundClip,
  BattlegroundHeroSoundGroup,
} from './battlegroundHeroDetailTypes';

export function bgFormatDecimal(value: unknown, digits = 2): string {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits).replace('.', ',');
}

// Keys are lower case without spaces or hyphens: the wiki writes "Night elf", "Blood elf", "Titan-forged".
const BG_HERO_RACE_NAMES: Record<string, string> = {
  aberration: 'Аберрация', abomination: 'Поганище', ancient: 'Древний', arakkoa: 'Араккоа', beast: 'Зверь',
  bloodelf: 'Эльф крови', broken: 'Сломленный', cat: 'Кошка', djinn: 'Джинн', draenei: 'Дреней', dragon: 'Дракон',
  dwarf: 'Дворф', elemental: 'Элементаль', eredar: 'Эредар', eternalone: 'Вечный', ethereal: 'Эфириал',
  forsaken: 'Отрекшийся', gnoll: 'Гнолл', gnome: 'Гном', goblin: 'Гоблин', golem: 'Голем', halforc: 'Полуорк',
  highelf: 'Высший эльф', human: 'Человек', infernal: 'Инфернал', kobold: 'Кобольд', lich: 'Лич', mechagnome: 'Механогном',
  mechanical: 'Механизм', murloc: 'Мурлок', naga: 'Нага', nightborne: 'Ночнорождённый',
  nightelf: 'Ночной эльф', nraqi: 'Н\'раки', observer: 'Наблюдатель', ogre: 'Огр', oldgod: 'Древний бог', ooze: 'Слизень',
  orc: 'Орк', pandaren: 'Пандарен', plant: 'Растение', primate: 'Примат', protodragon: 'Протодракон', protoss: 'Протосс',
  quilboar: 'Свинобраз', rat: 'Крыса', satyr: 'Сатир', tauren: 'Таурен', titanforged: 'Созданный титанами',
  tortollan: 'Тортолланец', troll: 'Тролль', undead: 'Нежить', undeaddragon: 'Дракон-нежить', vulpera: 'Вульпера',
  wildgod: 'Дикий бог', worgen: 'Ворген', zerg: 'Зерг',
};

export function bgHeroRaceLabel(value: unknown): string {
  const race = String(value || '').trim();
  if (!race) return '—';
  return BG_HERO_RACE_NAMES[race.toLowerCase().replace(/[\s'’-]+/g, '')] || race;
}

export const BG_HERO_PATCH_KIND_LABELS = { added: 'Добавлен', removed: 'Убран' };
const BG_HERO_STAT_MODES: Record<string, string> = { solo: 'Соло', duos: 'Дуо' };
const BG_HERO_STAT_TIME_RANGES: Record<string, string> = {
  CURRENT_BATTLEGROUNDS_PATCH: 'текущий патч', CURRENT_PATCH: 'текущий патч', LAST_7_DAYS: 'последние 7 дней',
  LAST_14_DAYS: 'последние 14 дней', LAST_30_DAYS: 'последние 30 дней',
};

/** One line under the statistics heading: which games the numbers come from. */
export function bgHeroStatisticsScope(stats: BattlegroundHeroDetailStats): string {
  const mode = BG_HERO_STAT_MODES[String(stats?.mode || '')];
  const percentile = String(stats?.filters?.mmr_percentile || '').match(/^TOP_(\d+)_PERCENT$/);
  const range = BG_HERO_STAT_TIME_RANGES[String(stats?.filters?.time_range || '')];
  const scope = [mode, percentile ? `топ-${percentile[1]}% по рейтингу` : '', range].filter(Boolean).join(' · ');
  return scope ? `${scope}. Данные HSReplay.` : 'Данные HSReplay.';
}

export function bgHeroArmorValue(armor: BattlegroundHeroDetailLibraryHero['armor'], key: 'normal' | 'duos'): string {
  const value = armor && typeof armor === 'object' ? armor[key] : null;
  return Number.isFinite(Number(value)) ? String(value) : '—';
}

export function bgHeroDescriptionRu(heroName: string, description: unknown): string {
  const text = String(description || '').trim();
  const key = `${heroName} ${text}`;
  if (/Millificent|Миллифисент/i.test(key)) {
    return 'Миллифисент Манашторм — гениальная инженерка и признанная изобретательница. После побега из Аметистовой крепости она снова охотится за своим главным противником — собственным мужем.';
  }
  return text;
}

function bgHeroWikiSlug(heroName: string): string {
  return String(heroName || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

export function bgHeroExternalLinks(libraryHero: BattlegroundHeroDetailLibraryHero, heroName: string): Array<{ label: string; url: string }> {
  const dbf = libraryHero?.dbf;
  const links = new Map<string, string>();
  const wikiUrl = libraryHero?.wiki?.page?.url;
  if (wikiUrl) links.set('Hearthstone Wiki', String(wikiUrl));
  const sourceLinks = Array.isArray(libraryHero?.wiki?.external_links) ? libraryHero.wiki.external_links : [];
  sourceLinks.forEach(link => {
    const label = String(link?.label || '').trim();
    const url = String(link?.url || '').trim();
    if (label && url) links.set(label, url);
  });
  if (Number.isFinite(Number(dbf)) && !links.has('HSReplay.net')) links.set('HSReplay.net', `https://hsreplay.net/cards/${dbf}`);
  if (!links.has('Hearthstone Wiki')) links.set('Hearthstone Wiki', `https://hearthstone.wiki.gg/wiki/Battlegrounds/${bgHeroWikiSlug(heroName)}`);
  return Array.from(links, ([label, url]) => ({ label, url }));
}

function bgHeroSoundLabel(value: unknown): string {
  const text = String(value || '').trim();
  const key = text.toLowerCase();
  if (key === 'play' || key.includes('summon')) return 'Призыв';
  if (key === 'attack' || key.includes('attack')) return 'Атака';
  if (key === 'death' || key.includes('death')) return 'Смерть';
  if (key === 'trigger') return 'Срабатывание';
  if (key === 'emote') return 'Реплика';
  return text || 'Голос';
}

function bgHeroSoundDescription(value: unknown, fallback: unknown): string {
  const text = String(value || '').trim();
  if (/^<summon sound>$/i.test(text)) return 'Звук призыва';
  if (/^<attack sound>$/i.test(text)) return 'Звук атаки';
  if (/^<death sound>$/i.test(text)) return 'Звук смерти';
  if (/^<.*sound>$/i.test(text)) return bgHeroSoundLabel(fallback);
  return text || bgHeroSoundLabel(fallback);
}

export function bgHeroBuddySoundGroups(...sources: Array<{ sounds?: BattlegroundHeroSoundGroup[] | null } | null | undefined>): BattlegroundHeroSoundGroup[] {
  const seen = new Set<string>();
  const groups = new Map<string, BattlegroundHeroSoundClip[]>();
  sources.forEach(source => {
    const entries = Array.isArray(source?.sounds) ? source.sounds : [];
    entries.forEach((group: BattlegroundHeroSoundGroup) => {
      const heading = group.heading || group.clips?.[0]?.group || 'Voice';
      const label = bgHeroSoundLabel(heading);
      (group.clips || []).forEach(clip => {
        const url = String(clip.file_url || '').trim();
        if (!url || seen.has(url)) return;
        seen.add(url);
        const clips = groups.get(label) ?? [];
        if (!groups.has(label)) groups.set(label, clips);
        clips.push({
          ...clip,
          description: bgHeroSoundDescription(clip.description, heading),
          group: label,
        });
      });
    });
  });
  return Array.from(groups, ([heading, clips]) => ({ heading, clips }));
}
