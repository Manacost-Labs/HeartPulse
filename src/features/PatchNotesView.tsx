'use client';

import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ScrollText, SearchX } from 'lucide-react';
import {
  PATCH_SECTION_TITLES, filterPatchView, patchHighlights, patchMetaFlow, toPatchView,
  type PatchFilter, type PatchNotesDetail, type PatchNotesMode, type PatchNotesSummary, type PatchView,
} from '../modules/patchNotes/public';
import { useViewerTimeZone } from '../shared/ui/useViewerTimeZone';
import CardPreviewTooltip, { fallbackCardRender, type CardPreviewTarget } from './CardPreviewTooltip';
import type { CardPreviewSheetCard } from './CardPreviewSheet';
import { EAGER_CARDS, previewSource, type CardHandlers } from './patchNotes/PatchCard';
import { PatchHero } from './patchNotes/PatchHero';
import { PatchMetaFlow } from './patchNotes/PatchMetaFlow';
import { PatchBar, VersionSwitcher } from './patchNotes/PatchNotesNavigation';
import { Highlights, PatchSection } from './patchNotes/PatchNotesSections';
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
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  const [opened, setOpened] = useState<CardPreviewSheetCard | null>(null);
  const change = useCallback((next: Partial<PatchFilter>) => setFilter(current => ({ ...current, ...next })), []);
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

  useCardTarget(patch.version);
  const flow = useMemo(() => patchMetaFlow(view), [view]);
  const filtered = filter.kind !== 'all' || filter.group !== 'all' || deferredQuery.trim() !== '';
  // Notes of a mode go under its first section; a mode with notes but no cards gets a section of its own.
  const notesHome = new Map<PatchNotesMode, string>();
  for (const section of view.sections) if (!notesHome.has(section.mode)) notesHome.set(section.mode, section.id);
  const notesOnly = MODES.filter(mode => !notesHome.has(mode)
    && (patch.generalChanges.some(item => item.mode === mode) || patch.pictureSections.some(item => item.mode === mode)));
  let eager = highlights.length && !filtered ? EAGER_CARDS : 0;

  const formatPatchDate = (value: string | null) => formatDate(value, timeZone);

  return (
    <div className="hp-patch">
      <PatchHero patch={patch} view={view} highlights={highlights} date={formatPatchDate(patch.publishedAt)}
        versions={archive.length > 1
          ? <VersionSwitcher patches={archive} current={patch.version} onSelect={onSelectVersion} formatDate={formatPatchDate} />
          : null} />
      {/* One or two changes are read at a glance; a search and filters would outweigh them. */}
      {view.total > 2 && <PatchBar view={view} filter={filter} onChange={change} />}
      {!filtered && (
        <Highlights cards={highlights} handlers={handlers}>
          {patch.meta !== null && flow.links.length >= 2 ? <PatchMetaFlow flow={flow} meta={patch.meta} /> : null}
        </Highlights>
      )}
      <PatchEmptyState total={view.total} matched={groups.length} onReset={() => setFilter(INITIAL_FILTER)} />
      {view.sections.map(section => {
        const sectionGroups = groups.filter(group => group.section === section.id);
        if (!sectionGroups.length && filtered) return null;
        const from = eager;
        eager += sectionGroups.reduce((sum, group) => sum + group.entries.length, 0);
        return (
          <PatchSection key={section.id} section={section} groups={sectionGroups} patch={patch} filtered={filtered}
            notes={notesHome.get(section.mode) === section.id ? section.mode : null} eagerFrom={from} handlers={handlers} />
        );
      })}
      {!filtered && notesOnly.map(mode => (
        <PatchSection key={mode} section={{ id: mode, title: PATCH_SECTION_TITLES[mode], count: 0, kinds: { buff: 0, nerf: 0, rework: 0 } }}
          groups={[]} patch={patch} notes={mode} filtered={false} eagerFrom={EAGER_CARDS} handlers={handlers} />
      ))}
      <SourceFooter patch={patch} view={view} />
      {preview && <CardPreviewTooltip preview={preview} />}
      {opened && (
        <React.Suspense fallback={null}>
          <CardPreviewSheet card={opened} onClose={() => setOpened(null)} />
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

function SourceFooter({ patch, view }: { patch: PatchNotesDetail; view: PatchView }) {
  const cards = view.groups.flatMap(group => group.entries);
  const unmatched = cards.filter(card => !card.cardId).length;
  return (
    <footer className="hp-patch-notes__source">
      <p>
        Источник — статья{' '}
        {patch.sourceUrl ? <a href={patch.sourceUrl} target="_blank" rel="noreferrer">hs-manacost.ru</a> : 'hs-manacost.ru'}.
        {' '}Усиление и ослабление — только по числам; текст и уровень таверны — «Переработка». Картинки — текущие версии карт,
        формат и архетипы — сегодняшние.
      </p>
      {patch.missingBefore > 0 && <p>У {patch.missingBefore} изм. в статье нет прежнего значения — показано только новое.</p>}
      {unmatched > 0 && <p>Без картинки {unmatched} из {cards.length}: их названия не нашлись в каталоге карт.</p>}
    </footer>
  );
}
