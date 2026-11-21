import React, { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import DeckListView, {
  type DeckListCard,
  type DeckListSideboard,
} from './decklist/DeckListView';
import DeckRenderPreview, { type DeckRenderState } from './deckrender/DeckRenderPreview';
import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './ConstructedArchetypeDeckGallery.css';
import { usePendingDecks, useReportedPending } from './archetypeDeckGalleryPending';
import { DeckCodeLine } from './deckViews/deckViewParts';
import { DeckLayoutSwitch, useDeckLayout } from './deckViews/DeckLayoutSwitch';
import { pluralRu } from './deckViews/deckClass';
import type { OpenBuildSeed } from './archetypeOpenBuilds';
import { seededDeck } from './deckViews/seededDeck';
import { ArchetypeBuildView, GALLERY_CLASS, formatNumber, formatPercent, type ArchetypeBuild, type ArchetypeFormat } from './archetypeBuildViews';


type ResolvedDeck = {
  ok: boolean;
  format: ArchetypeFormat;
  deckCode: string;
  cards: DeckListCard[];
  sideboards: DeckListSideboard[];
  totalCards: number;
  deckSizeLimit: 30 | 40;
};

const CLASS_COLORS: Record<string, string> = {
  deathknight: '#397b87',
  demonhunter: '#556d24',
  druid: '#8b4d25',
  hunter: '#3f792f',
  mage: '#326c97',
  paladin: '#a77816',
  priest: '#6e6862',
  rogue: '#55545b',
  shaman: '#345aa0',
  warlock: '#694477',
  warrior: '#8e342f',
};

async function resolveDeck(
  build: ArchetypeBuild,
  format: ArchetypeFormat,
  archetype: string,
  signal: AbortSignal,
): Promise<ResolvedDeck> {
  const query = new URLSearchParams({
    code: build.deckCode,
    format,
    archetype,
  });
  const response = await fetch(`/api/deck/resolve?${query}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Не удалось разобрать состав колоды');
  }
  return payload as ResolvedDeck;
}

function DeckBuildCard({
  build,
  index,
  format,
  archetype, archetypeLabel = archetype,
  classKey,
  seed,
  full, openOnly,
  onPendingChange,
}: {
  key?: React.Key;
  build: ArchetypeBuild;
  index: number;
  format: ArchetypeFormat;
  archetype: string; archetypeLabel?: string;
  classKey: string | null;
  seed?: OpenBuildSeed | null;
  full?: boolean; openOnly?: boolean;
  onPendingChange: (deckCode: string, pending: boolean) => void;
}) {
  const [read, setDeck] = useState<ResolvedDeck | null>(null);
  const seeded = useMemo(() => (seed || openOnly ? seededDeck(build.deckCode, format, seed?.cards ?? [], seed?.sideboards) : null), [build.deckCode, format, seed, openOnly]);
  const deck = full ? read : seeded ?? read; // in the render that drops `full` (access lost): no full list for one frame
  const [error, setError] = useState('');
  const [renderState, setRenderState] = useState<DeckRenderState>('idle');
  useReportedPending(build.deckCode, renderState === 'loading' || (renderState === 'error' && !deck && !error), onPendingChange);
  const [revision, setRevision] = useState(0);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle');
  const classColor = CLASS_COLORS[classKey || ''] || '#67131c';
  const copyLabel = { ok: 'Код скопирован', error: 'Не удалось скопировать', idle: 'Скопировать код колоды' }[copyState];
  useEffect(() => {
    const controller = new AbortController();
    setDeck(seed ? seededDeck(build.deckCode, format, seed.cards, seed.sideboards) : null);
    setError('');
    if ((seed && !full) || openOnly) return undefined;
    void resolveDeck(build, format, archetype, controller.signal)
      .then(setDeck)
      .catch(cause => {
        if (!seed && !(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'Не удалось разобрать состав колоды');
        }
      });
    return () => controller.abort();
  }, [archetype, build, format, revision, seed, full, openOnly]);

  useEffect(() => {
    if (copyState === 'idle') return undefined;
    const timeout = window.setTimeout(() => setCopyState('idle'), copyState === 'ok' ? 1600 : 2000);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  const copyDeckCode = async () => {
    try {
      await navigator.clipboard.writeText(build.deckCode);
      setCopyState('ok');
    } catch {
      setCopyState('error');
    }
  };

  return (
    <article className="archetype-deck-card">
      <header className="archetype-deck-card__summary">
        <span className="archetype-deck-card__number">#{index + 1}</span>
        <dl>
          <div>
            <dt>Игры</dt>
            <dd>{formatNumber(build.games)}</dd>
          </div>
          <div>
            <dt>Винрейт</dt>
            <dd>{formatPercent(build.winrate)}</dd>
          </div>
        </dl>
      </header>

      <DeckRenderPreview deckCode={build.deckCode} deckName={`${archetypeLabel} — сборка ${index + 1}`} onRenderStateChange={setRenderState}>
        {deck ? (
          <DeckListView
            cards={deck.cards}
            sideboards={deck.sideboards}
            title={`Сборка ${index + 1}`}
            subtitle={format === 'wild' ? 'Вольный формат' : 'Стандарт'}
            headerColor={classColor}
            totalCards={deck.totalCards}
            deckSizeLimit={deck.deckSizeLimit}
            deckCode={build.deckCode}
            previewRows={5}
            emptyText="Состав этой сборки пока недоступен."
          />
        ) : error ? (
          <div className="archetype-deck-card__state archetype-deck-card__state--error" role="alert">
            <TriangleAlert aria-hidden="true" />
            <strong>Состав не загрузился</strong>
            <span>{error}</span>
            <button type="button" onClick={() => setRevision(value => value + 1)}>
              <RefreshCw aria-hidden="true" />
              Повторить
            </button>
          </div>
        ) : (
          <div className="archetype-deck-card__state" aria-hidden="true">
            {Array.from({ length: 5 }, (_, row) => <LoadingBlock key={row} className="archetype-deck-card__skeleton" />)}
          </div>
        )}
      </DeckRenderPreview>

      <DeckCodeLine deckCode={build.deckCode} />
      <button
        type="button"
        className={`archetype-deck-card__copy${copyState === 'ok' ? ' is-copied' : ''}`}
        aria-label={`${copyLabel}: сборка ${index + 1}`}
        onClick={() => void copyDeckCode()}
      >
        <Copy aria-hidden="true" />
        <span aria-live="polite">{copyLabel}</span>
      </button>
    </article>
  );
}

export default function ConstructedArchetypeDeckGallery({
  builds,
  format,
  archetype,
  archetypeLabel,
  classKey,
  seeds,
  full = false,
  openOnly = false,
}: {
  builds: ArchetypeBuild[];
  format: ArchetypeFormat;
  /** HSGuru's name resolves the decks; the Russian label titles their images. */
  archetype: string;
  archetypeLabel?: string;
  classKey: string | null;
  /** Card lists and sideboards the page already holds, by deck code (the open builds): those decks are not requested. */
  seeds?: ReadonlyMap<string, OpenBuildSeed>;
  /** A subscriber's gallery: the seeds stand in only until each full deck list is read. */
  full?: boolean;
  /** A guest's archetype gallery: only the seeds are shown, nothing is read (a build without one shows its list as unavailable). */
  openOnly?: boolean;
}) {
  const [pendingDecks, setDeckPending] = usePendingDecks();
  const [layout, setLayout] = useDeckLayout();
  // The gallery owns one status while any card shows a placeholder; the cards'
  // placeholders are plain blocks. It sits outside the grid so card order and
  // nth-child positions do not change.
  return (
    <>
      {pendingDecks.size > 0 ? <LoadingSurface label="Загружаем сборки" quiet layout="rows" className="sr-only"><></></LoadingSurface> : null}
      <div className="fun-decks-layout-bar archetype-deck-gallery__bar">
        <p>{builds.length} {pluralRu(builds.length, ['сборка', 'сборки', 'сборок'])}</p>
        <DeckLayoutSwitch layout={layout} onChange={setLayout} />
      </div>
      <div className={GALLERY_CLASS[layout]}>
        {builds.map((build, index) => layout !== 'images' ? (
          <ArchetypeBuildView key={build.deckCode} build={build} index={index} format={format} archetype={archetype}
            classKey={classKey} layout={layout} seed={seeds?.get(build.deckCode)} full={full} openOnly={openOnly} onPendingChange={setDeckPending} />
        ) : (
          <DeckBuildCard
            key={build.deckCode}
            build={build}
            index={index}
            format={format}
            archetype={archetype}
            archetypeLabel={archetypeLabel}
            classKey={classKey}
            seed={seeds?.get(build.deckCode)}
            full={full}
            openOnly={openOnly}
            onPendingChange={setDeckPending}
          />
        ))}
      </div>
    </>
  );
}
