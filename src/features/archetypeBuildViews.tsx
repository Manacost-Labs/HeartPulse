import type React from 'react';
import { useReportedPending } from './archetypeDeckGalleryPending';
import type { DeckLayout } from './deckViews/DeckLayoutSwitch';
import { DeckRowCard, DeckTileCard, useDeckView, winRateTone, type DeckViewCardProps } from './deckViews/DeckViewCards';
import { deckClassMeta } from './deckViews/deckClass';

export type ArchetypeFormat = 'standard' | 'wild';

export type ArchetypeBuild = {
  deckCode: string;
  games: number | null;
  winrate: number | null;
  sourceUrl: string;
  updatedAt: string | null;
  sampleRank: string;
  samplePeriod: string;
};

export function formatNumber(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? '—'
    : Math.round(value).toLocaleString('ru-RU');
}

export function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? '—'
    : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

/** A build in the tile or row view; it reports itself pending until its list arrives. */
export function ArchetypeBuildView({ build, index, format, archetype, classKey, layout, onPendingChange }: {
  key?: React.Key;
  build: ArchetypeBuild;
  index: number;
  format: ArchetypeFormat;
  archetype: string;
  classKey: string | null;
  layout: Exclude<DeckLayout, 'images'>;
  onPendingChange: (deckCode: string, pending: boolean) => void;
}) {
  const view = useDeckView(build.deckCode, { format, archetype });
  // A build below the screen waits for the reader; it is pending only once it starts loading.
  useReportedPending(build.deckCode, view.near && !view.data && !view.error, onPendingChange);
  const classMeta = deckClassMeta(classKey);
  const props: DeckViewCardProps = {
    deckCode: build.deckCode,
    title: `Сборка ${index + 1}`,
    subtitle: `${classMeta.label} · ${format === 'wild' ? 'Вольный' : 'Стандарт'}`,
    icon: classMeta.icon,
    stats: [
      { label: 'Игры', value: formatNumber(build.games) },
      { label: 'Винрейт', value: formatPercent(build.winrate), tone: winRateTone(build.winrate) },
    ],
    view,
    heading: 'h3',
  };
  return layout === 'tiles' ? <DeckTileCard {...props} /> : <DeckRowCard {...props} />;
}

export const GALLERY_CLASS: Record<DeckLayout, string> = {
  tiles: 'fun-decks-tiles-grid archetype-deck-gallery--views',
  rows: 'fun-decks-rows archetype-deck-gallery--views',
  images: 'archetype-deck-gallery',
};
