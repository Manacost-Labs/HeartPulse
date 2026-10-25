import { LoadingBlock, LoadingSurface } from '../../shared/ui/LoadingSurface';
import '../../shared/ui/LoadingSurface.css';
import '../PatchNotesView.css';
import './PatchNotesShowcase.css';

/*
 * The patch page while its patch loads in the browser: the same header plate
 * (with the page's real h1), the filters bar, a section head and change rows
 * in the changes column, and the table of contents beside them on wide
 * content — so the swap to the patch keeps the layout in place.
 */

const ROWS = 6;

export function PatchNotesSkeleton() {
  return (
    <div className="hp-patch hp-patch--loading">
      <header className="hp-patch-hero">
        <div className="hp-patch-hero__content">
          <h1 className="hp-patch-hero__kicker">Патчноуты Hearthstone</h1>
          <span className="hp-patch-skeleton__hero" aria-hidden="true">
            <LoadingBlock className="hp-patch-skeleton__switcher" />
            <LoadingBlock className="hp-patch-skeleton__title" />
            <LoadingBlock className="hp-patch-skeleton__digest" />
            <LoadingBlock className="hp-patch-skeleton__digest" />
          </span>
        </div>
      </header>
      <div className="hp-patch-layout" data-toc="">
        <div className="hp-patch-main">
          <LoadingSurface label="Загружаем патчноуты" quiet layout="rows" blocksClassName="hp-patch-skeleton__main">
            <LoadingBlock className="hp-patch-skeleton__bar" />
            <LoadingBlock className="hp-patch-skeleton__head" />
            <span className="hp-patch-skeleton__rows">
              {Array.from({ length: ROWS }, (_, index) => <LoadingBlock key={index} className="hp-patch-skeleton__row" />)}
            </span>
          </LoadingSurface>
        </div>
        <span className="hp-patch-toc hp-patch-skeleton__toc" aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => <LoadingBlock key={index} className="hp-patch-skeleton__toc-line" />)}
        </span>
      </div>
    </div>
  );
}
