import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { decode, encode, type FormatType } from '@firestone-hs/deckstrings';
import {
  ArrowLeft,
  Copy,
  LayoutGrid,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import CardPreviewTooltip, { type CardPreviewTarget } from './CardPreviewTooltip';
import DeckListView, { type DeckListSideboard } from './decklist/DeckListView';
import './DeckBuilder.css';

type DeckFormat = 'standard' | 'wild';
type HeroClass =
  | 'DEATHKNIGHT'
  | 'DEMONHUNTER'
  | 'DRUID'
  | 'HUNTER'
  | 'MAGE'
  | 'PALADIN'
  | 'PRIEST'
  | 'ROGUE'
  | 'SHAMAN'
  | 'WARLOCK'
  | 'WARRIOR';

type CatalogCard = {
  card_id: string;
  dbf: number | null;
  name?: { ru?: string | null; en?: string | null };
  class?: string | null;
  multi_class?: string[];
  rarity?: string | null;
  card_type?: { slug?: string | null; name_ru?: string | null };
  mana_cost?: number | null;
  minion_type?: string | null;
  spell_school?: string | null;
  mechanics?: string[];
  images?: { card?: string | null; crop?: string | null };
};

type DeckEntry = {
  id: string;
  dbfId: number;
  name: string;
  cost: number;
  rarity: string;
  elite: boolean;
  count: number;
  image: string;
  cardImage: string;
};

type ArchetypeInfo = {
  archetype: string;
  archetypeLabel: string;
  score: number;
};

type DeckBuilderProps = {
  isAdmin: boolean;
  authChecking?: boolean;
};

const XL_DECK_DBF_IDS = new Set([
  79767, // Prince Renathal
  111689,
  119432, // Rafaam, Time Thief
  52119,
  111455,
]);

const CLASS_OPTIONS: Array<{
  id: HeroClass;
  label: string;
  short: string;
  color: string;
  icon: string;
  description: string;
}> = [
  { id: 'DEATHKNIGHT', label: 'Рыцарь смерти', short: 'РС', color: '#43596b', icon: '/class_icon/ui/deathknight-64.webp', description: 'Руны, нежить и ледяная власть' },
  { id: 'DEMONHUNTER', label: 'Охотник на демонов', short: 'ОД', color: '#17613d', icon: '/class_icon/ui/demonhunter-64.webp', description: 'Темп, натиск и сила Скверны' },
  { id: 'DRUID', label: 'Друид', short: 'Друид', color: '#9a541d', icon: '/class_icon/ui/druid-64.webp', description: 'Мана, природа и крупные существа' },
  { id: 'HUNTER', label: 'Охотник', short: 'Охотник', color: '#3f7821', icon: '/class_icon/ui/hunter-64.webp', description: 'Звери, секреты и быстрый урон' },
  { id: 'MAGE', label: 'Маг', short: 'Маг', color: '#39779b', icon: '/class_icon/ui/mage-64.webp', description: 'Заклинания, стихии и контроль' },
  { id: 'PALADIN', label: 'Паладин', short: 'Паладин', color: '#9b771c', icon: '/class_icon/ui/paladin-64.webp', description: 'Святой свет, щиты и рекруты' },
  { id: 'PRIEST', label: 'Жрец', short: 'Жрец', color: '#727984', icon: '/class_icon/ui/priest-64.webp', description: 'Исцеление, тени и копирование' },
  { id: 'ROGUE', label: 'Разбойник', short: 'Разбойник', color: '#4a5058', icon: '/class_icon/ui/rogue-64.webp', description: 'Комбо, оружие и хитрые приёмы' },
  { id: 'SHAMAN', label: 'Шаман', short: 'Шаман', color: '#28568b', icon: '/class_icon/ui/shaman-64.webp', description: 'Тотемы, стихии и перегрузка' },
  { id: 'WARLOCK', label: 'Чернокнижник', short: 'Чернокнижник', color: '#68417d', icon: '/class_icon/ui/warlock-64.webp', description: 'Демоны, жертвы и добор карт' },
  { id: 'WARRIOR', label: 'Воин', short: 'Воин', color: '#832b24', icon: '/class_icon/ui/warrior-64.webp', description: 'Броня, оружие и натиск' },
];

const HERO_DBF: Record<HeroClass, number> = {
  WARRIOR: 7,
  SHAMAN: 1066,
  ROGUE: 930,
  PALADIN: 671,
  HUNTER: 31,
  DRUID: 274,
  WARLOCK: 893,
  MAGE: 637,
  PRIEST: 813,
  DEMONHUNTER: 56550,
  DEATHKNIGHT: 78065,
};

const HERO_BY_DBF = new Map(
  Object.entries(HERO_DBF).map(([heroClass, dbfId]) => [dbfId, heroClass as HeroClass]),
);

const CLASS_LABELS: Record<string, string> = Object.fromEntries([
  ...CLASS_OPTIONS.map(item => [item.id, item.label]),
  ['NEUTRAL', 'Нейтральные'],
]);

const RARITY_LABELS: Record<string, string> = {
  FREE: 'Базовая',
  COMMON: 'Обычная',
  RARE: 'Редкая',
  EPIC: 'Эпическая',
  LEGENDARY: 'Легендарная',
};

const RARITY_ICONS: Record<string, string> = {
  COMMON: '/assets/common.png',
  RARE: '/assets/rare.png',
  EPIC: '/assets/epic.png',
  LEGENDARY: '/assets/legendary.png',
};

const TYPE_LABELS: Record<string, string> = {
  MINION: 'Существо',
  SPELL: 'Заклинание',
  WEAPON: 'Оружие',
  LOCATION: 'Локация',
  HERO: 'Герой',
};

const MINION_TYPE_LABELS: Record<string, string> = {
  ALL: 'Все типы',
  BEAST: 'Зверь',
  DEMON: 'Демон',
  DRAGON: 'Дракон',
  ELEMENTAL: 'Элементаль',
  MECH: 'Механизм',
  MURLOC: 'Мурлок',
  NAGA: 'Нага',
  PIRATE: 'Пират',
  QUILBOAR: 'Иглошкур',
  TOTEM: 'Тотем',
  UNDEAD: 'Нежить',
};

const SPELL_SCHOOL_LABELS: Record<string, string> = {
  ARCANE: 'Тайная магия',
  FEL: 'Скверна',
  FIRE: 'Огонь',
  FROST: 'Лёд',
  HOLY: 'Свет',
  NATURE: 'Природа',
  SHADOW: 'Тьма',
};

const MANA_FILTERS = ['', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'] as const;
const RARITY_FILTERS = ['', 'COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const;
const CARD_TYPE_FILTERS = ['', 'MINION', 'SPELL', 'WEAPON', 'LOCATION', 'HERO'] as const;

const FORMAT_LABELS: Record<DeckFormat, string> = {
  standard: 'Стандарт',
  wild: 'Вольный',
};

const MAX_DBF_ID = 10_000_000;

function formatType(format: DeckFormat): FormatType {
  return format === 'standard' ? 2 : 1;
}

function cardName(card: Pick<CatalogCard, 'name' | 'card_id'>): string {
  return card.name?.ru || card.name?.en || card.card_id;
}

function maxCopies(rarity: string): number {
  return rarity.toUpperCase() === 'LEGENDARY' ? 1 : 2;
}

function totalCards(entries: DeckEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.count, 0);
}

function deckSizeLimit(entries: DeckEntry[]): 30 | 40 {
  if (totalCards(entries) > 30) return 40;
  if (entries.some(entry => XL_DECK_DBF_IDS.has(entry.dbfId))) return 40;
  return 30;
}

function sortEntries(entries: DeckEntry[]): DeckEntry[] {
  return [...entries].sort((left, right) => (
    left.cost - right.cost
    || left.name.localeCompare(right.name, 'ru', { sensitivity: 'base' })
  ));
}

function isValidDbf(dbfId: number): boolean {
  return Number.isSafeInteger(dbfId) && dbfId > 0 && dbfId <= MAX_DBF_ID;
}

function encodeDeck(
  heroClass: HeroClass,
  format: DeckFormat,
  entries: DeckEntry[],
  sideboards: DeckListSideboard[],
): string {
  return encode({
    format: formatType(format),
    heroes: [HERO_DBF[heroClass]],
    cards: entries.filter(entry => isValidDbf(entry.dbfId)).map(entry => [entry.dbfId, entry.count]),
    sideboards: sideboards
      .filter(sideboard => sideboard.keyCardDbfId > 0 && sideboard.cards.length > 0)
      .map(sideboard => ({
        keyCardDbfId: sideboard.keyCardDbfId,
        cards: sideboard.cards
          .filter(card => isValidDbf(card.dbfId))
          .map(card => [card.dbfId, card.count] as [number, number]),
      })),
  });
}

function catalogToEntry(card: CatalogCard): DeckEntry | null {
  const dbfId = Number(card.dbf);
  if (!isValidDbf(dbfId)) return null;
  const rarity = String(card.rarity ?? 'COMMON').toUpperCase();
  return {
    id: card.card_id,
    dbfId,
    name: cardName(card),
    cost: Number.isFinite(Number(card.mana_cost)) ? Number(card.mana_cost) : 0,
    rarity,
    elite: rarity === 'LEGENDARY',
    count: 1,
    image: `https://art.hearthstonejson.com/v1/tiles/${encodeURIComponent(card.card_id)}.webp`,
    cardImage: String(card.images?.card || `https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/${encodeURIComponent(card.card_id)}.png`),
  };
}

function toDeckEntry(card: any): DeckEntry {
  return {
    id: String(card.id),
    dbfId: Number(card.dbfId),
    name: String(card.name),
    cost: Number(card.cost) || 0,
    rarity: String(card.rarity || 'COMMON'),
    elite: Boolean(card.elite),
    count: Number(card.count) || 1,
    image: String(card.image || ''),
    cardImage: String(card.cardImage || ''),
  };
}

function toSideboards(raw: unknown): DeckListSideboard[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row: any) => {
    const keyCardDbfId = Number(row?.keyCardDbfId);
    const cards = Array.isArray(row?.cards) ? row.cards.map(toDeckEntry) : [];
    if (!Number.isSafeInteger(keyCardDbfId) || keyCardDbfId <= 0 || !cards.length) return [];
    return [{
      keyCardDbfId,
      label: String(row?.label || row?.keyCard?.name || `Сайдборд ${keyCardDbfId}`),
      keyCard: row?.keyCard ? toDeckEntry(row.keyCard) : null,
      cards,
    }];
  });
}

function adminJsonHeaders(): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-CSRF-Request': '1',
  };
}

function AccessDenied() {
  return (
    <section className="deck-builder deck-builder--denied hs-timber-frame">
      <div className="deck-builder__denied">
        <ShieldCheck size={34} aria-hidden="true" />
        <strong>Конструктор колоды недоступен</strong>
        <span>Раздел только для администрации. Войдите в аккаунт администратора.</span>
        <a className="deck-builder__primary-btn" href="/?login">Войти в профиль</a>
      </div>
    </section>
  );
}

function LoadingGate() {
  return (
    <section className="deck-builder deck-builder--denied hs-timber-frame" aria-busy="true">
      <div className="deck-builder__denied">
        <LockKeyhole size={28} aria-hidden="true" />
        <strong>Проверяем доступ…</strong>
      </div>
    </section>
  );
}

export default function DeckBuilder({ isAdmin, authChecking = false }: DeckBuilderProps) {
  const [heroClass, setHeroClass] = useState<HeroClass | null>(null);
  const [format, setFormat] = useState<DeckFormat>('standard');
  const [entries, setEntries] = useState<DeckEntry[]>([]);
  const [sideboards, setSideboards] = useState<DeckListSideboard[]>([]);
  const [archetype, setArchetype] = useState<ArchetypeInfo | null>(null);
  const [pasteCode, setPasteCode] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [filterClass, setFilterClass] = useState('');
  const [filterMana, setFilterMana] = useState('');
  const [filterRarity, setFilterRarity] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterMinionType, setFilterMinionType] = useState('');
  const [filterSpellSchool, setFilterSpellSchool] = useState('');
  const [filterMechanic, setFilterMechanic] = useState('');
  const [page, setPage] = useState(1);
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [facets, setFacets] = useState<{
    classes: string[];
    rarities: string[];
    types: string[];
    minionTypes: string[];
    spellSchools: string[];
    mechanics: string[];
  }>({
    classes: [], rarities: [], types: [], minionTypes: [], spellSchools: [], mechanics: [],
  });
  const [mechanicLabels, setMechanicLabels] = useState<Record<string, string>>({});
  const [totalPages, setTotalPages] = useState(1);
  const [totalCardsInPool, setTotalCardsInPool] = useState(0);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  const previewOwnerRef = useRef<HTMLElement | null>(null);

  const deckCode = useMemo(
    () => (heroClass ? encodeDeck(heroClass, format, entries, sideboards) : ''),
    [entries, format, heroClass, sideboards],
  );
  const cardCount = totalCards(entries);
  const sizeLimit = deckSizeLimit(entries);
  const sortedEntries = useMemo(() => sortEntries(entries), [entries]);
  const activeFilterCount = [
    filterClass !== (heroClass || ''),
    filterMana !== '',
    filterRarity,
    filterType,
    filterMinionType,
    filterSpellSchool,
    filterMechanic,
    query.trim(),
  ].filter(Boolean).length;

  useEffect(() => {
    if (!heroClass) return;
    setFilterClass(current => current || heroClass);
  }, [heroClass]);

  useEffect(() => {
    if (!heroClass) return undefined;
    const controller = new AbortController();
    setCardsLoading(true);
    setCardsError('');
    const params = new URLSearchParams({
      format,
      page: String(page),
      perPage: '60',
      sort: 'mana',
      direction: 'asc',
    });
    if (deferredQuery.trim()) params.set('query', deferredQuery.trim());
    if (filterClass) params.set('class', filterClass);
    if (filterMana !== '') params.set('mana', filterMana);
    if (filterRarity) params.set('rarity', filterRarity);
    if (filterType) params.set('type', filterType);
    if (filterMinionType) params.set('minionType', filterMinionType);
    if (filterSpellSchool) params.set('spellSchool', filterSpellSchool);
    if (filterMechanic) params.set('mechanic', filterMechanic);

    void fetch(`/api/constructed-cards?${params}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить карты');
        setCards(Array.isArray(payload.cards) ? payload.cards : []);
        setFacets({
          classes: Array.isArray(payload.facets?.classes) ? payload.facets.classes : [],
          rarities: Array.isArray(payload.facets?.rarities) ? payload.facets.rarities : [],
          types: Array.isArray(payload.facets?.types) ? payload.facets.types : [],
          minionTypes: Array.isArray(payload.facets?.minionTypes) ? payload.facets.minionTypes : [],
          spellSchools: Array.isArray(payload.facets?.spellSchools) ? payload.facets.spellSchools : [],
          mechanics: Array.isArray(payload.facets?.mechanics) ? payload.facets.mechanics : [],
        });
        setMechanicLabels({
          ...(payload.mechanicTranslations && typeof payload.mechanicTranslations === 'object'
            ? payload.mechanicTranslations
            : {}),
          ...(payload.mechanicOverrides && typeof payload.mechanicOverrides === 'object'
            ? payload.mechanicOverrides
            : {}),
        });
        setTotalPages(Number(payload.pagination?.totalPages) || 1);
        setTotalCardsInPool(Number(payload.pagination?.total) || 0);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setCards([]);
        setCardsError(error instanceof Error ? error.message : 'Ошибка загрузки карт');
      })
      .finally(() => {
        if (!controller.signal.aborted) setCardsLoading(false);
      });

    return () => controller.abort();
  }, [
    deferredQuery,
    filterClass,
    filterMana,
    filterMechanic,
    filterMinionType,
    filterRarity,
    filterSpellSchool,
    filterType,
    format,
    heroClass,
    page,
    reloadToken,
  ]);

  useEffect(() => {
    if (!deckCode || !heroClass) {
      setArchetype(null);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch('/api/admin/deck-builder/resolve', {
        method: 'POST',
        credentials: 'same-origin',
        headers: adminJsonHeaders(),
        signal: controller.signal,
        body: JSON.stringify({ deckCode, format }),
      })
        .then(async response => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) return;
          if (payload?.archetype?.archetypeLabel) {
            setArchetype({
              archetype: String(payload.archetype.archetype),
              archetypeLabel: String(payload.archetype.archetypeLabel),
              score: Number(payload.archetype.score) || 0,
            });
          } else {
            setArchetype(null);
          }
          if (Array.isArray(payload?.sideboards)) {
            setSideboards(toSideboards(payload.sideboards));
          }
          if (Array.isArray(payload?.cards) && payload.cards.length) {
            setEntries(current => {
              const byDbf = new Map<number, DeckEntry>(
                current.map(entry => [entry.dbfId, entry] as const),
              );
              let changed = false;
              for (const card of payload.cards as DeckEntry[]) {
                const existing = byDbf.get(card.dbfId);
                if (!existing) continue;
                if (existing.id.startsWith('dbf-') || !existing.image || existing.name.startsWith('Карта ')) {
                  byDbf.set(card.dbfId, { ...existing, ...toDeckEntry(card), count: existing.count });
                  changed = true;
                }
              }
              return changed ? sortEntries([...byDbf.values()]) : current;
            });
          }
        })
        .catch(() => undefined);
    }, 280);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [deckCode, format, heroClass]);

  useEffect(() => {
    if (!preview) return undefined;

    const dismissPreview = () => {
      previewOwnerRef.current = null;
      setPreview(null);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissPreview();
    };
    const dismissWhenHidden = () => {
      if (document.visibilityState !== 'visible') dismissPreview();
    };

    window.addEventListener('scroll', dismissPreview, true);
    window.addEventListener('resize', dismissPreview);
    document.addEventListener('pointerdown', dismissPreview, true);
    document.addEventListener('keydown', dismissOnEscape);
    document.addEventListener('visibilitychange', dismissWhenHidden);
    return () => {
      window.removeEventListener('scroll', dismissPreview, true);
      window.removeEventListener('resize', dismissPreview);
      document.removeEventListener('pointerdown', dismissPreview, true);
      document.removeEventListener('keydown', dismissOnEscape);
      document.removeEventListener('visibilitychange', dismissWhenHidden);
    };
  }, [preview]);

  useEffect(() => {
    previewOwnerRef.current = null;
    setPreview(null);
  }, [
    deferredQuery,
    filterClass,
    filterMana,
    filterMechanic,
    filterMinionType,
    filterRarity,
    filterSpellSchool,
    filterType,
    page,
  ]);

  if (authChecking) return <LoadingGate />;
  if (!isAdmin) return <AccessDenied />;

  const startEmpty = (nextClass: HeroClass, nextFormat: DeckFormat) => {
    setHeroClass(nextClass);
    setFormat(nextFormat);
    setEntries([]);
    setSideboards([]);
    setArchetype(null);
    setFilterClass(nextClass);
    setPage(1);
    setPasteError('');
    setCopyState('idle');
  };

  const applyPaste = async () => {
    const raw = pasteCode.trim();
    if (!raw) {
      setPasteError('Вставьте код колоды или ссылку HSGuru');
      return;
    }
    setPasteError('');
    try {
      const response = await fetch('/api/admin/deck-builder/resolve', {
        method: 'POST',
        credentials: 'same-origin',
        headers: adminJsonHeaders(),
        body: JSON.stringify({ deckCode: raw }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Некорректный код колоды');

      const nextClass = HERO_BY_DBF.get(Number(payload.heroDbfId));
      if (!nextClass) throw new Error('Не удалось определить класс героя');
      const nextFormat: DeckFormat = payload.format === 'wild' ? 'wild' : 'standard';
      const nextEntries: DeckEntry[] = Array.isArray(payload.cards)
        ? payload.cards.map(toDeckEntry)
        : [];

      setHeroClass(nextClass);
      setFormat(nextFormat);
      setEntries(sortEntries(nextEntries));
      setSideboards(toSideboards(payload.sideboards));
      setFilterClass(nextClass);
      setPage(1);
      setArchetype(payload.archetype?.archetypeLabel
        ? {
          archetype: String(payload.archetype.archetype),
          archetypeLabel: String(payload.archetype.archetypeLabel),
          score: Number(payload.archetype.score) || 0,
        }
        : null);
    } catch (error) {
      // Fallback local decode if resolve is unavailable.
      try {
        const fromUrl = raw.match(/[?&]code=([^&]+)/i);
        const code = decodeURIComponent((fromUrl?.[1] || raw).replace(/ /g, '+'));
        const decoded = decode(code);
        const heroDbf = Number(decoded.heroes?.[0]);
        const nextClass = HERO_BY_DBF.get(heroDbf);
        if (!nextClass) throw new Error('class');
        const nextFormat: DeckFormat = decoded.format === 1 ? 'wild' : 'standard';
        const nextEntries: DeckEntry[] = [];
        for (const [rawDbf, rawCount] of decoded.cards) {
          const dbfId = Number(rawDbf);
          const count = Number(rawCount);
          if (!isValidDbf(dbfId) || !Number.isSafeInteger(count) || count <= 0) continue;
          nextEntries.push({
            id: `dbf-${dbfId}`,
            dbfId,
            name: `Карта ${dbfId}`,
            cost: 0,
            rarity: 'COMMON',
            elite: false,
            count,
            image: '',
            cardImage: '',
          });
        }
        setHeroClass(nextClass);
        setFormat(nextFormat);
        setEntries(sortEntries(nextEntries));
        setSideboards([]);
        setFilterClass(nextClass);
        setPage(1);
        setPasteError(error instanceof Error ? error.message : 'Частичная загрузка без серверного резолва');
      } catch {
        setPasteError(error instanceof Error ? error.message : 'Некорректный код колоды');
      }
    }
  };

  const addCard = (card: CatalogCard) => {
    const base = catalogToEntry(card);
    if (!base) return;
    setEntries(current => {
      const limit = deckSizeLimit([...current, base]);
      if (totalCards(current) >= limit) return current;
      const existing = current.find(entry => entry.dbfId === base.dbfId);
      if (!existing) return sortEntries([...current, base]);
      if (existing.count >= maxCopies(existing.rarity)) return current;
      if (totalCards(current) >= limit) return current;
      return sortEntries(current.map(entry => (
        entry.dbfId === base.dbfId ? { ...entry, count: entry.count + 1 } : entry
      )));
    });
  };

  const removeCard = (dbfId: number) => {
    setEntries(current => current.flatMap(entry => {
      if (entry.dbfId !== dbfId) return [entry];
      if (entry.count <= 1) return [];
      return [{ ...entry, count: entry.count - 1 }];
    }));
  };

  const copyCode = async () => {
    if (!deckCode) return;
    try {
      await navigator.clipboard.writeText(deckCode);
      setCopyState('ok');
      window.setTimeout(() => setCopyState('idle'), 1600);
    } catch {
      setCopyState('error');
    }
  };

  const resetDeck = () => {
    setEntries([]);
    setSideboards([]);
    setArchetype(null);
    setCopyState('idle');
  };

  const leaveBuilder = () => {
    setHeroClass(null);
    setEntries([]);
    setSideboards([]);
    setArchetype(null);
    setPasteCode('');
    setPasteError('');
    setQuery('');
    setFilterMana('');
    setFilterRarity('');
    setFilterType('');
    setFilterMinionType('');
    setFilterSpellSchool('');
    setFilterMechanic('');
    setPage(1);
    setPreview(null);
  };

  const showCardPreview = (entry: DeckEntry, target: HTMLElement) => {
    if (!entry.cardImage && !entry.id) return;
    previewOwnerRef.current = target;
    setPreview({
      id: entry.id || `dbf-${entry.dbfId}`,
      name: entry.name,
      imageUrl: entry.cardImage || null,
      rect: target.getBoundingClientRect(),
    });
  };

  const clearCardPreview = () => {
    previewOwnerRef.current = null;
    setPreview(null);
  };

  const clearCatalogFilters = () => {
    clearCardPreview();
    setFilterClass(heroClass || '');
    setFilterMana('');
    setFilterRarity('');
    setFilterType('');
    setFilterMinionType('');
    setFilterSpellSchool('');
    setFilterMechanic('');
    setQuery('');
    setPage(1);
  };

  if (!heroClass) {
    return (
      <section className="deck-builder hs-timber-frame" aria-labelledby="deck-builder-title">
        <header className="deck-builder__landing-hero">
          <div className="deck-builder__hero-mark" aria-hidden="true">
            <LayoutGrid size={30} />
          </div>
          <div>
            <span className="deck-builder__eyebrow">Мастерская колод · для администратора</span>
            <h1 id="deck-builder-title">Соберите колоду</h1>
            <p>Начните с класса или вставьте готовый код. Формат и архетип определятся автоматически.</p>
          </div>
          <ol className="deck-builder__steps" aria-label="Как создать колоду">
            <li><span>1</span> Выберите класс</li>
            <li><span>2</span> Добавьте карты</li>
            <li><span>3</span> Скопируйте код</li>
          </ol>
        </header>

        <div className="deck-builder__paste hs-deck-frame">
          <div className="deck-builder__paste-copy">
            <span className="deck-builder__eyebrow">Уже есть колода?</span>
            <label className="deck-builder__paste-label" htmlFor="deck-builder-paste">
              Откройте её по коду или ссылке HSGuru
            </label>
          </div>
          <div>
            <div className="deck-builder__paste-row">
              <input
                id="deck-builder-paste"
                value={pasteCode}
                onChange={event => setPasteCode(event.target.value)}
                placeholder="AAECA… или https://www.hsguru.com/deck/…"
                autoComplete="off"
              />
              <button type="button" className="deck-builder__primary-btn" onClick={() => void applyPaste()}>
                Открыть колоду
              </button>
            </div>
            {pasteError ? <p className="deck-builder__error" role="alert">{pasteError}</p> : null}
          </div>
        </div>

        <div className="deck-builder__section-heading">
          <div>
            <span className="deck-builder__eyebrow">Новая колода</span>
            <h2>Выберите класс и формат</h2>
          </div>
          <p>Стандарт использует актуальные наборы, Вольный — всю коллекцию.</p>
        </div>

        <div className="deck-builder__class-grid" role="list">
          {CLASS_OPTIONS.map(option => (
            <div
              key={option.id}
              className="deck-builder__class-card hs-deck-frame"
              role="listitem"
              style={{ '--class-accent': option.color } as React.CSSProperties}
            >
              <div className="deck-builder__class-identity">
                <div className="deck-builder__class-seal">
                  <img src={option.icon} alt="" width="64" height="64" />
                </div>
                <div>
                  <h3>{option.label}</h3>
                  <p>{option.description}</p>
                </div>
              </div>
              <div className="deck-builder__format-actions">
                <button
                  type="button"
                  className="deck-builder__class-btn"
                  onClick={() => startEmpty(option.id, 'standard')}
                  aria-label={`${option.label}: создать колоду формата Стандарт`}
                >
                  <span>Стандарт</span>
                </button>
                <button
                  type="button"
                  className="deck-builder__class-btn deck-builder__class-btn--wild"
                  onClick={() => startEmpty(option.id, 'wild')}
                  aria-label={`${option.label}: создать колоду формата Вольный`}
                >
                  <span>Вольный</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const classMeta = CLASS_OPTIONS.find(item => item.id === heroClass)!;
  const minionTypeOptions = [...(facets.minionTypes.length
    ? facets.minionTypes
    : Object.keys(MINION_TYPE_LABELS).filter(value => value !== 'ALL'))]
    .sort((left, right) => (MINION_TYPE_LABELS[left] || left)
      .localeCompare(MINION_TYPE_LABELS[right] || right, 'ru'));
  const spellSchoolOptions = [...(facets.spellSchools.length
    ? facets.spellSchools
    : Object.keys(SPELL_SCHOOL_LABELS))]
    .sort((left, right) => (SPELL_SCHOOL_LABELS[left] || left)
      .localeCompare(SPELL_SCHOOL_LABELS[right] || right, 'ru'));
  const mechanicOptions = [...(facets.mechanics.length
    ? facets.mechanics
    : Object.keys(mechanicLabels))]
    .sort((left, right) => (mechanicLabels[left] || left)
      .localeCompare(mechanicLabels[right] || right, 'ru'));

  return (
    <section className="deck-builder deck-builder--workspace hs-timber-frame" aria-labelledby="deck-builder-workspace-title">
      <header className="deck-builder__workspace-header">
        <button type="button" className="deck-builder__ghost-btn" onClick={leaveBuilder}>
          <ArrowLeft size={16} aria-hidden="true" />
          Класс и формат
        </button>
        <div className="deck-builder__workspace-identity">
          <div className="deck-builder__workspace-seal" style={{ '--class-accent': classMeta.color } as React.CSSProperties}>
            <img src={classMeta.icon} alt="" width="64" height="64" />
          </div>
          <div>
            <span className="deck-builder__eyebrow">{FORMAT_LABELS[format]} · {classMeta.label}</span>
            <h1 id="deck-builder-workspace-title">{archetype?.archetypeLabel || 'Новая колода'}</h1>
            <p>{archetype?.archetypeLabel ? `Архетип определён по составу · ${Math.round(archetype.score * 100)}% совпадения` : 'Добавляйте карты — архетип появится автоматически.'}</p>
          </div>
        </div>
        <div
          className="deck-builder__deck-counter"
          aria-label={`${cardCount} из ${sizeLimit} карт`}
          style={{ '--deck-progress': sizeLimit ? cardCount / sizeLimit : 0 } as React.CSSProperties}
        >
          <strong>{cardCount}</strong>
          <span>из {sizeLimit} карт</span>
        </div>
        <div className="deck-builder__header-actions">
          <button type="button" className="deck-builder__ghost-btn" onClick={resetDeck} disabled={!entries.length}>
            <Trash2 size={15} aria-hidden="true" />
            Очистить
          </button>
          <button type="button" className="deck-builder__primary-btn" onClick={() => void copyCode()} disabled={!deckCode || !entries.length}>
            <Copy size={15} aria-hidden="true" />
            {copyState === 'ok' ? 'Скопировано' : copyState === 'error' ? 'Ошибка' : 'Копировать код'}
          </button>
        </div>
      </header>

      <div className="deck-builder__layout">
        <aside className="deck-builder__deck hs-deck-frame" aria-label="Состав колоды">
          <div className="deck-builder__panel-heading">
            <span className="deck-builder__eyebrow">Ваша колода</span>
            <strong>Нажмите на карту, чтобы убрать её</strong>
          </div>
          <DeckListView
            cards={sortedEntries}
            sideboards={sideboards}
            title={archetype?.archetypeLabel || classMeta.label}
            headerColor={classMeta.color}
            totalCards={cardCount}
            deckSizeLimit={sizeLimit}
            deckCode={entries.length ? deckCode : ''}
            showCopy
            interactive
            onCardClick={card => removeCard(card.dbfId)}
            emptyText="Добавьте карты из каталога."
          />
        </aside>

        <div className="deck-builder__catalog hs-deck-frame">
          <div className="deck-builder__catalog-heading">
            <div>
              <span className="deck-builder__eyebrow">Картотека</span>
              <h2>Добавьте карты</h2>
            </div>
            <span>{totalCardsInPool.toLocaleString('ru-RU')} доступно</span>
          </div>
          <div className="deck-builder__filter-menu">
            <div className="deck-builder__filter-command">
              <label className="deck-builder__search">
                <span className="deck-builder__control-label">Поиск по картотеке</span>
                <span>
                  <Search size={16} aria-hidden="true" />
                  <input
                    value={query}
                    onChange={event => { setQuery(event.target.value); setPage(1); }}
                    placeholder="Название карты или текст способности"
                    autoComplete="off"
                  />
                </span>
              </label>
              <div className="deck-builder__filter-status">
                <SlidersHorizontal size={16} aria-hidden="true" />
                <span>{activeFilterCount ? `Активных фильтров: ${activeFilterCount}` : 'Показаны все карты класса'}</span>
                <button
                  type="button"
                  className="deck-builder__filter-reset"
                  onClick={clearCatalogFilters}
                  disabled={!activeFilterCount}
                >
                  Сбросить
                </button>
              </div>
            </div>
            <div className="deck-builder__filter-groups">
              <fieldset className="deck-builder__filter-group deck-builder__filter-group--mana">
                <legend>Мана</legend>
                <div className="deck-builder__mana-options">
                  {MANA_FILTERS.map(value => (
                    <button
                      key={value || 'all'}
                      type="button"
                      className="deck-builder__mana-filter"
                      aria-pressed={filterMana === value}
                      onClick={() => { setFilterMana(value); setPage(1); }}
                    >
                      {value || 'Все'}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="deck-builder__filter-group deck-builder__filter-group--rarity">
                <legend>Редкость</legend>
                <div className="deck-builder__rarity-options">
                  {RARITY_FILTERS.map(value => (
                    <button
                      key={value || 'all'}
                      type="button"
                      className="deck-builder__rarity-filter"
                      aria-pressed={filterRarity === value}
                      onClick={() => { setFilterRarity(value); setPage(1); }}
                    >
                      {value ? (
                        <img
                          className="deck-builder__rarity-icon"
                          src={RARITY_ICONS[value]}
                          alt=""
                          width="42"
                          height="58"
                          decoding="async"
                          aria-hidden="true"
                        />
                      ) : null}
                      {value ? RARITY_LABELS[value] : 'Любая'}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="deck-builder__filter-group deck-builder__filter-group--type">
                <legend>Тип карты</legend>
                <div className="deck-builder__type-options">
                  {CARD_TYPE_FILTERS.map(value => (
                    <button
                      key={value || 'all'}
                      type="button"
                      className="deck-builder__type-filter"
                      aria-pressed={filterType === value}
                      onClick={() => {
                        setFilterType(value);
                        if (value !== 'SPELL') setFilterSpellSchool('');
                        if (value !== 'MINION') setFilterMinionType('');
                        setPage(1);
                      }}
                    >
                      {value ? TYPE_LABELS[value] : 'Все'}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="deck-builder__filters">
                <label>
                  Класс
                  <select value={filterClass} onChange={event => { setFilterClass(event.target.value); setPage(1); }}>
                    <option value="">Любой класс</option>
                    {(facets.classes.length ? facets.classes : [...CLASS_OPTIONS.map(item => item.id), 'NEUTRAL']).map(value => (
                      <option key={value} value={value}>{CLASS_LABELS[value] || value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Школа заклинания
                  <select
                    value={filterSpellSchool}
                    disabled={Boolean(filterType && filterType !== 'SPELL')}
                    onChange={event => {
                      const value = event.target.value;
                      setFilterSpellSchool(value);
                      if (value) {
                        setFilterType('SPELL');
                        setFilterMinionType('');
                      }
                      setPage(1);
                    }}
                  >
                    <option value="">Любая школа</option>
                    {spellSchoolOptions.map(value => (
                      <option key={value} value={value}>{SPELL_SCHOOL_LABELS[value] || value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Тип существа
                  <select
                    value={filterMinionType}
                    disabled={Boolean(filterType && filterType !== 'MINION')}
                    onChange={event => {
                      const value = event.target.value;
                      setFilterMinionType(value);
                      if (value) {
                        setFilterType('MINION');
                        setFilterSpellSchool('');
                      }
                      setPage(1);
                    }}
                  >
                    <option value="">Любой тип</option>
                    {minionTypeOptions.map(value => (
                      <option key={value} value={value}>{MINION_TYPE_LABELS[value] || value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Эффект карты
                  <select value={filterMechanic} onChange={event => { setFilterMechanic(event.target.value); setPage(1); }}>
                    <option value="">Любой эффект</option>
                    {mechanicOptions.map(value => (
                      <option key={value} value={value}>{mechanicLabels[value] || value}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          {cardsError ? (
            <div className="deck-builder__catalog-error" role="alert">
              <span>{cardsError}</span>
              <button type="button" className="deck-builder__ghost-btn" onClick={() => setReloadToken(token => token + 1)}>
                <RefreshCw size={14} aria-hidden="true" />
                Повторить
              </button>
            </div>
          ) : null}

          <div className="deck-builder__gallery" aria-busy={cardsLoading}>
            {cardsLoading && !cards.length ? (
              <p className="deck-builder__empty">Загружаем карты…</p>
            ) : cards.length === 0 ? (
              <p className="deck-builder__empty">Карт по фильтрам не найдено.</p>
            ) : cards.map(card => {
              const entry = catalogToEntry(card);
              const inDeck = entry ? entries.find(item => item.dbfId === entry.dbfId) : null;
              const atCap = Boolean(inDeck && inDeck.count >= maxCopies(inDeck.rarity));
              const deckFull = cardCount >= sizeLimit;
              return (
                <button
                  key={card.card_id}
                  type="button"
                  className={`deck-builder__card ${atCap || deckFull ? 'is-disabled' : ''} ${inDeck ? 'is-in-deck' : ''}`}
                  onClick={() => {
                    clearCardPreview();
                    addCard(card);
                  }}
                  onPointerEnter={event => {
                    if (event.pointerType === 'mouse' && entry) showCardPreview(entry, event.currentTarget);
                  }}
                  onPointerLeave={clearCardPreview}
                  onFocus={event => entry && showCardPreview(entry, event.currentTarget)}
                  onBlur={clearCardPreview}
                  disabled={!entry || atCap || deckFull}
                  title={cardName(card)}
                >
                  <img
                    src={entry?.cardImage || ''}
                    alt={cardName(card)}
                    loading="lazy"
                    decoding="async"
                  />
                  {inDeck ? <span className="deck-builder__card-badge">×{inDeck.count}</span> : null}
                </button>
              );
            })}
          </div>

          <div className="deck-builder__pager">
            <span>
              Страница
              {' '}
              {page}
              {' '}
              из
              {' '}
              {totalPages}
              {' · '}
              {totalCardsInPool}
              {' '}
              карт
            </span>
            <div>
              <button type="button" className="deck-builder__ghost-btn" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>
                Назад
              </button>
              <button type="button" className="deck-builder__ghost-btn" disabled={page >= totalPages} onClick={() => setPage(current => Math.min(totalPages, current + 1))}>
                Вперёд
              </button>
            </div>
          </div>
        </div>
      </div>
      {preview ? (
        <React.Fragment key={`${preview.id}:${preview.imageUrl || ''}`}>
          <CardPreviewTooltip preview={preview} />
        </React.Fragment>
      ) : null}
    </section>
  );
}
