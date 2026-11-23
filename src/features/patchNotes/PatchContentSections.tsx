import { Fragment, lazy, Suspense, useId, useState } from 'react';
import type {
  PatchNotesContentSection, PatchNotesHighlightItem, PatchNotesMention,
} from '../../modules/patchNotes/public';
import { registerLightboxModule } from '../../shared/ui/lightboxIntent';
import type { CardPreviewSheetCard } from '../CardPreviewSheet';
import type { CardPreviewTarget } from '../CardPreviewTooltip';
import { lineParts, proxiedCardImage } from './PatchGeneralChanges';

const loadCardPreviewSheet = () => import('../CardPreviewSheet');
const loadCardPreviewTooltip = () => import('./PatchCardTooltip');
const CardPreviewSheet = lazy(loadCardPreviewSheet);
const CardPreviewTooltip = lazy(loadCardPreviewTooltip);
registerLightboxModule('card-preview', () => Promise.all([loadCardPreviewSheet(), loadCardPreviewTooltip()]));

function openAfterFocusScroll(element: HTMLElement, open: (element: HTMLElement) => void) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (document.activeElement === element) open(element);
  }));
}

type MentionHandlers = {
  onHover: (mark: PatchNotesMention, element: HTMLElement) => void;
  onLeave: () => void;
  onOpenSheet: (mark: PatchNotesMention) => void;
};

function BulletLines({
  bullets, marks, handlers,
}: {
  bullets: readonly string[];
  marks?: readonly PatchNotesMention[];
  handlers: MentionHandlers;
}) {
  return (
    <ul className="hp-csec__bullets">
      {bullets.map((line, index) => (
        <li key={`${index}-${line.slice(0, 24)}`}>
          {lineParts(line, (marks ?? []).filter(mark => mark.line === index)).map((part, at) => (
            typeof part === 'string' ? (
              <Fragment key={at}>{part}</Fragment>
            ) : (
              <button
                key={at}
                type="button"
                className="hp-card-mention"
                data-lightbox-module="card-preview"
                aria-label={`${line.slice(part.start, part.end)}: показать карту «${part.name}»`}
                onPointerEnter={event => { if (event.pointerType === 'mouse') handlers.onHover(part, event.currentTarget); }}
                onPointerLeave={handlers.onLeave}
                onFocus={event => openAfterFocusScroll(event.currentTarget, element => handlers.onHover(part, element))}
                onBlur={handlers.onLeave}
                onClick={() => handlers.onOpenSheet(part)}
              >
                {line.slice(part.start, part.end)}
              </button>
            )
          ))}
        </li>
      ))}
    </ul>
  );
}

function CardsBody({ items, handlers }: { items: readonly PatchNotesHighlightItem[]; handlers: MentionHandlers }) {
  return (
    <div className="hp-csec__cards">
      {items.map((item, index) => (
        <article key={`${item.title}-${index}`} className="hp-csec-card">
          <div className="hp-csec-card__head">
            <h5 className="hp-csec-card__title">{item.title}</h5>
            {item.meta && <span className="hp-csec-card__meta">{item.meta}</span>}
          </div>
          {item.body && <p className="hp-csec-card__text">{item.body}</p>}
          {item.bullets && item.bullets.length > 0 && (
            <BulletLines bullets={item.bullets} marks={item.marks} handlers={handlers} />
          )}
        </article>
      ))}
    </div>
  );
}

function ListBody({ items, handlers }: { items: readonly PatchNotesHighlightItem[]; handlers: MentionHandlers }) {
  return (
    <div className="hp-csec__groups">
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`} className="hp-csec__group">
          {(item.title || item.meta) && (
            <div className="hp-csec__group-head">
              {item.title && <h5 className="hp-csec__group-title">{item.title}</h5>}
              {item.meta && <span className="hp-csec-card__meta">{item.meta}</span>}
            </div>
          )}
          {item.body && <p className="hp-csec-card__text">{item.body}</p>}
          {item.bullets && item.bullets.length > 0 && (
            <BulletLines bullets={item.bullets} marks={item.marks} handlers={handlers} />
          )}
        </div>
      ))}
    </div>
  );
}

function TableBody({ section }: { section: PatchNotesContentSection }) {
  const columns = section.columns ?? [];
  const rows = section.rows ?? [];
  return (
    <>
      <div className="hp-csec__table-wrap" role="region" aria-label={section.title} tabIndex={0}>
        <table className="hp-csec__table">
          {columns.length > 0 && (
            <thead>
              <tr>
                {columns.map((column, index) => <th key={`${column}-${index}`} scope="col">{column}</th>)}
              </tr>
            </thead>
          )}
          {rows.length > 0 && (
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
      {section.footnote && <p className="hp-csec__footnote">{section.footnote}</p>}
    </>
  );
}

function SectionBlock({
  section, baseId, handlers,
}: {
  section: PatchNotesContentSection;
  baseId: string;
  handlers: MentionHandlers;
}) {
  const collapsible = Boolean(section.collapsedByDefault);
  const [open, setOpen] = useState(!collapsible);
  const panelId = `${baseId}-${section.id}`;
  const headingId = `${panelId}-title`;

  return (
    <section className="hp-csec" aria-labelledby={headingId}>
      <header className="hp-csec__head">
        <div className="hp-csec__heading">
          <h4 id={headingId} className="hp-csec__title">{section.title}</h4>
          {section.subtitle && <p className="hp-csec__subtitle">{section.subtitle}</p>}
        </div>
        {collapsible && (
          <button
            type="button"
            className="hp-csec__toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => { handlers.onLeave(); setOpen(current => !current); }}
          >
            {open ? 'Свернуть' : 'Показать'}
          </button>
        )}
      </header>
      <div id={panelId} className="hp-csec__body" hidden={!open}>
        {open && section.kind === 'cards' && <CardsBody items={section.items ?? []} handlers={handlers} />}
        {open && section.kind === 'list' && <ListBody items={section.items ?? []} handlers={handlers} />}
        {open && section.kind === 'table' && <TableBody section={section} />}
      </div>
    </section>
  );
}

/** Structured overview, event, rewards, cosmetics and bug-fix sections for major patches. */
export function PatchContentSections({ sections }: { sections: PatchNotesContentSection[] }) {
  const baseId = useId();
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  const [sheet, setSheet] = useState<CardPreviewSheetCard | null>(null);

  if (sections.length === 0) return null;

  const handlers: MentionHandlers = {
    onHover: (mark, element) => setPreview({
      id: mark.cardId, name: mark.name, imageUrl: proxiedCardImage(mark.renderUrl), rect: element.getBoundingClientRect(),
    }),
    onLeave: () => setPreview(null),
    onOpenSheet: mark => {
      setPreview(null);
      setSheet({ id: mark.cardId, name: mark.name, imageUrl: proxiedCardImage(mark.renderUrl) });
    },
  };

  return (
    <div className="hp-csec-list">
      {sections.map(section => (
        <SectionBlock key={section.id} section={section} baseId={baseId} handlers={handlers} />
      ))}
      {preview && <Suspense fallback={null}><CardPreviewTooltip preview={preview} /></Suspense>}
      {sheet && <Suspense fallback={null}><CardPreviewSheet card={sheet} onClose={() => setSheet(null)} /></Suspense>}
    </div>
  );
}
