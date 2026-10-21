import type { CSSProperties, ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import {
  patchGroupKinds, patchHasWideArtwork, sentenceCase,
  type PatchCardView, type PatchGroupView, type PatchKindCounts, type PatchNotesDetail, type PatchNotesMode, type PatchSectionId,
} from '../../modules/patchNotes/public';
import { EAGER_CARDS, KINDS, KIND_LABELS, PatchCard, isCompactCard, type CardHandlers } from './PatchCard';
import { KindShareBar } from './PatchHero';
import { GroupIcon } from './PatchMetaImpact';
import { ModeEmblem } from './PatchModeTiles';
import { groupAnchor, sectionAnchor } from './PatchNotesNavigation';
import { SECTION_PLATES, classAccent, classIcon96 } from './patchArt';

/* The reading flow below the header: highlights and collapsible sections of change cards. */

/** At most this many highlights become featured plates; the rest keep the regular card. */
const FEATURED = 2;

/**
 * Affected archetypes (`children`) come first; key cards follow when there are
 * at least two. The first highlights with wide wiki art lead as featured plates.
 */
export function Highlights({ cards, handlers, children }: { cards: PatchCardView[]; handlers: CardHandlers; children?: ReactNode }) {
  if (cards.length < 2 && !children) return null;
  const featured = cards.length >= 2 ? cards.filter(patchHasWideArtwork).slice(0, FEATURED) : [];
  const rest = cards.filter(card => !featured.includes(card));
  return (
    <section className="hp-patch-highlights" aria-labelledby="hp-patch-highlights-title">
      <div className="hp-patch-highlights__head">
        <h3 id="hp-patch-highlights-title">Главное в патче</h3>
        <p>Затронутые архетипы и самые крупные изменения больших разделов. Короткие разделы, до трёх карт, читаются целиком ниже.</p>
      </div>
      {children}
      {featured.length > 0 && (
        <ul className="hp-patch-highlights__featured" data-count={featured.length}>
          {featured.map(card => (
            <li key={card.id}><PatchCard card={card} featured eager headingLevel="h3" {...handlers} /></li>
          ))}
        </ul>
      )}
      {cards.length >= 2 && [false, true].map(compact => {
        const shown = rest.filter(card => isCompactCard(card) === compact);
        return shown.length > 0 && (
          <ul key={String(compact)} className={`hp-patch-highlights__list${compact ? ' hp-patch-group__list--compact' : ''}`}>
            {shown.map(card => (
              <li key={card.id}>
                <PatchCard card={card} compact={compact} eager={cards.indexOf(card) < EAGER_CARDS} headingLevel="h3" {...handlers} />
              </li>
            ))}
          </ul>
        );
      })}
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
            {pictures.join(', ')} — в статье только картинками, текстом их нет, поэтому здесь они не показаны.
            {patch.sourceUrl && <> <a href={patch.sourceUrl} target="_blank" rel="noreferrer">Открыть статью</a>.</>}
          </span>
        </p>
      )}
    </div>
  );
}

function SectionKinds({ kinds }: { kinds: PatchKindCounts }) {
  return (
    <span className="hp-patch-section__kinds">
      {KINDS.filter(kind => kinds[kind] > 0).map(kind => (
        <span key={kind} data-kind={kind}>{kinds[kind]} {KIND_LABELS[kind].many.toLocaleLowerCase('ru-RU')}</span>
      ))}
    </span>
  );
}

/** A class group carries its class icon and colour, like the class portraits elsewhere on the site. */
function GroupHeading({ group }: { group: PatchGroupView }) {
  const classKey = 'classKey' in group.icon ? group.icon.classKey : null;
  const kinds = patchGroupKinds(group);
  return (
    <h4 className="hp-patch-group__title">
      {classKey
        ? <img className="hp-patch-group__icon" src={classIcon96(classKey)} alt="" width={96} height={96} loading="lazy" decoding="async" />
        : <GroupIcon icon={group.icon} />}
      <span className="hp-patch-group__name">{group.title}</span>
      <span className="hp-patch-group__count">{group.entries.length}</span>
      <span className="hp-patch-group__kinds">
        {KINDS.filter(kind => kinds[kind] > 0).map(kind => <span key={kind} data-kind={kind}>{({ buff: '▲', nerf: '▼', rework: '↻' })[kind]}{kinds[kind]}</span>)}
      </span>
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
      <span className="hp-patch-section__heading">
        <h3 className="hp-patch-section__title">{section.title} {section.count > 0 && <span>{section.count}</span>}</h3>
        {section.count > 0 ? <SectionKinds kinds={section.kinds} /> : <span className="hp-patch-section__kinds">Общие изменения режима</span>}
      </span>
      {section.count > 0 && <KindShareBar kinds={section.kinds} className="hp-patch-section__share" />}
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
              <GroupHeading group={group} />
              {[false, true].map(compact => {
                const cards = group.entries.filter(card => isCompactCard(card) === compact);
                return cards.length > 0 && (
                  <ul key={String(compact)} className={`hp-patch-group__list${compact ? ' hp-patch-group__list--compact' : ''}`}>
                    {cards.map(card => (
                      <li key={card.id}><PatchCard card={card} compact={compact} anchored eager={rendered++ < EAGER_CARDS} {...handlers} /></li>
                    ))}
                  </ul>
                );
              })}
            </div>
          );
        })}
        {!filtered && notes && <SectionNotes patch={patch} mode={notes} />}
      </div>
    </details>
  );
}
