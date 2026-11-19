import { LoadingBlock, LoadingSurface } from '../../shared/ui/LoadingSurface';
import '../../shared/ui/LoadingSurface.css';
import '../PatchNotesView.css';

/* The patch page while its patches load in the browser: the page's real h1, then a heading and two pairs. */

export function PatchNotesSkeleton() {
  return (
    <div className="hp-patch hp-patch--loading">
      <h1 className="hp-patch__title">Патчноуты Hearthstone</h1>
      <LoadingSurface label="Загружаем патчноуты" quiet layout="rows" blocksClassName="hp-patch__skeleton">
        <LoadingBlock className="hp-patch__skeleton-head" />
        <LoadingBlock className="hp-patch__skeleton-card" />
      </LoadingSurface>
    </div>
  );
}
