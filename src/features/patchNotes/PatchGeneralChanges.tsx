import { Fragment, lazy, Suspense, useState } from 'react';
import type { PatchNotesGeneralChanges, PatchNotesMention } from '../../modules/patchNotes/public';
import { publicResourceUrl } from '../../publicResourceUrl';
import { registerLightboxModule } from '../../shared/ui/lightboxIntent';
import type { CardPreviewTarget } from '../CardPreviewTooltip';
import type { CardPreviewSheetCard } from '../CardPreviewSheet';

/*
 * A mode's rule changes as a list; a card named in a line is a quiet button
 * that shows the card: on hover and keyboard focus a tooltip, on a press the
 * full card in a sheet (a phone has no hover).
 */

const loadCardPreviewSheet = () => import('../CardPreviewSheet');
const loadCardPreviewTooltip = () => import('./PatchCardTooltip');
const CardPreviewSheet = lazy(loadCardPreviewSheet);
/* The tooltip is lazy too: it only exists once a name is hovered, and it brings its own styles. */
const CardPreviewTooltip = lazy(loadCardPreviewTooltip);
registerLightboxModule('card-preview', () => Promise.all([loadCardPreviewSheet(), loadCardPreviewTooltip()]));

/** The pieces of one line: plain text, and the cards named in it. */
export function lineParts(text: string, marks: readonly PatchNotesMention[]): (string | PatchNotesMention)[] {
  const parts: (string | PatchNotesMention)[] = [];
  let at = 0;
  for (const mark of [...marks].sort((left, right) => left.start - right.start)) {
    if (mark.start < at || mark.end > text.length) continue;
    if (mark.start > at) parts.push(text.slice(at, mark.start));
    parts.push(mark);
    at = mark.end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

export function PatchGeneralChanges({ group }: { group: PatchNotesGeneralChanges }) {
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  const [sheet, setSheet] = useState<CardPreviewSheetCard | null>(null);
  const target = (mark: PatchNotesMention, element: HTMLElement): CardPreviewTarget => ({
    id: mark.cardId, name: mark.name, imageUrl: mark.renderUrl, rect: element.getBoundingClientRect(),
  });
  return (
    <div className="hp-general">
      <p className="hp-general__label">Общие изменения</p>
      <ul className="hp-general__list" aria-label="Общие изменения">
        {group.lines.map((line, index) => (
          <li key={line}>
            {lineParts(line, (group.marks ?? []).filter(mark => mark.line === index)).map((part, at) => (typeof part === 'string'
              ? <Fragment key={at}>{part}</Fragment>
              : (
                <button
                  key={at}
                  type="button"
                  className="hp-card-mention"
                  data-lightbox-module="card-preview"
                  aria-label={`${line.slice(part.start, part.end)}: показать карту «${part.name}»`}
                  onPointerEnter={event => { if (event.pointerType === 'mouse') setPreview(target(part, event.currentTarget)); }}
                  onPointerLeave={() => setPreview(null)}
                  onFocus={event => setPreview(target(part, event.currentTarget))}
                  onBlur={() => setPreview(null)}
                  onClick={() => { setPreview(null); setSheet({ id: part.cardId, name: part.name, imageUrl: publicResourceUrl(part.renderUrl) || null }); }}
                >
                  {line.slice(part.start, part.end)}
                </button>
              )))}
          </li>
        ))}
      </ul>
      {preview && <Suspense fallback={null}><CardPreviewTooltip preview={preview} /></Suspense>}
      {sheet && <Suspense fallback={null}><CardPreviewSheet card={sheet} onClose={() => setSheet(null)} /></Suspense>}
    </div>
  );
}
