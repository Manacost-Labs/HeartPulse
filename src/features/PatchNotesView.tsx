'use client';

import { useEffect, useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  PATCH_SECTION_TITLES, toPatchView,
  type PatchCardView, type PatchNotesContentSection, type PatchNotesDetail, type PatchNotesGeneralChanges,
  type PatchNotesMode, type PatchNotesPoolGroup, type PatchSectionId,
} from '../modules/patchNotes/public';
import { useViewerTimeZone } from '../shared/ui/useViewerTimeZone';
import { PatchChangeCard } from './patchNotes/PatchChangeCard';
import { PatchContentSections } from './patchNotes/PatchContentSections';
import { PatchGeneralChanges } from './patchNotes/PatchGeneralChanges';
import { PatchModeHeading } from './patchNotes/PatchModeHeading';
import { PatchPoolExplorer } from './patchNotes/PatchPoolExplorer';

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** One formatter per time zone: before hydration Europe/Moscow, then the viewer's own (`''`). */
function dateFormat(timeZone = ''): Intl.DateTimeFormat {
  let format = dateFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', ...(timeZone ? { timeZone } : {}) });
    dateFormats.set(timeZone, format);
  }
  return format;
}

function formatDate(value: string | null, timeZone?: string): string | null {
  return value && Number.isFinite(Date.parse(value)) ? dateFormat(timeZone).format(new Date(value)) : null;
}

/** Pictures of the first cards of the page load at once; the rest wait for the scroll. */
const EAGER_CARDS = 4;

/** A `#card-…` link scrolls to its card; the browser does it for server HTML, a patch loaded later needs the nudge. */
function useCardTarget(versions: string) {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id.startsWith('card-')) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [versions]);
}

type Block = {
  id: PatchSectionId;
  mode: PatchNotesMode;
  title: string;
  general: PatchNotesGeneralChanges | null;
  pools: PatchNotesPoolGroup[];
  openSections: PatchNotesContentSection[];
  collapsedSections: PatchNotesContentSection[];
  cards: PatchCardView[];
};

/** The article's "general" and "other" headings of one mode are one list: lines in order, marks moved to their new line numbers. */
function mergeGeneral(groups: PatchNotesGeneralChanges[]): PatchNotesGeneralChanges | null {
  if (groups.length === 0) return null;
  let offset = 0;
  const marks = groups.flatMap(group => {
    const moved = (group.marks ?? []).map(mark => ({ ...mark, line: mark.line + offset }));
    offset += group.lines.length;
    return moved;
  });
  return { mode: groups[0].mode, lines: groups.flatMap(group => group.lines), ...(marks.length ? { marks } : {}) };
}

/**
 * The patch by game mode: open sections, general changes, pool rotations,
 * changed cards, and collapsed-by-default sections. A mode without card diffs
 * still renders when it has general changes, pool rotations or content sections.
 */
function blocksOf(patch: PatchNotesDetail): Block[] {
  const view = toPatchView(patch);
  const generalOf = (mode: PatchNotesMode) => mergeGeneral(patch.generalChanges.filter(item => item.mode === mode));
  const poolsOf = (mode: PatchNotesMode) => (patch.poolChanges ?? []).filter(item => item.mode === mode);
  const sectionsOf = (mode: PatchNotesMode) => (patch.sections ?? []).filter(item => item.mode === mode);
  const placed = new Set<PatchNotesMode>();
  const blocks = view.sections.map((section): Block => {
    const firstOfMode = !placed.has(section.mode);
    placed.add(section.mode);
    const modeSections = firstOfMode ? sectionsOf(section.mode) : [];
    return {
      id: section.id,
      mode: section.mode,
      title: section.title,
      general: firstOfMode ? generalOf(section.mode) : null,
      pools: firstOfMode ? poolsOf(section.mode) : [],
      openSections: modeSections.filter(item => !item.collapsedByDefault),
      collapsedSections: modeSections.filter(item => Boolean(item.collapsedByDefault)),
      cards: view.groups.filter(group => group.section === section.id).flatMap(group => group.entries),
    };
  });
  for (const mode of ['constructed', 'arena', 'battlegrounds', 'other'] as const) {
    if (placed.has(mode)) continue;
    const general = generalOf(mode);
    const pools = poolsOf(mode);
    const modeSections = sectionsOf(mode);
    if (general || pools.length > 0 || modeSections.length > 0) {
      blocks.push({
        id: mode,
        mode,
        title: PATCH_SECTION_TITLES[mode],
        general,
        pools,
        openSections: modeSections.filter(item => !item.collapsedByDefault),
        collapsedSections: modeSections.filter(item => Boolean(item.collapsedByDefault)),
        cards: [],
      });
    }
  }
  return blocks;
}

function PatchRelease({ patch, timeZone, eager }: { patch: PatchNotesDetail; timeZone: string | undefined; eager: boolean }) {
  const blocks = useMemo(() => blocksOf(patch), [patch]);
  const date = formatDate(patch.publishedAt, timeZone);
  const headingId = `hp-patch-${patch.version}`;
  const showSummary = Boolean(patch.summary && (patch.poolChanges?.length || patch.sections?.length));
  let rendered = 0;
  return (
    <section className="hp-release" aria-labelledby={headingId} id={`patch-${patch.version}`}>
      <header className="hp-release__head">
        <h2 id={headingId} className="hp-release__title">{`Патч ${patch.version}`}</h2>
        <p className="hp-release__line">
          {date && <time dateTime={patch.publishedAt ?? undefined}>{date}</time>}
          {patch.sourceUrl && <a href={patch.sourceUrl} target="_blank" rel="noreferrer">hs-manacost.ru <ExternalLink aria-hidden="true" /></a>}
          {patch.officialUrl && <a href={patch.officialUrl} target="_blank" rel="noreferrer">Blizzard <ExternalLink aria-hidden="true" /></a>}
        </p>
        {showSummary && <p className="hp-release__summary">{patch.summary}</p>}
      </header>
      {blocks.length === 0 && (
        <p className="hp-release__empty" role="status">В статье нет изменений карт в виде «было → стало». Полный текст — по ссылке выше.</p>
      )}
      {blocks.map(block => (
        <section key={block.id} className="hp-mode" aria-labelledby={`${headingId}-${block.id}`}>
          <PatchModeHeading id={block.id} headingId={`${headingId}-${block.id}`} title={block.title} />
          {block.openSections.length > 0 && <PatchContentSections sections={block.openSections} />}
          {block.general && <PatchGeneralChanges group={block.general} />}
          {block.pools.length > 0 && <PatchPoolExplorer groups={block.pools} />}
          {block.cards.length > 0 && (
            <>
              {block.pools.length > 0 && <p className="hp-mode__sublabel">{`Изменения карт (${block.cards.length})`}</p>}
              <ul className="hp-pc-grid">
                {block.cards.map(card => <li key={card.id}><PatchChangeCard card={card} eager={eager && rendered++ < EAGER_CARDS} /></li>)}
              </ul>
            </>
          )}
          {block.collapsedSections.length > 0 && <PatchContentSections sections={block.collapsedSections} />}
        </section>
      ))}
    </section>
  );
}

/**
 * The newest patches for reading: each one is its modes, and each changed
 * card is the card before the patch, what changed, and the card after it.
 * Every value comes from the stored article; the pictures from the card history.
 */
export function PatchNotesView({ patches }: { patches: PatchNotesDetail[] }) {
  const timeZone = useViewerTimeZone();
  useCardTarget(patches.map(patch => patch.version).join());
  return (
    <div className="hp-patch">
      <h1 className="hp-patch__title">Патчноуты Hearthstone</h1>
      {patches.map((patch, index) => (
        <PatchRelease key={patch.version} patch={patch} timeZone={timeZone} eager={index === 0} />
      ))}
    </div>
  );
}
