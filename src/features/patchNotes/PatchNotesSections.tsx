import React, { type ReactNode } from 'react';
import { ImageOff, Shapes, Star } from 'lucide-react';
import {
  PATCH_SECTION_TITLES, patchKindBlocks, patchModePictureNote, type PatchView,
  type PatchCardView, type PatchGroupView, type PatchKind, type PatchKindCounts, type PatchNotesDetail, type PatchNotesMode, type PatchSectionId,
} from '../../modules/patchNotes/public';
import { EAGER_CARDS, PatchCard, type CardHandlers } from './PatchCard';
import { GroupIcon } from './PatchMetaImpact';
import { groupAnchor, sectionAnchor } from './patchAnchors';
import { SECTION_ICONS, classIcon96 } from './patchArt';
import { KIND_BLOCK_LABELS, KIND_ICONS } from './patchKinds';
import { HIGHLIGHTS_ANCHOR } from './patchTocEntries';

/*
 * The reading flow below the header: what matters first, then collapsible
 * sections of change rows — patch → mode → class or type → card. Counts live
 * in the header and the bar only; a row carries its kind mark unless its
 * group names the kind once above a block of rows.
 */

/**
 * A block between the header and the sections ("Главное", archetypes): its
 * head reads like a section summary — emblem, title, wood rule — without the
 * disclosure, so every block of the page sits on one level.
 */
export function PatchBlock({ id, title, icon, aside, tourId, children }: {
  id: string; title: string; icon: ReactNode; aside?: ReactNode; tourId?: string; children: ReactNode;
}) {
  return (
    <section className="hp-patch-block" id={id} aria-labelledby={`${id}-title`} data-tour-id={tourId}>
      <header className="hp-patch-block__head">
        <span className="hp-patch-emblem" aria-hidden="true">{icon}</span>
        <h3 id={`${id}-title`} className="hp-patch-section__title">{title}</h3>
        {aside && <span className="hp-patch-block__aside">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

/** "Главное в патче": three or four compact tiles in one quiet panel; fewer than two is no block. */
export function Highlights({ cards, handlers }: { cards: PatchCardView[]; handlers: CardHandlers }) {
  if (cards.length < 2) return null;
  return (
    <PatchBlock id={HIGHLIGHTS_ANCHOR} title="Главное в патче" icon={<Star />} tourId="patch-highlights">
      <ul className="hp-patch-highlights__list" data-count={cards.length}>
        {cards.map(card => <li key={card.id}><PatchCard card={card} featured eager headingLevel="h4" {...handlers} /></li>)}
      </ul>
    </PatchBlock>
  );
}

/** Headings the article shows only as pictures, named once in one quiet line with the article link. */
export function PictureNote({ patch, note }: { patch: PatchNotesDetail; note: string }) {
  return (
    <p className="hp-patch-pictures" role="note">
      <ImageOff aria-hidden="true" />
      <span>
        {note} — в статье только картинками.
        {patch.sourceUrl && <> <a href={patch.sourceUrl} target="_blank" rel="noreferrer">Открыть статью</a></>}
      </span>
    </p>
  );
}

function SectionNotes({ patch, mode, hasCards }: { patch: PatchNotesDetail; mode: PatchNotesMode; hasCards: boolean }) {
  const general = patch.generalChanges.filter(item => item.mode === mode).flatMap(item => item.lines);
  const note = patchModePictureNote(patch.pictureSections, mode, hasCards);
  if (!general.length && !note) return null;
  return (
    <div className="hp-patch-section-notes">
      {general.length > 0 && (
        <div className="hp-patch-general">
          <h4>Общие изменения</h4>
          <ul>{general.map(line => <li key={line}>{line}</li>)}</ul>
        </div>
      )}
      {note && <PictureNote patch={patch} note={note} />}
    </div>
  );
}

/** Mode emblem(s) of a section; side modes have no emblem of their own and use a neutral glyph. */
function ModeEmblem({ section }: { section: { id: PatchSectionId } }) {
  const icons = SECTION_ICONS[section.id];
  return (
    <span className="hp-patch-emblem" data-count={icons.length || undefined} aria-hidden="true">
      {icons.length ? icons.map(icon => <img key={icon} src={icon} alt="" width={96} height={96} loading="lazy" decoding="async" />)
        : <Shapes />}
    </span>
  );
}

/** A class group carries its class icon, like the class portraits elsewhere on the site. */
function GroupHeading({ group }: { group: PatchGroupView }) {
  const classKey = 'classKey' in group.icon ? group.icon.classKey : null;
  return (
    <h4 className="hp-patch-group__title">
      {classKey
        ? <img className="hp-patch-group__icon" src={classIcon96(classKey)} alt="" width={96} height={96} loading="lazy" decoding="async" />
        : <GroupIcon icon={group.icon} />}
      <span className="hp-patch-group__name">{group.title}</span>
    </h4>
  );
}

/** A section opens with a line of type on a thin wood rule, not a second art plate under the header. */
function SectionBanner({ section }: { section: { id: PatchSectionId; title: string } }) {
  return (
    <summary>
      <ModeEmblem section={section} />
      <h3 className="hp-patch-section__title">{section.title}</h3>
    </summary>
  );
}

/** A long mixed group names each kind once above its rows; the rows then drop their own mark. */
function KindBlock({ kind, level, children }: { kind: PatchKind; level: 'h4' | 'h5'; children: ReactNode }) {
  const Icon = KIND_ICONS[kind];
  const Heading = level;
  return (
    <>
      <Heading className="hp-patch-kind-block" data-kind={kind}><Icon aria-hidden="true" />{KIND_BLOCK_LABELS[kind]}</Heading>
      {children}
    </>
  );
}

function PatchSection({ section, groups, patch, notes, filtered, eagerFrom, handlers }: {
  section: { id: PatchSectionId; title: string; count: number; kinds: PatchKindCounts }; groups: PatchGroupView[];
  patch: PatchNotesDetail; notes: PatchNotesMode | null; filtered: boolean; eagerFrom: number; handlers: CardHandlers;
}) {
  let rendered = eagerFrom;
  // Under a kind label a row is one heading level deeper and drops its own mark.
  const rows = (entries: PatchCardView[], under: 'h4' | 'h5' | null) => (
    <ul className="hp-patch-group__list">
      {entries.map(card => (
        <li key={card.id}>
          <PatchCard card={card} anchored eager={rendered++ < EAGER_CARDS} headingLevel={under === 'h5' ? 'h6' : 'h5'} showKind={!under} {...handlers} />
        </li>
      ))}
    </ul>
  );
  return (
    <details className="hp-patch-section" id={sectionAnchor(section.id)} data-section={section.id} open>
      <SectionBanner section={section} />
      <div className="hp-patch-section__body">
        {groups.map(group => {
          const blocks = patchKindBlocks(group.entries);
          const titled = groups.length > 1 || group.title !== section.title;
          const level = titled ? 'h5' : 'h4';
          return (
            // A group of one or two cards takes only its columns, so small classes share a row.
            <div key={group.id} className="hp-patch-group" id={groupAnchor(group.id)}
              data-size={group.entries.length > 2 ? 'many' : group.entries.length}>
              {/* A section of one group would only repeat its banner. */}
              {titled ? <GroupHeading group={group} /> : null}
              {blocks.map(block => (block.kind
                ? <KindBlock key={block.kind} kind={block.kind} level={level}>{rows(block.entries, level)}</KindBlock>
                : <React.Fragment key="all">{rows(block.entries, null)}</React.Fragment>))}
            </div>
          );
        })}
        {!filtered && notes && <SectionNotes patch={patch} mode={notes} hasCards={groups.length > 0} />}
      </div>
    </details>
  );
}

/**
 * Every section in reading order, then the sections of modes that have only
 * general changes. Rows load eagerly from `eagerFrom` on, counted across
 * sections; filters leave out sections without a match and all notes.
 */
export function PatchSections({ view, groups, patch, filtered, notesHome, notesOnly, eagerFrom, handlers }: {
  view: PatchView; groups: PatchGroupView[]; patch: PatchNotesDetail; filtered: boolean;
  notesHome: ReadonlyMap<PatchNotesMode, string>; notesOnly: PatchNotesMode[]; eagerFrom: number; handlers: CardHandlers;
}) {
  let eager = eagerFrom;
  return (
    <>
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
    </>
  );
}
