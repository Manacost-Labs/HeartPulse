import { ImageOff } from 'lucide-react';
import {
  sentenceCase, type PatchCardView, type PatchGroupView, type PatchNotesDetail, type PatchNotesMode, type PatchSectionView,
} from '../../modules/patchNotes/public';
import { EAGER_CARDS, KINDS, KIND_LABELS, PatchCard, type CardHandlers } from './PatchCard';
import { groupAnchor, sectionAnchor } from './PatchNotesNavigation';

/* The reading flow below the header: highlights and collapsible sections of change cards. */

export function Highlights({ cards, handlers }: { cards: PatchCardView[]; handlers: CardHandlers }) {
  if (cards.length < 2) return null;
  return (
    <section className="hp-patch-highlights" aria-labelledby="hp-patch-highlights-title">
      <div className="hp-patch-highlights__head">
        <h3 id="hp-patch-highlights-title">Главное в патче</h3>
        <p>Сначала Стандарт, затем самые крупные изменения чисел в других режимах.</p>
      </div>
      <ul className="hp-patch-highlights__list">
        {cards.map((card, index) => (
          <li key={card.id}><PatchCard card={card} eager={index < EAGER_CARDS} headingLevel="h3" {...handlers} /></li>
        ))}
      </ul>
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

function SectionKinds({ section }: { section: Pick<PatchSectionView, 'kinds'> }) {
  return (
    <span className="hp-patch-section__kinds">
      {KINDS.filter(kind => section.kinds[kind] > 0).map(kind => (
        <span key={kind} data-kind={kind}>{section.kinds[kind]} {KIND_LABELS[kind].many.toLocaleLowerCase('ru-RU')}</span>
      ))}
    </span>
  );
}

export function PatchSection({ section, groups, patch, notes, filtered, eagerFrom, handlers }: {
  section: { id: string; title: string; count: number; kinds: PatchSectionView['kinds'] }; groups: PatchGroupView[];
  patch: PatchNotesDetail; notes: PatchNotesMode | null; filtered: boolean; eagerFrom: number; handlers: CardHandlers;
}) {
  let rendered = eagerFrom;
  return (
    <details className="hp-patch-section" id={sectionAnchor(section.id)} open>
      <summary>
        <h3 className="hp-patch-section__title">{section.title} {section.count > 0 && <span>{section.count}</span>}</h3>
        <SectionKinds section={section} />
      </summary>
      <div className="hp-patch-section__body">
        {groups.map(group => (
          <div key={group.id} className="hp-patch-group" id={groupAnchor(group.id)}>
            <h4 className="hp-patch-group__title">{group.title} <span>{group.entries.length}</span></h4>
            <ul className="hp-patch-group__list">
              {group.entries.map(card => (
                <li key={card.id}><PatchCard card={card} eager={rendered++ < EAGER_CARDS} {...handlers} /></li>
              ))}
            </ul>
          </div>
        ))}
        {!filtered && notes && <SectionNotes patch={patch} mode={notes} />}
      </div>
    </details>
  );
}

