import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { decode } from '@firestone-hs/deckstrings';
import {
  ArrowLeft,
  Copy,
  ChevronDown,
  LayoutGrid,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Undo2,
} from 'lucide-react';
import CardPreviewTooltip, { type CardPreviewTarget } from './CardPreviewTooltip';
import { publicResourceUrl } from '../publicResourceUrl';
import DeckManaCurve from './DeckManaCurve';
import {
  CONSTRUCTED_HERO_BY_DBF,
  encodeConstructedDeck,
  type ConstructedDeckFormat as DeckFormat,
  type ConstructedHeroClass as HeroClass,
} from './constructedDeckCode';
import DeckListView, { type DeckListSideboard } from './decklist/DeckListView';
import {
  readDeckBuilderDraft,
  writeDeckBuilderDraft,
} from './deckBuilderDraft';
import {
  deckCompletionLabel,
  deckSizeLimit,
  isCatalogCardLegalForHero,
  maxCardCopies,
  totalDeckCards,
  type DeckBuilderEntry as DeckEntry,
} from './deckBuilderRules';
import './DeckBuilder.css';

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

type ArchetypeInfo = {
  archetype: string;
  archetypeLabel: string;
  score: number;
};

type DeckBuilderProps = {
  isAdmin: boolean;
  authChecking?: boolean;
};

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

function cardName(card: Pick<CatalogCard, 'name' | 'card_id'>): string {
  return card.name?.ru || card.name?.en || card.card_id;
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
    image: `/api/public-resource/hsjson/v1/tiles/${encodeURIComponent(card.card_id)}.webp`,
    cardImage: publicResourceUrl(card.images?.card)
      || `/api/public-resource/hsjson/v1/render/latest/ruRU/512x/${encodeURIComponent(card.card_id)}.png`,
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
  const [initialDeckCode] = useState(() => (
    typeof window === 'undefined'
      ? ''
      : new URLSearchParams(window.location.search).get('code')?.trim() || ''
  ));
  const [initialDraft] = useState(() => (
    typeof window === 'undefined' || initialDeckCode
      ? null
      : readDeckBuilderDraft(window.localStorage)
  ));
  const [heroClass, setHeroClass] = useState<HeroClass | null>(initialDraft?.heroClass ?? null);
  const [format, setFormat] = useState<DeckFormat>(initialDraft?.format ?? 'standard');
  const [entries, setEntries] = useState<DeckEntry[]>(initialDraft?.entries ?? []);
  const [sideboards, setSideboards] = useState<DeckListSideboard[]>(initialDraft?.sideboards ?? []);
  const [archetype, setArchetype] = useState<ArchetypeInfo | null>(null);
  const [pasteCode, setPasteCode] = useState(initialDeckCode);
  const [pasteError, setPasteError] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle');
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    initialDraft ? 'saved' : 'idle',
  );
  const [notice, setNotice] = useState('');
  const [undoEntries, setUndoEntries] = useState<DeckEntry[] | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'cards' | 'deck'>('cards');
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
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
  const initialDeckLoadRef = useRef(false);

  const deckCode = useMemo(
    () => (heroClass ? encodeConstructedDeck({
      heroClass,
      format,
      cards: entries,
      sideboards,
    }) : ''),
    [entries, format, heroClass, sideboards],
  );
  const cardCount = totalDeckCards(entries);
  const sizeLimit = deckSizeLimit(entries);
  const sortedEntries = useMemo(() => sortEntries(entries), [entries]);
  const activeFilterCount = [
    filterClass !== '',
    filterMana !== '',
    filterRarity,
    filterType,
    filterMinionType,
    filterSpellSchool,
    filterMechanic,
    query.trim(),
  ].filter(Boolean).length;
  const deckReady = cardCount === sizeLimit;
  const completionLabel = deckCompletionLabel(cardCount, sizeLimit);

  useEffect(() => {
    if (!heroClass || typeof window === 'undefined') return undefined;
    setDraftState('saving');
    const timer = window.setTimeout(() => {
      const saved = writeDeckBuilderDraft(window.localStorage, {
        heroClass,
        format,
        entries,
        sideboards,
      });
      setDraftState(saved ? 'saved' : 'error');
    }, 240);
    return () => window.clearTimeout(timer);
  }, [entries, format, heroClass, sideboards]);

  useEffect(() => {
    if (!heroClass) return undefined;
    const controller = new AbortController();
    setCardsLoading(true);
    setCardsError('');
    const params = new URLSearchParams({
      format,
      deckClass: heroClass,
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

  useEffect(() => {
    if (authChecking || !isAdmin || !initialDeckCode || initialDeckLoadRef.current) return;
    initialDeckLoadRef.current = true;
    void applyPaste(initialDeckCode);
  }, [authChecking, initialDeckCode, isAdmin]);

  if (authChecking) return <LoadingGate />;
  if (!isAdmin) return <AccessDenied />;

  const startEmpty = (nextClass: HeroClass, nextFormat: DeckFormat) => {
    setHeroClass(nextClass);
    setFormat(nextFormat);
    setEntries([]);
    setSideboards([]);
    setArchetype(null);
    setFilterClass('');
    setPage(1);
    setPasteError('');
    setCopyState('idle');
    setUndoEntries(null);
    setNotice(`Новая колода: ${CLASS_LABELS[nextClass]}, ${FORMAT_LABELS[nextFormat]}.`);
    setMobilePanel('cards');
  };

  async function applyPaste(rawOverride?: string) {
    const raw = (rawOverride ?? pasteCode).trim();
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

      const nextClass = CONSTRUCTED_HERO_BY_DBF.get(Number(payload.heroDbfId));
      if (!nextClass) throw new Error('Не удалось определить класс героя');
      const nextFormat: DeckFormat = payload.format === 'wild' ? 'wild' : 'standard';
      const nextEntries: DeckEntry[] = Array.isArray(payload.cards)
        ? payload.cards.map(toDeckEntry)
        : [];

      setHeroClass(nextClass);
      setFormat(nextFormat);
      setEntries(sortEntries(nextEntries));
      setSideboards(toSideboards(payload.sideboards));
      setFilterClass('');
      setPage(1);
      setUndoEntries(entries);
      setNotice(`Колода загружена: ${nextEntries.reduce((sum, entry) => sum + entry.count, 0)} карт.`);
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
        const nextClass = CONSTRUCTED_HERO_BY_DBF.get(heroDbf);
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
        setFilterClass('');
        setPage(1);
        setUndoEntries(entries);
        setNotice('Колода загружена частично. Названия карт уточняются.');
        setPasteError(error instanceof Error ? error.message : 'Частичная загрузка без серверного резолва');
      } catch {
        setPasteError(error instanceof Error ? error.message : 'Некорректный код колоды');
      }
    }
  }

  const addCard = (card: CatalogCard) => {
    const base = catalogToEntry(card);
    if (!base || !heroClass) {
      setNotice('Эту карту нельзя добавить в колоду.');
      return;
    }
    if (!isCatalogCardLegalForHero(card, heroClass)) {
      setNotice(`«${base.name}» недоступна классу ${CLASS_LABELS[heroClass]}.`);
      return;
    }
    const existing = entries.find(entry => entry.dbfId === base.dbfId);
    if (existing && existing.count >= maxCardCopies(existing.rarity)) {
      setNotice(`Достигнут лимит копий карты «${base.name}».`);
      return;
    }
    const nextLimit = deckSizeLimit(existing ? entries : [...entries, base]);
    if (cardCount >= nextLimit) {
      setNotice(`В колоде уже ${nextLimit} карт.`);
      return;
    }
    setUndoEntries(entries);
    setConfirmingReset(false);
    setEntries(existing
      ? sortEntries(entries.map(entry => (
        entry.dbfId === base.dbfId ? { ...entry, count: entry.count + 1 } : entry
      )))
      : sortEntries([...entries, base]));
    setNotice(`Добавлена карта «${base.name}».`);
  };

  const removeCard = (dbfId: number) => {
    const removed = entries.find(entry => entry.dbfId === dbfId);
    if (!removed) return;
    setUndoEntries(entries);
    setEntries(entries.flatMap(entry => {
      if (entry.dbfId !== dbfId) return [entry];
      if (entry.count <= 1) return [];
      return [{ ...entry, count: entry.count - 1 }];
    }));
    setNotice(`Убрана одна копия «${removed.name}».`);
  };

  const incrementCard = (dbfId: number) => {
    const entry = entries.find(item => item.dbfId === dbfId);
    if (!entry) return;
    if (entry.count >= maxCardCopies(entry.rarity)) {
      setNotice(`Достигнут лимит копий карты «${entry.name}».`);
      return;
    }
    if (cardCount >= sizeLimit) {
      setNotice(`В колоде уже ${sizeLimit} карт.`);
      return;
    }
    setUndoEntries(entries);
    setEntries(sortEntries(entries.map(item => (
      item.dbfId === dbfId ? { ...item, count: item.count + 1 } : item
    ))));
    setNotice(`Добавлена ещё одна копия «${entry.name}».`);
  };

  const copyCode = async () => {
    if (!deckCode) return;
    try {
      await navigator.clipboard.writeText(deckCode);
      setCopyState('ok');
      setNotice(deckReady ? 'Код готовой колоды скопирован.' : `Код черновика скопирован. ${completionLabel}.`);
      window.setTimeout(() => setCopyState('idle'), 1600);
    } catch {
      setCopyState('error');
      setNotice('Не удалось скопировать код колоды.');
    }
  };

  const resetDeck = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      setNotice('Нажмите «Точно очистить» ещё раз. Действие можно будет отменить.');
      window.setTimeout(() => setConfirmingReset(false), 4000);
      return;
    }
    setUndoEntries(entries);
    setEntries([]);
    setSideboards([]);
    setArchetype(null);
    setCopyState('idle');
    setConfirmingReset(false);
    setNotice('Колода очищена. При необходимости отмените действие.');
  };

  const undoLastChange = () => {
    if (!undoEntries) return;
    const current = entries;
    setEntries(undoEntries);
    setUndoEntries(current);
    setConfirmingReset(false);
    setNotice('Последнее изменение отменено.');
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
    setMobilePanel('cards');
    setAdvancedFiltersOpen(false);
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
    setFilterClass('');
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
            <h2>Выберите формат и класс</h2>
          </div>
          <div className="deck-builder__format-picker" aria-label="Формат новой колоды">
            {(['standard', 'wild'] as const).map(value => (
              <button
                key={value}
                type="button"
                aria-pressed={format === value}
                onClick={() => setFormat(value)}
              >
                {FORMAT_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="deck-builder__class-grid">
          {CLASS_OPTIONS.map(option => (
            <button
              type="button"
              key={option.id}
              className="deck-builder__class-card hs-deck-frame"
              style={{ '--class-accent': option.color } as React.CSSProperties}
              onClick={() => startEmpty(option.id, format)}
              aria-label={`${option.label}: создать колоду формата ${FORMAT_LABELS[format]}`}
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
              <span className="deck-builder__class-action">Создать</span>
            </button>
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
            <p>
              {archetype?.archetypeLabel
                ? `Архетип определён по составу · ${Math.round(archetype.score * 100)}% совпадения`
                : completionLabel}
              {' · '}
              {draftState === 'saving'
                ? 'сохраняем черновик'
                : draftState === 'error'
                  ? 'черновик не сохранён'
                  : draftState === 'idle' ? 'черновик подготовлен' : 'черновик сохранён'}
            </p>
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
          <button type="button" className="deck-builder__ghost-btn" onClick={undoLastChange} disabled={!undoEntries}>
            <Undo2 size={15} aria-hidden="true" />
            Отменить
          </button>
          <button type="button" className="deck-builder__ghost-btn" onClick={resetDeck} disabled={!entries.length}>
            <Trash2 size={15} aria-hidden="true" />
            {confirmingReset ? 'Точно очистить' : 'Очистить'}
          </button>
          <button type="button" className="deck-builder__primary-btn" onClick={() => void copyCode()} disabled={!deckCode || !entries.length}>
            <Copy size={15} aria-hidden="true" />
            {copyState === 'ok' ? 'Скопировано' : copyState === 'error' ? 'Ошибка' : 'Копировать код'}
          </button>
        </div>
        <p className="deck-builder__notice" role="status" aria-live="polite">
          {notice || completionLabel}
        </p>
      </header>

      <div className="deck-builder__mobile-tabs" aria-label="Раздел конструктора">
        <button
          type="button"
          aria-pressed={mobilePanel === 'cards'}
          onClick={() => setMobilePanel('cards')}
        >
          Карты
        </button>
        <button
          type="button"
          aria-pressed={mobilePanel === 'deck'}
          onClick={() => setMobilePanel('deck')}
        >
          Колода <span>{cardCount}/{sizeLimit}</span>
        </button>
      </div>

      <div className={`deck-builder__layout is-${mobilePanel}`}>
        <aside className="deck-builder__deck hs-deck-frame" aria-label="Состав колоды">
          <div className="deck-builder__panel-heading">
            <span className="deck-builder__eyebrow">Ваша колода</span>
            <strong>{completionLabel}</strong>
          </div>
          <DeckListView
            cards={sortedEntries}
            sideboards={sideboards}
            title={archetype?.archetypeLabel || classMeta.label}
            headerColor={classMeta.color}
            totalCards={cardCount}
            deckSizeLimit={sizeLimit}
            deckCode={entries.length ? deckCode : ''}
            interactive
            onCardIncrement={card => incrementCard(card.dbfId)}
            onCardDecrement={card => removeCard(card.dbfId)}
            emptyText="Добавьте карты из каталога."
          />
          {entries.length ? <DeckManaCurve cards={entries} /> : null}
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

              <button
                type="button"
                className="deck-builder__advanced-toggle"
                aria-expanded={advancedFiltersOpen}
                onClick={() => setAdvancedFiltersOpen(open => !open)}
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                Дополнительные фильтры
                <ChevronDown size={16} aria-hidden="true" />
              </button>

              <div className={`deck-builder__advanced-filters ${advancedFiltersOpen ? 'is-open' : ''}`}>
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
                    Принадлежность
                    <select value={filterClass} onChange={event => { setFilterClass(event.target.value); setPage(1); }}>
                      <option value="">Все доступные</option>
                      <option value={heroClass}>{CLASS_LABELS[heroClass]}</option>
                      <option value="NEUTRAL">Нейтральные</option>
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
              const atCap = Boolean(inDeck && inDeck.count >= maxCardCopies(inDeck.rarity));
              const deckFull = cardCount >= sizeLimit;
              const illegal = !isCatalogCardLegalForHero(card, heroClass);
              const disabledReason = illegal
                ? `Недоступна классу ${classMeta.label}`
                : atCap ? 'Достигнут лимит копий' : deckFull ? `В колоде уже ${sizeLimit} карт` : '';
              return (
                <button
                  key={card.card_id}
                  type="button"
                  className={`deck-builder__card ${disabledReason ? 'is-disabled' : ''} ${inDeck ? 'is-in-deck' : ''}`}
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
                  aria-disabled={Boolean(!entry || disabledReason)}
                  title={disabledReason ? `${cardName(card)} — ${disabledReason}` : cardName(card)}
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
