'use client';

import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ScrollText, SearchX } from 'lucide-react';
import {
  PATCH_SECTION_TITLES, filterPatchView, patchHighlights, toPatchView,
  type PatchFilter, type PatchNotesDetail, type PatchNotesMode, type PatchNotesSummary, type PatchView,
} from '../modules/patchNotes/public';
import { useViewerTimeZone } from '../shared/ui/useViewerTimeZone';
import CardPreviewTooltip, { fallbackCardRender, type CardPreviewTarget } from './CardPreviewTooltip';
import type { CardPreviewSheetCard } from './CardPreviewSheet';
import { EAGER_CARDS, previewSource, type CardHandlers } from './patchNotes/PatchCard';
import { PatchArchive } from './patchNotes/PatchArchive';
import { PatchHero } from './patchNotes/PatchHero';
import { AffectedArchetypes, GroupStrip } from './patchNotes/PatchMetaImpact';
import { PatchMetaFlow } from './patchNotes/PatchMetaFlow';
import { PatchModeTiles } from './patchNotes/PatchModeTiles';
import { Contents, PatchPager, Toolbar, VersionSwitcher } from './patchNotes/PatchNotesNavigation';
import { Highlights, PatchSection } from './patchNotes/PatchNotesSections';
import './PatchNotesView.css';
import './patchNotes/PatchNotesShowcase.css';

const CardPreviewSheet = React.lazy(() => import('./CardPreviewSheet'));

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
 * One patch for reading: what matters first, then collapsible sections by
 * mode grouped by class or card type, with search, buff/nerf filters, a
 * sticky table of contents and a compact version switcher. Every value comes
 * from the stored article; what it does not state is said.
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
  const showAffected = patch.meta !== null && view.groups.some(group => group.section !== 'battlegrounds' && group.section !== 'arena');
  const filtered = filter.kind !== 'all' || filter.group !== 'all' || deferredQuery.trim() !== '';
  // Notes of a mode go under its first section; a mode with notes but no cards gets a section of its own.
  const notesHome = new Map<PatchNotesMode, string>();
  for (const section of view.sections) if (!notesHome.has(section.mode)) notesHome.set(section.mode, section.id);
  const notesOnly = MODES.filter(mode => !notesHome.has(mode)
    && (patch.generalChanges.some(item => item.mode === mode) || patch.pictureSections.some(item => item.mode === mode)));
  let eager = highlights.length && !filtered ? EAGER_CARDS : 0;

  return (
    <div className="hp-patch">
      <div className="hp-patch__layout">
        <div className="hp-patch__main">
          {archive.length > 1 && <VersionSwitcher patches={archive} current={patch.version} onSelect={onSelectVersion} className="hp-patch-versions--top" />}
          <PatchHero patch={patch} view={view} highlights={highlights} date={formatDate(patch.publishedAt, timeZone)} />
          <PatchModeTiles view={view} />
          {!filtered && (
            <Highlights cards={highlights} handlers={handlers}>
              {showAffected ? <><AffectedArchetypes view={view} meta={patch.meta} /><PatchMetaFlow view={view} /></> : null}
            </Highlights>
          )}
          <GroupStrip view={view} filter={filter} onChange={change} />
          {view.total > 0 && <Toolbar view={view} filter={filter} version={patch.version} onChange={change} />}
          {view.total === 0 && (
            <div className="hp-patch-blank" role="status">
              <ScrollText aria-hidden="true" />
              <p>
                <b>Изменения карт этого патча не расписаны построчно.</b>
                {' '}В статье нет пар «было → стало», поэтому карточек здесь нет. Полный текст — по ссылкам в шапке.
              </p>
            </div>
          )}
          {view.total > 0 && groups.length === 0 && (
            <div className="hp-patch-empty" role="status">
              <SearchX aria-hidden="true" />
              <p>Под эти фильтры не попало ни одно изменение.</p>
              <button type="button" className="hp-patch-reset" onClick={() => setFilter(INITIAL_FILTER)}>Сбросить фильтры</button>
            </div>
          )}
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
          <PatchArchive patches={archive} current={patch.version} formatDate={value => formatDate(value, timeZone)} />
          <PatchPager patches={archive} current={patch.version} />
          <SourceFooter patch={patch} view={view} />
        </div>
        <aside className="hp-patch-aside">
          {archive.length > 1 && <VersionSwitcher patches={archive} current={patch.version} onSelect={onSelectVersion} className="hp-patch-versions--aside" />}
          {view.sections.length > 0 && <Contents view={view} className="hp-patch-toc--aside" />}
        </aside>
      </div>
      {preview && <CardPreviewTooltip preview={preview} />}
      {opened && (
        <React.Suspense fallback={null}>
          <CardPreviewSheet card={opened} onClose={() => setOpened(null)} />
        </React.Suspense>
      )}
    </div>
  );
}

function SourceFooter({ patch, view }: { patch: PatchNotesDetail; view: PatchView }) {
  const cards = view.groups.flatMap(group => group.entries);
  const unmatched = cards.filter(card => !card.cardId).length;
  return (
    <footer className="hp-patch-notes__source">
      <p>
        Изменения взяты из статьи{' '}
        {patch.sourceUrl ? <a href={patch.sourceUrl} target="_blank" rel="noreferrer">hs-manacost.ru</a> : 'hs-manacost.ru'}.
        {' '}Усиление или ослабление указано только для чисел: стоимости, атаки, здоровья и брони. Изменения текста и уровня таверны
        отмечены как «Изменение». Картинки показывают текущую версию карты: изображений карт до патча нет, прежнее состояние —
        в зачёркнутых значениях и словах. Формат (Стандарт или Вольный) и архетипы, которые играют карту, — сегодняшние.
      </p>
      {patch.missingBefore > 0 && <p>У {patch.missingBefore} изм. в статье нет прежнего значения — показано только новое.</p>}
      {unmatched > 0 && <p>Без картинки {unmatched} из {cards.length}: их названия не нашлись в каталоге карт.</p>}
    </footer>
  );
}
