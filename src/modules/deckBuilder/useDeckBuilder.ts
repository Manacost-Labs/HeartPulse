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

const emptyFilters = (heroClass: BuilderClass, format: BuilderFormat): BuilderCatalogQuery => ({
  heroClass, format, query: '', mana: '', rarity: '', pool: '', page: 1,
  set: '', type: '', mechanic: '', minionType: '', spellSchool: '', sort: 'mana', direction: 'asc',
});

export function useDeckBuilder(ports: DeckBuilderPorts, initial: DeckBuilderInitial = {}) {
  const [collectionFilters, setCollectionFilters] = useState(() => emptyFilters(initial.heroClass ?? 'MAGE', initial.format ?? 'standard'));
  const [bandFilters, setBandFilters] = useState(collectionFilters);
  const [deck, setDeck] = useState<BuilderEntry[]>(initial.cards ?? []);
  const [configurationOwner, setConfigurationOwner] = useState<number | null>(null);
  const configurationCard = deck.find(card => card.dbfId === configurationOwner) ?? null;
  const editingBand = configurationCard?.id === 'ETC_080';
  const filters = editingBand ? bandFilters : collectionFilters;
  const setFilters = editingBand ? setBandFilters : setCollectionFilters;
  const legality = useDeckLegality(deck, collectionFilters.heroClass, ports.loadRules);
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
  const code = deck.length && count <= limit && !issues.length ? ports.encode(collectionFilters.heroClass, collectionFilters.format, deck) : '';
  function filter<K extends keyof BuilderCatalogQuery>(key: K, value: BuilderCatalogQuery[K]) {
    setFilters(current => ({ ...current, [key]: value, page: key === 'page' ? Number(value) : 1 }));
  }
  function context(heroClass: BuilderClass, format: BuilderFormat) {
    if (heroClass === filters.heroClass && format === filters.format) return;
    if (deck.length) setPending({ heroClass, format });
    else {
      setCollectionFilters(current => ({ ...current, heroClass, format, pool: '', set: '', page: 1 }));
      setBandFilters(emptyFilters(heroClass, format));
      legality.reset();
    }
  }
  function confirmReset() {
    setDeck([]);
    setConfigurationOwner(null);
    legality.reset();
    setNotice('');
    setExportError('');
    if (pending && pending !== 'clear') {
      setCollectionFilters(current => ({ ...current, ...pending, pool: '', set: '', page: 1 }));
      setBandFilters(emptyFilters(pending.heroClass, pending.format));
    }
    setPending(null);
  }
  function change(card: BuilderCard, delta: 1 | -1) {
    setDeck(current => changeDeckCopies(current, card, delta, filters.heroClass, ports.limit, legality.legal));
    if (delta < 0 && card.dbfId === configurationOwner && (deck.find(entry => entry.dbfId === card.dbfId)?.count ?? 0) <= 1) closeConfiguration();
    if (delta < 0 && /турист|tourist/i.test(card.text ?? '')) {
      setCollectionFilters(current => current.pool === 'tourist' ? { ...current, pool: '', page: 1 } : current);
      setBandFilters(current => current.pool === 'tourist' ? { ...current, pool: '', page: 1 } : current);
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
  function configure(card: BuilderCard) { setConfigurationOwner(card.dbfId); }
  function closeConfiguration() { setConfigurationOwner(null); }
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
    issues, configurationCard,
    configure, closeConfiguration, legality,
    loadConfiguration: ports.loadConfiguration ?? loadCardConfiguration, changeConfiguration,
    label: ports.label ?? ((_kind: string, value: string) => value),
    resetFilters: () => setFilters(emptyFilters(filters.heroClass, filters.format)),
    retry, pending, cancelReset: () => setPending(null),
    clear: () => setPending('clear'), confirmReset, change,
    canAdd: (card: BuilderCard) => canAddDeckCard(deck, card, filters.heroClass, ports.limit, legality.legal),
    canAddToConfiguration: (card: BuilderCard, owner: number, configuration: CardConfiguration) =>
      canAddSideboard(deck, owner, card, filters.heroClass, configuration, legality.legal),
    saveImage, exporting, exportError, notice, copyCode };
}
