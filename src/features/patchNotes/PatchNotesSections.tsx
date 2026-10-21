import type { CSSProperties, ReactNode } from 'react';
import { ImageOff, Shapes } from 'lucide-react';
import {
  patchGroupKinds, patchHasWideArtwork, sentenceCase,
  type PatchCardView, type PatchGroupView, type PatchKindCounts, type PatchNotesDetail, type PatchNotesMode, type PatchSectionId,
} from '../../modules/patchNotes/public';
import { EAGER_CARDS, PatchCard, type CardHandlers } from './PatchCard';
import { GroupIcon } from './PatchMetaImpact';
import { groupAnchor, sectionAnchor } from './PatchNotesNavigation';
import { SECTION_ICONS, SECTION_PLATES, classAccent, classIcon96 } from './patchArt';
import { KIND_ICONS, KIND_LABELS } from './patchKinds';

/* The reading flow below the header: what matters first, then collapsible sections of change cards. */

/** Buff, nerf and rework counts as marks; the words are read out, the marks are seen. */
export function KindCounts({ kinds, className }: { kinds: PatchKindCounts; className: string }) {
  return (
    <span className={className}>
      {(['buff', 'nerf', 'rework'] as const).filter(kind => kinds[kind] > 0).map(kind => {
        const Icon = KIND_ICONS[kind];
        return (
          <span key={kind} data-kind={kind} title={KIND_LABELS[kind]}>
            <Icon aria-hidden="true" />{kinds[kind]}<span className="sr-only"> — {KIND_LABELS[kind].toLocaleLowerCase('ru-RU')}</span>
          </span>
        );
      })}
    </span>
  );
}

/** "Главное в патче": three or four large cards, then the cards → archetypes flow (`children`). */
export function Highlights({ cards, handlers, children }: { cards: PatchCardView[]; handlers: CardHandlers; children?: ReactNode }) {
  const shown = cards.length >= 2 ? cards : [];
  // Art for all or none: one plate among plain cards reads as a different kind of card.
  const withArt = shown.length > 0 && shown.every(patchHasWideArtwork);
  if (!shown.length && !children) return null;
  return (
    <section className="hp-patch-highlights" aria-labelledby="hp-patch-highlights-title" data-tour-id="patch-highlights">
      <h3 id="hp-patch-highlights-title" className="hp-patch-heading">Главное в патче</h3>
      {shown.length > 0 && (
        <ul className="hp-patch-highlights__list" data-count={shown.length}>
          {shown.map(card => <li key={card.id}><PatchCard card={card} featured withArt={withArt} eager headingLevel="h4" {...handlers} /></li>)}
        </ul>
      )}
      {children}
    </section>
  );
}

function SectionNotes({ patch, mode }: { patch: PatchNotesDetail; mode: PatchNotesMode }) {
  const general = patch.generalChanges.filter(item => item.mode === mode).flatMap(item => item.lines);
  const pictures = patch.pictureSections.filter(item => item.mode === mode).map(item => sentenceCase(item.title));
  if (!general.length && !pictures.length) return null;
  return (
    <div className="hp-patch-section-notes">
      {general.length > 0 && (
        <div className="hp-patch-general">
          <h4>Общие изменения</h4>
          <ul>{general.map(line => <li key={line}>{line}</li>)}</ul>
        </div>
      )}
      {pictures.length > 0 && (
        <p className="hp-patch-pictures" role="note">
          <ImageOff aria-hidden="true" />
          <span>
            {pictures.join(', ')} — в статье только картинками.
            {patch.sourceUrl && <> <a href={patch.sourceUrl} target="_blank" rel="noreferrer">Открыть статью</a></>}
          </span>
        </p>
      )}
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

/** A class group carries its class icon and colour, like the class portraits elsewhere on the site. */
function GroupHeading({ group }: { group: PatchGroupView }) {
  const classKey = 'classKey' in group.icon ? group.icon.classKey : null;
  return (
    <h4 className="hp-patch-group__title">
      {classKey
        ? <img className="hp-patch-group__icon" src={classIcon96(classKey)} alt="" width={96} height={96} loading="lazy" decoding="async" />
        : <GroupIcon icon={group.icon} />}
      <span className="hp-patch-group__name">{group.title}</span>
      <KindCounts kinds={patchGroupKinds(group)} className="hp-patch-group__kinds" />
    </h4>
  );
}

function SectionBanner({ section }: { section: { id: PatchSectionId; title: string; count: number; kinds: PatchKindCounts } }) {
  const plate = SECTION_PLATES[section.id];
  return (
    <summary>
      <img className="hp-patch-section__plate" src={plate.src} srcSet={plate.srcSet} sizes="(min-width: 960px) 900px, 100vw"
        width={plate.width} height={plate.height} style={{ objectPosition: plate.focus }} alt="" loading="lazy" decoding="async" />
      <ModeEmblem section={section} />
      <h3 className="hp-patch-section__title">{section.title}</h3>
      {section.count > 0
        ? <KindCounts kinds={section.kinds} className="hp-patch-section__kinds" />
        : <span className="hp-patch-section__kinds">Общие изменения режима</span>}
    </summary>
  );
}

export function PatchSection({ section, groups, patch, notes, filtered, eagerFrom, handlers }: {
  section: { id: PatchSectionId; title: string; count: number; kinds: PatchKindCounts }; groups: PatchGroupView[];
  patch: PatchNotesDetail; notes: PatchNotesMode | null; filtered: boolean; eagerFrom: number; handlers: CardHandlers;
}) {
  let rendered = eagerFrom;
  return (
    <details className="hp-patch-section" id={sectionAnchor(section.id)} data-section={section.id} open>
      <SectionBanner section={section} />
      <div className="hp-patch-section__body">
        {groups.map(group => {
          const accent = classAccent('classKey' in group.icon ? group.icon.classKey : null);
          return (
            <div key={group.id} className="hp-patch-group" id={groupAnchor(group.id)}
              style={accent ? { '--group-accent': accent } as CSSProperties : undefined}>
              {/* A section of one group would only repeat its banner. */}
              {groups.length > 1 || group.title !== section.title ? <GroupHeading group={group} /> : null}
              <ul className="hp-patch-group__list">
                {group.entries.map(card => (
                  <li key={card.id}><PatchCard card={card} anchored eager={rendered++ < EAGER_CARDS} {...handlers} /></li>
                ))}
              </ul>
            </div>
          );
        })}
        {!filtered && notes && <SectionNotes patch={patch} mode={notes} />}
      </div>
    </details>
  );
}
