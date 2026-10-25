'use client';

import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ScrollText, SearchX } from 'lucide-react';
import {
  filterPatchView, patchHighlights, patchMetaFlow, patchModePictureNote, toPatchView,
  type PatchFilter, type PatchNotesDetail, type PatchNotesMode, type PatchNotesSummary, type PatchView,
} from '../modules/patchNotes/public';
import { useViewerTimeZone } from '../shared/ui/useViewerTimeZone';
import CardPreviewTooltip, { fallbackCardRender, type CardPreviewTarget } from './CardPreviewTooltip';
import type { CardPreviewSheetCard } from './CardPreviewSheet';
import { EAGER_CARDS, previewSource, type CardHandlers } from './patchNotes/PatchCard';
import { PatchHero } from './patchNotes/PatchHero';
import { PatchMetaFlow } from './patchNotes/PatchMetaFlow';
import { PatchBar, VersionSwitcher } from './patchNotes/PatchNotesNavigation';
import { Highlights, PatchSections, PictureNote } from './patchNotes/PatchNotesSections';
import { PatchToc } from './patchNotes/PatchToc';
import { patchPageNavigation } from './patchNotes/patchTocEntries';
import { registerLightboxModule } from '../shared/ui/lightboxIntent';
import './PatchNotesView.css';
import './patchNotes/PatchNotesShowcase.css';

const loadCardPreviewSheet = () => import('./CardPreviewSheet');
const CardPreviewSheet = React.lazy(loadCardPreviewSheet);
// The sheet's chunk downloads at idle, and at the latest on a hover, focus or touch (lightboxIntent).
registerLightboxModule('card-preview', loadCardPreviewSheet, { idle: true });

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** One formatter per time zone: before hydration Europe/Moscow, then the viewer's own (`''`). */
function dateFormat(timeZone = ''): Intl.DateTimeFormat {
  let format = dateFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', ...(timeZone ? { timeZone } : {}) });
    dateFormats.set(timeZone, format);
  }
  return format;
}

function formatDate(value: string | null, timeZone?: string): string | null {
  return value && Number.isFinite(Date.parse(value)) ? dateFormat(timeZone).format(new Date(value)) : null;
}

const INITIAL_FILTER: PatchFilter = { section: 'all', kind: 'all', group: 'all', query: '' };
const MODES: PatchNotesMode[] = ['constructed', 'arena', 'battlegrounds', 'other'];

/**
 * A `#card-…` link opens its section and scrolls to the card. The browser does
 * this for server-rendered HTML; a patch loaded in the browser needs the nudge.
 */
function useCardTarget(version: string) {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id.startsWith('card-')) return;
    const target = document.getElementById(id);
    const details = target?.closest('details');
    if (details) details.open = true;
    target?.scrollIntoView({ block: 'start' });
  }, [version]);
}

/**
 * Notes of a mode go under its first section. A mode without cards gets a section only for its general
 * changes; one with nothing but pictures is a line of the source note, not a banner over a single sentence.
 */
function notesPlacement(patch: PatchNotesDetail, view: PatchView) {
  const notesHome = new Map<PatchNotesMode, string>();
  for (const section of view.sections) if (!notesHome.has(section.mode)) notesHome.set(section.mode, section.id);
  const cardless = MODES.filter(mode => !notesHome.has(mode));
  const withGeneral = new Set(patch.generalChanges.map(item => item.mode));
  const notesOnly = cardless.filter(mode => withGeneral.has(mode));
  const picturesOnly = cardless.filter(mode => !withGeneral.has(mode))
    .map(mode => ({ mode, note: patchModePictureNote(patch.pictureSections, mode, false) }))
    .filter((item): item is { mode: PatchNotesMode; note: string } => item.note !== null);
  return { notesHome, notesOnly, picturesOnly };
}

/** Hover or focus shows the current card beside its render; a tap or click opens it in a sheet. */
function useCardPreview() {
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  const [opened, setOpened] = useState<CardPreviewSheetCard | null>(null);
  const handlers = useMemo<CardHandlers>(() => ({
    onPreview: (card, target) => {
      // Touch taps open the sheet; a hover card would cover it.
      if (!card.cardId || window.matchMedia?.('(hover: none)').matches) return;
      setPreview({ id: card.cardId, name: `${card.name} — текущая версия`, imageUrl: previewSource(card) || null, rect: target.getBoundingClientRect() });
    },
    onPreviewEnd: () => setPreview(null),
    onOpen: card => {
      if (card.cardId) setOpened({ id: card.cardId, name: card.name, imageUrl: previewSource(card) || fallbackCardRender(card.cardId) });
    },
  }), []);

  return { handlers, preview, opened, close: useCallback(() => setOpened(null), []) };
}

function defaultSelectVersion(href: string) {
  window.location.assign(href);
}

/**
 * One patch for reading, one way to do each thing: the header with the
 * version switcher, one sticky bar of modes, search and filters, what matters
 * first, then collapsible sections by mode grouped by class or card type.
 * Every value comes from the stored article; what it does not state is said.
 */
export function PatchNotesView({ patch, archive, onSelectVersion = defaultSelectVersion }: {
  patch: PatchNotesDetail; archive: PatchNotesSummary[]; onSelectVersion?: (href: string) => void;
}) {
  const timeZone = useViewerTimeZone();
  const view = useMemo(() => toPatchView(patch), [patch]);
  const highlights = useMemo(() => patchHighlights(view), [view]);
  const [filter, setFilter] = useState<PatchFilter>(INITIAL_FILTER);
  const deferredQuery = useDeferredValue(filter.query);
  const groups = useMemo(() => filterPatchView(view, { ...filter, query: deferredQuery }), [view, filter, deferredQuery]);
  const change = useCallback((next: Partial<PatchFilter>) => setFilter(current => ({ ...current, ...next })), []);
  const { handlers, preview, opened, close } = useCardPreview();
  useCardTarget(patch.version);
  const flow = useMemo(() => patchMetaFlow(view), [view]);
  const filtered = filter.kind !== 'all' || filter.group !== 'all' || deferredQuery.trim() !== '';
  const meta = patch.meta !== null && flow.links.length >= 2 ? patch.meta : null;
  const { notesHome, notesOnly, picturesOnly } = notesPlacement(patch, view);
  const { showHighlights, archetypes, toc } = patchPageNavigation({
    filtered, highlights: highlights.length >= 2, archetypes: meta,
    sections: view.sections, groups, notesOnly,
  });

  const formatPatchDate = (value: string | null) => formatDate(value, timeZone);

  return (
    <div className="hp-patch">
      <PatchHero patch={patch} view={view} highlights={highlights} date={formatPatchDate(patch.publishedAt)}
        versions={archive.length > 1
          ? <VersionSwitcher patches={archive} current={patch.version} onSelect={onSelectVersion} formatDate={formatPatchDate} />
          : null} />
      <div className="hp-patch-layout" data-toc={toc ? '' : undefined}>
        <div className="hp-patch-main">
          {/* One or two changes are read at a glance; a search and filters would outweigh them. */}
          {view.total > 2 && <PatchBar view={view} filter={filter} onChange={change} toc={toc} />}
          {showHighlights && <Highlights cards={highlights} handlers={handlers} />}
          {archetypes && <PatchMetaFlow flow={flow} meta={archetypes} />}
          <PatchEmptyState total={view.total} matched={groups.length} onReset={() => setFilter(INITIAL_FILTER)} />
          <PatchSections view={view} groups={groups} patch={patch} filtered={filtered} notesHome={notesHome} notesOnly={notesOnly}
            eagerFrom={showHighlights ? EAGER_CARDS : 0} handlers={handlers} />
          <SourceFooter patch={patch} view={view} pictures={filtered ? [] : picturesOnly} />
        </div>
        {toc && <PatchToc entries={toc} />}
      </div>
      {preview && <CardPreviewTooltip preview={preview} />}
      {opened && (
        <React.Suspense fallback={null}>
          <CardPreviewSheet card={opened} onClose={close} />
        </React.Suspense>
      )}
    </div>
  );
}

/** A patch the article lists no line-by-line changes for, or filters that leave nothing. */
function PatchEmptyState({ total, matched, onReset }: { total: number; matched: number; onReset: () => void }) {
  if (total === 0) {
    return (
      <div className="hp-patch-blank" role="status">
        <ScrollText aria-hidden="true" />
        <p>
          <b>Изменения карт этого патча не расписаны построчно.</b>
          {' '}В статье нет пар «было → стало», поэтому карточек здесь нет. Полный текст — по ссылкам в шапке.
        </p>
      </div>
    );
  }
  if (matched > 0) return null;
  return (
    <div className="hp-patch-empty" role="status">
      <SearchX aria-hidden="true" />
      <p>Под эти фильтры не попало ни одно изменение.</p>
      <button type="button" className="hp-patch-reset" onClick={onReset}>Сбросить фильтры</button>
    </div>
  );
}

function SourceFooter({ patch, view, pictures }: {
  patch: PatchNotesDetail; view: PatchView; pictures: { mode: PatchNotesMode; note: string }[];
}) {
  const cards = view.groups.flatMap(group => group.entries);
  const unmatched = cards.filter(card => !card.cardId).length;
  return (
    <footer className="hp-patch-notes__source">
      {pictures.map(item => <PictureNote key={item.mode} patch={patch} note={item.note} />)}
      <p>
        Источник — статья{' '}
        {patch.sourceUrl ? <a href={patch.sourceUrl} target="_blank" rel="noreferrer">hs-manacost.ru</a> : 'hs-manacost.ru'}.
        {' '}Усиление и ослабление — только по числам; текст и уровень таверны — «Переработка». Картинки — текущие версии карт,
        формат — сегодняшний{patch.meta ? ', архетипы — на день до выхода патча' : ''}.
      </p>
      {patch.missingBefore > 0 && <p>У {patch.missingBefore} изм. в статье нет прежнего значения — показано только новое.</p>}
      {unmatched > 0 && <p>Без картинки {unmatched} из {cards.length}: их названия не нашлись в каталоге карт.</p>}
    </footer>
  );
}
