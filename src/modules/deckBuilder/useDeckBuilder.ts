import { useEffect, useRef, useState } from 'react';
import { downloadDeckImage, loadDeckCatalog } from './api/client';
import { loadCardConfiguration } from './api/configuration';
import { canAddSideboard, changeSideboard, configurationIssues, type CardConfiguration } from './model/configuration';
import { loadGameRules } from './api/gameRules';
import { useDeckLegality } from './useDeckLegality';
import { useDeckCatalog } from './useDeckCatalog';
import { canAddDeckCard, changeDeckCopies, deckCount, type BuilderCard,
  type BuilderCatalogQuery, type BuilderClass, type BuilderEntry, type BuilderFormat, type DeckLimit } from './model/selection';

export type DeckBuilderPorts = {
  encode: (heroClass: BuilderClass, format: BuilderFormat, cards: BuilderEntry[]) => string;
  limit: DeckLimit;
  render: (code: string, name: string) => Promise<{ imageUrl: string }>;
  load?: typeof loadDeckCatalog;
  download?: typeof downloadDeckImage;
  label?: (kind: 'set' | 'type' | 'minionType' | 'spellSchool', value: string) => string;
  loadConfiguration?: typeof loadCardConfiguration;
  loadRules?: typeof loadGameRules;
};
export type DeckBuilderInitial = {
  heroClass?: BuilderClass; format?: BuilderFormat; cards?: BuilderEntry[];
};

const sameFilters = (left: BuilderCatalogQuery, right: BuilderCatalogQuery) =>
  Object.entries(right).every(([key, value]) => left[key as keyof BuilderCatalogQuery] === value);

export function useDeckBuilder(ports: DeckBuilderPorts, initial: DeckBuilderInitial = {}) {
  const [filters, setFilters] = useState<BuilderCatalogQuery>({ heroClass: initial.heroClass ?? 'MAGE',
    format: initial.format ?? 'standard', query: '', mana: '', rarity: '', pool: '', page: 1,
    set: '', type: '', mechanic: '', minionType: '', spellSchool: '', sort: 'mana', direction: 'asc' });
  const [deck, setDeck] = useState<BuilderEntry[]>(initial.cards ?? []);
  const [configurationOwner, setConfigurationOwner] = useState<number | null>(null);
  const mainFilters = useRef<BuilderCatalogQuery | null>(null);
  const legality = useDeckLegality(deck, filters.heroClass, ports.loadRules);
  const [name, setName] = useState('Моя колода');
  const [pending, setPending] = useState<'clear' | { heroClass: BuilderClass; format: BuilderFormat } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [notice, setNotice] = useState('');
  const exportLock = useRef(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const load = ports.load ?? loadDeckCatalog;
  const { catalog, loading, error, retry } = useDeckCatalog(filters, load, legality.destination);

  const count = deckCount(deck);
  const limit = ports.limit(deck);
  const issues = [...configurationIssues(deck), ...legality.issues];
  const code = deck.length && count <= limit && !issues.length ? ports.encode(filters.heroClass, filters.format, deck) : '';
  function filter<K extends keyof BuilderCatalogQuery>(key: K, value: BuilderCatalogQuery[K]) {
    setFilters(current => ({ ...current, [key]: value, page: key === 'page' ? Number(value) : 1 }));
  }
  function context(heroClass: BuilderClass, format: BuilderFormat) {
    if (heroClass === filters.heroClass && format === filters.format) return;
    if (deck.length) setPending({ heroClass, format });
    else { setFilters(current => ({ ...current, heroClass, format, pool: '', set: '', page: 1 })); legality.reset(); }
  }
  function confirmReset() {
    setDeck([]);
    setConfigurationOwner(null);
    mainFilters.current = null;
    legality.reset();
    setNotice('');
    setExportError('');
    if (pending && pending !== 'clear') {
      setFilters(current => ({ ...current, ...pending, pool: '', set: '', page: 1 }));
    }
    setPending(null);
  }
  function change(card: BuilderCard, delta: 1 | -1) {
    setDeck(current => changeDeckCopies(current, card, delta, filters.heroClass, ports.limit, legality.legal));
    if (delta < 0 && card.dbfId === configurationOwner && (deck.find(entry => entry.dbfId === card.dbfId)?.count ?? 0) <= 1) closeConfiguration();
    if (delta < 0 && /турист|tourist/i.test(card.text ?? '')) {
      setFilters(current => current.pool === 'tourist' ? { ...current, pool: '', page: 1 } : current);
    }
    setNotice('');
    setExportError('');
  }
  function changeConfiguration(card: BuilderCard, delta: 1 | -1, configuration: CardConfiguration) {
    if (configurationOwner === null) return;
    setDeck(current => changeSideboard(current, configurationOwner, card, delta, filters.heroClass, configuration, legality.legal));
    setNotice('');
    setExportError('');
  }
  function configure(card: BuilderCard) {
    if (!mainFilters.current) mainFilters.current = filters;
    setConfigurationOwner(card.dbfId);
    if (card.id === 'ETC_080') setFilters(current => {
      const next = { ...current, query: '', mana: '', rarity: '', pool: '', set: '',
        type: '', mechanic: '', minionType: '', spellSchool: '', page: 1 };
      return sameFilters(current, next) ? current : next;
    });
  }
  function closeConfiguration() {
    setConfigurationOwner(null);
    if (mainFilters.current) {
      const next = { ...mainFilters.current,
        pool: mainFilters.current.pool === 'tourist' && !legality.destination ? '' : mainFilters.current.pool };
      setFilters(current => sameFilters(current, next) ? current : next);
    }
    mainFilters.current = null;
  }
  async function saveImage() {
    if (!code || count > limit || exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    setExportError('');
    setNotice('');
    const snapshotName = name.trim() || 'Моя колода';
    try {
      const asset = await ports.render(code, snapshotName);
      if (!live.current) return;
      await (ports.download ?? downloadDeckImage)(asset.imageUrl, snapshotName);
      if (live.current) setNotice(`Картинка «${snapshotName}» сохранена`);
    } catch {
      if (live.current) setExportError('Не удалось сохранить картинку. Попробуйте ещё раз.');
    } finally {
      exportLock.current = false;
      if (live.current) setExporting(false);
    }
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(code); setNotice('Код колоды скопирован'); }
    catch { setNotice('Не удалось скопировать код. Выделите его в поле ниже.'); }
  }
  return { filters, filter, context, deck, count, limit, code, name, setName, catalog, loading, error,
    issues, configurationCard: deck.find(card => card.dbfId === configurationOwner) ?? null,
    configure, closeConfiguration, legality,
    loadConfiguration: ports.loadConfiguration ?? loadCardConfiguration, changeConfiguration,
    label: ports.label ?? ((_kind: string, value: string) => value),
    resetFilters: () => setFilters(current => ({ ...current, query: '', mana: '', rarity: '', pool: '',
      set: '', type: '', mechanic: '', minionType: '', spellSchool: '', sort: 'mana', direction: 'asc', page: 1 })),
    retry, pending, cancelReset: () => setPending(null),
    clear: () => setPending('clear'), confirmReset, change,
    canAdd: (card: BuilderCard) => canAddDeckCard(deck, card, filters.heroClass, ports.limit, legality.legal),
    canAddToConfiguration: (card: BuilderCard, owner: number, configuration: CardConfiguration) =>
      canAddSideboard(deck, owner, card, filters.heroClass, configuration, legality.legal),
    saveImage, exporting, exportError, notice, copyCode };
}
