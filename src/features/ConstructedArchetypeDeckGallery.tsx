import React, { useEffect, useState } from 'react';
import {
  ExternalLink,
  LayoutGrid,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import DeckListView, {
  type DeckListCard,
  type DeckListSideboard,
} from './decklist/DeckListView';
import DeckRenderPreview from './deckrender/DeckRenderPreview';

type ArchetypeFormat = 'standard' | 'wild';

type ArchetypeBuild = {
  deckCode: string;
  games: number | null;
  winrate: number | null;
  sourceUrl: string;
  updatedAt: string | null;
  sampleRank: string;
  samplePeriod: string;
};

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

function formatNumber(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? '—'
    : Math.round(value).toLocaleString('ru-RU');
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? '—'
    : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

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
  archetype,
  classKey,
}: {
  key?: React.Key;
  build: ArchetypeBuild;
  index: number;
  format: ArchetypeFormat;
  archetype: string;
  classKey: string | null;
}) {
  const [deck, setDeck] = useState<ResolvedDeck | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const classColor = CLASS_COLORS[classKey || ''] || '#67131c';
  const builderHref = `/deck-builder?format=${format}&code=${encodeURIComponent(build.deckCode)}`;

  useEffect(() => {
    const controller = new AbortController();
    setDeck(null);
    setError('');
    void resolveDeck(build, format, archetype, controller.signal)
      .then(setDeck)
      .catch(cause => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'Не удалось разобрать состав колоды');
        }
      });
    return () => controller.abort();
  }, [archetype, build, format, revision]);

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

      <DeckRenderPreview deckCode={build.deckCode} deckName={`${archetype} — сборка ${index + 1}`}>
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
            showCopy
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
          <div className="archetype-deck-card__state" aria-busy="true" aria-label={`Загружается сборка ${index + 1}`}>
            <span className="archetype-deck-card__skeleton" />
            <span className="archetype-deck-card__skeleton" />
            <span className="archetype-deck-card__skeleton" />
            <span className="archetype-deck-card__skeleton" />
            <span className="archetype-deck-card__skeleton" />
          </div>
        )}
      </DeckRenderPreview>

      <footer className="archetype-deck-card__actions">
        <a className="archetype-deck-card__builder" href={builderHref}>
          <LayoutGrid aria-hidden="true" />
          Открыть в конструкторе
        </a>
        {build.sourceUrl ? (
          <a
            className="archetype-deck-card__source"
            href={build.sourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Открыть сборку ${index + 1} на HSGuru`}
          >
            HSGuru
            <ExternalLink aria-hidden="true" />
          </a>
        ) : null}
      </footer>
    </article>
  );
}

export default function ConstructedArchetypeDeckGallery({
  builds,
  format,
  archetype,
  classKey,
}: {
  builds: ArchetypeBuild[];
  format: ArchetypeFormat;
  archetype: string;
  classKey: string | null;
}) {
  return (
    <div className="archetype-deck-gallery">
      {builds.map((build, index) => (
        <DeckBuildCard
          key={build.deckCode}
          build={build}
          index={index}
          format={format}
          archetype={archetype}
          classKey={classKey}
        />
      ))}
    </div>
  );
}
