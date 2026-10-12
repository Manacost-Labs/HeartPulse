import { useEffect, useRef, useState } from 'react';
import { downloadDeckImage, loadDeckCatalog } from './api/client';
import { canAddDeckCard, changeDeckCopies, deckCount, type BuilderCard, type BuilderCatalog,
  type BuilderCatalogQuery, type BuilderClass, type BuilderEntry, type BuilderFormat, type DeckLimit } from './model/selection';

export type DeckBuilderPorts = {
  encode: (heroClass: BuilderClass, format: BuilderFormat, cards: BuilderEntry[]) => string;
  limit: DeckLimit;
  render: (code: string, name: string) => Promise<{ imageUrl: string }>;
  load?: typeof loadDeckCatalog;
  download?: typeof downloadDeckImage;
  label?: (kind: 'set' | 'type' | 'minionType' | 'spellSchool', value: string) => string;
};
export type DeckBuilderInitial = {
  heroClass?: BuilderClass; format?: BuilderFormat; cards?: BuilderEntry[];
};

export function useDeckBuilder(ports: DeckBuilderPorts, initial: DeckBuilderInitial = {}) {
  const [filters, setFilters] = useState<BuilderCatalogQuery>({ heroClass: initial.heroClass ?? 'MAGE',
    format: initial.format ?? 'standard', query: '', mana: '', rarity: '', pool: '', page: 1,
    set: '', type: '', mechanic: '', minionType: '', spellSchool: '', sort: 'mana', direction: 'asc' });
  const [deck, setDeck] = useState<BuilderEntry[]>(initial.cards ?? []);
  const [name, setName] = useState('Моя колода');
  const [catalog, setCatalog] = useState<BuilderCatalog>({ cards: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<'clear' | { heroClass: BuilderClass; format: BuilderFormat } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [notice, setNotice] = useState('');
  const exportLock = useRef(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const load = ports.load ?? loadDeckCatalog;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      void load(filters, AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]))
        .then(result => { if (!controller.signal.aborted) setCatalog(result); })
        .catch(() => {
          if (!controller.signal.aborted) {
            setCatalog({ cards: [], total: 0, totalPages: 1 });
            setError('Не удалось загрузить карты. Попробуйте ещё раз.');
          }
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, filters.query ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, load, reload]);

  const count = deckCount(deck);
  const limit = ports.limit(deck);
  const code = deck.length ? ports.encode(filters.heroClass, filters.format, deck) : '';
  function filter<K extends keyof BuilderCatalogQuery>(key: K, value: BuilderCatalogQuery[K]) {
    setFilters(current => ({ ...current, [key]: value, page: key === 'page' ? Number(value) : 1 }));
  }
  function context(heroClass: BuilderClass, format: BuilderFormat) {
    if (heroClass === filters.heroClass && format === filters.format) return;
    if (deck.length) setPending({ heroClass, format });
    else setFilters(current => ({ ...current, heroClass, format, pool: '', set: '', page: 1 }));
  }
  function confirmReset() {
    setDeck([]);
    setNotice('');
    setExportError('');
    if (pending && pending !== 'clear') {
      setFilters(current => ({ ...current, ...pending, pool: '', set: '', page: 1 }));
    }
    setPending(null);
  }
  function change(card: BuilderCard, delta: 1 | -1) {
    setDeck(current => changeDeckCopies(current, card, delta, filters.heroClass, ports.limit));
    setNotice('');
    setExportError('');
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
    label: ports.label ?? ((_kind: string, value: string) => value),
    resetFilters: () => setFilters(current => ({ ...current, query: '', mana: '', rarity: '', pool: '',
      set: '', type: '', mechanic: '', minionType: '', spellSchool: '', sort: 'mana', direction: 'asc', page: 1 })),
    retry: () => setReload(value => value + 1), pending, cancelReset: () => setPending(null),
    clear: () => setPending('clear'), confirmReset, change,
    canAdd: (card: BuilderCard) => canAddDeckCard(deck, card, filters.heroClass, ports.limit),
    saveImage, exporting, exportError, notice, copyCode };
}
