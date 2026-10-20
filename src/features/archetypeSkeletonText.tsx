import { LoadingBlock } from '../shared/ui/LoadingSurface';
import './ConstructedArchetypeDetailSkeletons.css';

// Text parts of the archetype detail placeholders (styles in
// ConstructedArchetypeDetailSkeletons.css, inside `.archetype-detail-skeleton`).

/** Static interface copy as a text-shaped placeholder. */
export function Words({ children }: { children: string }) {
  return <span className="loading-block archetype-skeleton__words" aria-hidden="true">{children}</span>;
}

/** One line of a data value, in the font of the element that holds it. */
export function Value({ wide = false }: { wide?: boolean }) {
  return <LoadingBlock className={wide ? 'archetype-skeleton__value archetype-skeleton__value--wide' : 'archetype-skeleton__value'} />;
}

/** A section title placeholder: the real heading's box without a heading element. */
export function Title({ children, analysis = false }: { children: string; analysis?: boolean }) {
  return <div className={analysis ? 'archetype-skeleton__title archetype-skeleton__title--analysis' : 'archetype-skeleton__title'}><Words>{children}</Words></div>;
}
