'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  battlegroundHeroRosterBridgeV1, DEFAULT_TIER_BUILDER_FILTERS, matchesTierBuilderFilters, placedTierBuilderCount,
  TIER_BUILDER_TIERS, tierBuilderCardImage, tierBuilderCardMeta,
  type TierBuilderCard, type TierBuilderFilters, type TierBuilderPlacement,
} from '../modules/battlegrounds/public';
import { publicResourceUrl } from '../publicResourceUrl';
import { TierList, type TierItem } from '../vendor/varylo-ui/gaming/TierList';
import { GameImage } from '../vendor/varylo-ui/gaming/picture';
import { exportTierBuilderImage, type TierBuilderBackground } from './battlegroundTierBuilderExport';
import { useTierBuilderDraft, useTierBuilderPool, type ClassicRuntime } from './battlegroundTierBuilderDraft';
import { cardsWord, TierBuilderFilterPanel, TierBuilderToolbar } from './BattlegroundTierBuilderControls';
import '../vendor/varylo-ui/styles/index.css';
import '../shared/ui/varyloParchment.css';
import './BattlegroundTierBuilder.css';

export type { ClassicRuntime } from './battlegroundTierBuilderDraft';

const POOL_PAGE = 60;
const RUNTIME_SCRIPTS = ['shared.js', 'tier-data.js', 'accessories-data.js'];
const RUNTIME_VERSION = '20261011-pool-3661-workspace-v2';
const TIERS = TIER_BUILDER_TIERS.map(tier => ({ ...tier }));
const EMPTY_PLACEMENT: TierBuilderPlacement = {};
const LABELS = {
  title: 'Конструктор тир-листов', mode: 'Режим', view: 'Просмотр', edit: 'Правка', pool: 'Пул карт',
  emptyTier: 'Перетащите карту сюда', emptyView: 'Пусто',
  hint: 'Перетаскивайте мышью, долгим нажатием на телефоне или клавишами: пробел — взять, стрелки — двигать, пробел — положить',
  instructions: 'Стрелки переходят между картами. Пробел берёт карту, стрелки двигают её, пробел кладёт, Escape отменяет.',
  position: (tier: string, position: number, total: number) => `${tier}, ${position} из ${total}`,
  pickedUp: (item: string, position: string) => `${item} взята. ${position}.`,
  dropped: (item: string, position: string) => `${item} положена. ${position}.`,
  cancelled: (item: string, position: string) => `Перенос отменён. ${item} снова в ${position}.`,
  copyText: 'Копировать текстом', copied: 'Скопировано', copyFailed: 'Не удалось скопировать', download: 'Скачать JSON',
  count: (count: number) => `${count} ${cardsWord(count)}`,
};

/**
 * The Battlegrounds tier builder on VaryloUI TierList: the same pools and
 * filters as the classic builder, drag with mouse, touch or keyboard, a
 * browser draft with undo, and PNG/WebP, text and JSON export.
 */
export function BattlegroundTierBuilder({ runtime }: { runtime: ClassicRuntime }) {
  const { pool: loaded, failed } = useTierBuilderPool(runtime);
  const [edited, setPlacement] = useState<TierBuilderPlacement | null>(null);
  // «Все в пул» also lets go of saved cards the current pool cannot show.
  const [carriedCleared, setCarriedCleared] = useState(false);
  const [filters, setFilters] = useState<TierBuilderFilters>(DEFAULT_TIER_BUILDER_FILTERS);
  const [poolLimit, setPoolLimit] = useState(POOL_PAGE);
  const [exportStatus, setExportStatus] = useState('');
  const [exporting, setExporting] = useState<'png' | 'webp' | null>(null);
  const cards = loaded?.cards ?? null;
  const placement = edited ?? loaded?.draft ?? EMPTY_PLACEMENT;
  const ids = useMemo(() => cards?.map(card => card.id) ?? null, [cards]);
  const draft = useTierBuilderDraft(ids, placement, carriedCleared ? EMPTY_PLACEMENT : loaded?.unresolved ?? EMPTY_PLACEMENT);
  const byId = useMemo(() => new Map((cards ?? []).map(card => [card.id, card])), [cards]);
  const placed = useMemo(() => new Set(Object.values(placement).flat()), [placement]);
  const pool = useMemo(() => (cards ?? []).filter(card => !placed.has(card.id) && matchesTierBuilderFilters(card, filters)), [cards, placed, filters]);
  const items = useMemo<TierItem[]>(() => [...[...placed].map(id => byId.get(id)), ...pool.slice(0, poolLimit)]
    .filter((card): card is TierBuilderCard => !!card)
    .map(card => ({ id: card.id, name: card.name, image: tierBuilderCardImage(card), note: tierBuilderCardMeta(card) })),
  [placed, byId, pool, poolLimit]);
  const assigned = placedTierBuilderCount(placement);

  const runExport = async (fileType: 'png' | 'webp', background: TierBuilderBackground) => {
    if (exporting) return;
    setExporting(fileType);
    setExportStatus('Готовлю изображение…');
    try {
      await exportTierBuilderImage({ placement, cards: byId, fileType, background, load: runtime.loadImageFromSource });
      setExportStatus('Файл готов к скачиванию');
    } catch (error) {
      console.warn(error);
      setExportStatus('Не удалось экспортировать изображение. Попробуйте ещё раз.');
    } finally {
      setExporting(null);
    }
  };
  const renderItem = useCallback((item: TierItem) => <>
    <span className="ui-tier-list__portrait bg-tier-builder__portrait" data-source={byId.get(item.id)?.source}>
      <GameImage src={item.image} name={item.name} size={64} />
    </span>
    <span className="ui-tier-list__name">{item.name}</span>
    <span className="ui-sr-only">{`, ${item.note}`}</span>
  </>, [byId]);

  if (failed) return <p className="bg-tier-builder__status" role="alert">Не удалось загрузить библиотеку для конструктора тир-листов.</p>;
  return (
    <div className="bg-tier-builder hp-varylo-parchment" aria-busy={!cards}>
      <TierBuilderFilterPanel filters={filters} onChange={next => { setFilters(next); setPoolLimit(POOL_PAGE); }}
        onClear={() => { setPlacement(EMPTY_PLACEMENT); setCarriedCleared(true); }} assigned={assigned} poolCount={pool.length} loaded={!!cards} />
      <section className="bg-tier-builder__board" aria-label="Рабочая область">
        <TierBuilderToolbar assigned={assigned} exporting={exporting} onExport={(type, background) => void runExport(type, background)}
          canUndo={draft.canUndo} draftStatus={draft.status} exportStatus={exportStatus}
          onUndo={() => { const previous = draft.undo(); if (previous) setPlacement(previous); }} />
        <div className="bg-tier-builder__list">
          {cards
            ? <TierList items={items} tiers={TIERS} value={placement} onValueChange={setPlacement}
              mode="edit" editable={false} size="lg" exportName="tier-list" title="Ваш тир-лист" headingLevel={2}
              caption={<span id="tier-builder-counter" data-tour-id="bg-tier-builder-board">{assigned} {cardsWord(assigned)} в тирах</span>} labels={LABELS} renderItem={renderItem} />
            : <div className="bg-tier-builder__placeholder" aria-hidden="true" />}
        </div>
        {pool.length > poolLimit && (
          <button type="button" className="bg-tier-builder__button bg-tier-builder__more" onClick={() => setPoolLimit(limit => limit + POOL_PAGE)}>
            Показать ещё {Math.min(POOL_PAGE, pool.length - poolLimit)} карт пула
          </button>
        )}
      </section>
    </div>
  );
}

function loadScript(src: string, loaded: HTMLScriptElement[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.bgLegacyOwner = 'tier-builder';
    loaded.push(script);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.body.append(script);
  });
}

/** Loads the classic data runtime once per mount, then the builder; the scripts leave with the page. */
export default function BattlegroundTierBuilderEmbed() {
  const [runtime, setRuntime] = useState<ClassicRuntime | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    battlegroundHeroRosterBridgeV1.install(window, { publicResourceUrl });
    const loaded: HTMLScriptElement[] = [];
    let cancelled = false;
    void RUNTIME_SCRIPTS.reduce<Promise<void>>((chain, name) => chain.then(() => cancelled ? undefined
      : loadScript(`/bg-legacy/${name}?v=${RUNTIME_VERSION}`, loaded)), Promise.resolve())
      .then(() => {
        const shared = Reflect.get(window, 'Shared') as ClassicRuntime | undefined;
        if (cancelled) return;
        if (shared) setRuntime(shared);
        else setFailed(true);
      }, error => {
        console.error('Не удалось запустить конструктор тир-листов.', error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      loaded.forEach(script => script.remove());
    };
  }, []);

  if (failed) return <p className="bg-tier-builder__status" role="alert">Не удалось загрузить конструктор тир-листов. Обновите страницу.</p>;
  return runtime ? <BattlegroundTierBuilder runtime={runtime} /> : <div className="bg-tier-builder__placeholder" aria-hidden="true" />;
}
