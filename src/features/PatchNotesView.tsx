'use client';

import { useEffect, useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  PATCH_SECTION_TITLES, patchHeadline, patchModePictureNote, toPatchView,
  type PatchCardView, type PatchNotesDetail, type PatchNotesMode, type PatchSectionId,
} from '../modules/patchNotes/public';
import { pluralRu } from '../shared/text/pluralRu';
import { useViewerTimeZone } from '../shared/ui/useViewerTimeZone';
import { PatchChangeCard } from './patchNotes/PatchChangeCard';

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

type Block = { id: PatchSectionId; mode: PatchNotesMode; title: string; general: string[]; cards: PatchCardView[] };

/**
 * The patch by game mode: its general changes as a plain list, then its cards.
 * A mode's general changes sit under its first section; a mode that has only
 * general changes gets a section of its own.
 */
function blocksOf(patch: PatchNotesDetail): Block[] {
  const view = toPatchView(patch);
  const generalOf = (mode: PatchNotesMode) => patch.generalChanges.filter(item => item.mode === mode).flatMap(item => item.lines);
  const placed = new Set<PatchNotesMode>();
  const blocks = view.sections.map((section): Block => {
    const general = placed.has(section.mode) ? [] : generalOf(section.mode);
    placed.add(section.mode);
    return {
      id: section.id, mode: section.mode, title: section.title, general,
      cards: view.groups.filter(group => group.section === section.id).flatMap(group => group.entries),
    };
  });
  for (const mode of ['constructed', 'arena', 'battlegrounds', 'other'] as const) {
    if (!placed.has(mode) && generalOf(mode).length) {
      blocks.push({ id: mode, mode, title: PATCH_SECTION_TITLES[mode], general: generalOf(mode), cards: [] });
    }
  }
  return blocks;
}

/** Headings the article shows only as pictures, named once in a quiet line. */
function pictureNote(patch: PatchNotesDetail): string | null {
  const modes = ['constructed', 'arena', 'battlegrounds', 'other'] as const;
  const notes = modes.map(mode => patchModePictureNote(patch.pictureSections, mode, true)).filter((note): note is string => note !== null);
  return notes.length ? notes.join('; ') : null;
}

function PatchRelease({ patch, timeZone, eager }: { patch: PatchNotesDetail; timeZone: string | undefined; eager: boolean }) {
  const blocks = useMemo(() => blocksOf(patch), [patch]);
  const date = formatDate(patch.publishedAt, timeZone);
  const headline = patchHeadline(patch.title);
  const note = pictureNote(patch);
  const headingId = `hp-patch-${patch.version}`;
  let rendered = 0;
  return (
    <section className="hp-release" aria-labelledby={headingId} id={`patch-${patch.version}`}>
      <header className="hp-release__head">
        <h2 id={headingId} className="hp-release__title">{`Патч ${patch.version}`}</h2>
        <p className="hp-release__line">
          {date && <time dateTime={patch.publishedAt ?? undefined}>{date}</time>}
          {patch.changeCount > 0 && <span>{patch.changeCount} {pluralRu(patch.changeCount, 'изменение', 'изменения', 'изменений')}</span>}
          {patch.sourceUrl && <a href={patch.sourceUrl} target="_blank" rel="noreferrer">Статья hs-manacost.ru <ExternalLink aria-hidden="true" /></a>}
          {patch.officialUrl && <a href={patch.officialUrl} target="_blank" rel="noreferrer">Патчноут Blizzard <ExternalLink aria-hidden="true" /></a>}
        </p>
        {headline && headline !== `Патч ${patch.version}` && <p className="hp-release__lead">{headline}</p>}
      </header>
      {blocks.length === 0 && (
        <p className="hp-release__empty" role="status">В статье нет изменений карт в виде «было → стало». Полный текст — по ссылке выше.</p>
      )}
      {blocks.map(block => (
        <section key={block.id} className="hp-mode" aria-labelledby={`${headingId}-${block.id}`}>
          <h3 id={`${headingId}-${block.id}`} className="hp-mode__title">{block.title}</h3>
          {block.general.length > 0 && (
            <ul className="hp-mode__general" aria-label="Общие изменения">{block.general.map(line => <li key={line}>{line}</li>)}</ul>
          )}
          {block.cards.length > 0 && (
            <ul className="hp-pc-grid">
              {block.cards.map(card => <li key={card.id}><PatchChangeCard card={card} eager={eager && rendered++ < EAGER_CARDS} /></li>)}
            </ul>
          )}
        </section>
      ))}
      {note && <p className="hp-release__pictures">{note} — в статье только картинками.</p>}
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
