import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './ConstructedArchetypes.css';

export function ArchetypesCatalogSkeleton() {
  return <LoadingSurface label="Загружаем архетипы" quiet layout="rows">
    <div className="archetypes-ledger">
      <div className="archetypes-ledger__header"><LoadingBlock className="archetypes-loading__header-line" /><LoadingBlock className="archetypes-loading__header-line" /></div>
      <div className="archetypes-loading__rows">{Array.from({ length: 3 }, (_, index) => <LoadingBlock key={index} className="archetypes-loading__row" />)}</div>
    </div>
  </LoadingSurface>;
}
