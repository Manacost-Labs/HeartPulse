'use client';

import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  PATCH_SECTION_TITLES, filterPatchView, patchHighlights, toPatchView,
  type PatchFilter, type PatchNotesDetail, type PatchNotesMode, type PatchNotesSummary, type PatchView,
} from '../modules/patchNotes/public';
import { useViewerTimeZone } from '../shared/ui/useViewerTimeZone';
import CardPreviewTooltip, { fallbackCardRender, type CardPreviewTarget } from './CardPreviewTooltip';
import type { CardPreviewSheetCard } from './CardPreviewSheet';
import { EAGER_CARDS, KINDS, KIND_LABELS, previewSource, type CardHandlers } from './patchNotes/PatchCard';
import { Contents, Toolbar, VersionSwitcher } from './patchNotes/PatchNotesNavigation';
import { Highlights, PatchSection } from './patchNotes/PatchNotesSections';
import './PatchNotesView.css';

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

function PatchHeader({ patch, view, timeZone }: { patch: PatchNotesDetail; view: PatchView; timeZone?: string }) {
  const date = formatDate(patch.publishedAt, timeZone);
  return (
    <header className="hp-patch-hero">
      <p className="hp-patch-hero__eyebrow">
        <span>Патч {patch.version}</span>
        {date && <time dateTime={patch.publishedAt ?? undefined}>{date}</time>}
      </p>
      <h2 className="hp-patch-hero__title">{patch.title}</h2>
      {patch.summary && <p className="hp-patch-hero__lead">{patch.summary}</p>}
      {view.total > 0 && (
        <dl className="hp-patch-hero__stats">
          <div><dt>Изменений карт</dt><dd>{view.total}</dd></div>
          {KINDS.map(kind => (
            <div key={kind} data-kind={kind}><dt>{KIND_LABELS[kind].many}</dt><dd>{view.kinds[kind]}</dd></div>
          ))}
        </dl>
      )}
      {(patch.officialUrl || patch.sourceUrl) && (
        <p className="hp-patch-hero__links">
          {patch.officialUrl && <a href={patch.officialUrl} target="_blank" rel="noreferrer">Официальный патчноут Blizzard <ExternalLink aria-hidden="true" /></a>}
          {patch.sourceUrl && <a href={patch.sourceUrl} target="_blank" rel="noreferrer">Статья на hs-manacost.ru <ExternalLink aria-hidden="true" /></a>}
        </p>
      )}
    </header>
  );
}

const INITIAL_FILTER: PatchFilter = { section: 'all', kind: 'all', group: 'all', query: '' };
const MODES: PatchNotesMode[] = ['constructed', 'arena', 'battlegrounds', 'other'];

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
          <PatchHeader patch={patch} view={view} {...(timeZone ? { timeZone } : {})} />
          {!filtered && <Highlights cards={highlights} handlers={handlers} />}
          {view.sections.length > 0 && <Contents view={view} className="hp-patch-toc--inline" />}
          {view.total > 0 && <Toolbar view={view} filter={filter} onChange={change} />}
          {view.total === 0 && (
            <p className="hp-patch-notes__notice" role="status">
              В статье этого патча нет построчных изменений карт «было → стало». Полный текст — по ссылкам выше.
            </p>
          )}
          {view.total > 0 && groups.length === 0 && (
            <p className="hp-patch-notes__notice" role="status">
              Нет изменений по выбранным фильтрам.{' '}
              <button type="button" className="hp-patch-reset" onClick={() => setFilter(INITIAL_FILTER)}>Сбросить фильтры</button>
            </p>
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
        в зачёркнутых значениях и словах. Формат (Стандарт или Вольный) — сегодняшний.
      </p>
      {patch.missingBefore > 0 && <p>У {patch.missingBefore} изм. в статье нет прежнего значения — показано только новое.</p>}
      {unmatched > 0 && <p>Без картинки {unmatched} из {cards.length}: их названия не нашлись в каталоге карт.</p>}
    </footer>
  );
}
