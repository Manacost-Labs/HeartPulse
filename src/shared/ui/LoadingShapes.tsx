import { LoadingBlock } from './LoadingSurface';
import './LoadingShapes.css';

// The shared placeholder shapes of a page while it loads. Each one is built
// from LoadingBlock and takes its geometry from the loaded view: put it inside
// the view's own classes (the banner, the table, the chart frame), so frames,
// paddings and grids stay the real ones and the swap to content moves nothing.
// Styles: LoadingSurface.css (fill, pulse) and LoadingShapes.css. Nothing here is a heading, link or button.

/**
 * Static interface copy as a text-shaped bar in the font of its holder: it
 * wraps where the loaded copy wraps. The text is transparent and hidden from
 * assistive technology. `as="i"` for holders whose `… span` rules must not
 * restyle the bar.
 */
export function LoadingText({ children, as: Tag = 'span', className }: { children: string; as?: 'span' | 'i'; className?: string }) {
  return <Tag className={className ? `loading-block loading-text ${className}` : 'loading-block loading-text'} aria-hidden="true">{children}</Tag>;
}

/** One line of a data value in the font of its holder; `wide` for a long number or date. */
export function LoadingValue({ wide = false, as: Tag = 'span', className }: { wide?: boolean; as?: 'span' | 'i'; className?: string }) {
  const classes = ['loading-block', 'loading-value', wide && 'loading-value--wide', className].filter(Boolean).join(' ');
  return <Tag className={classes} aria-hidden="true" />;
}

/**
 * A strip of KPIs: the real labels, each value a placeholder. `className` is
 * the loaded strip's own class (`traditional-mode-banner__summary`,
 * `archetype-dossier__metrics`), so cells keep their size.
 */
export function LoadingKpiStrip({ labels, className, wide = false }: { labels: string[]; className: string; wide?: boolean }) {
  return (
    <dl className={className} aria-hidden="true">
      {labels.map(label => <div key={label}><dt>{label}</dt><dd><LoadingValue wide={wide} /></dd></div>)}
    </dl>
  );
}

/** A page or section head: eyebrow, title and one line of description, as text-shaped bars. */
export function LoadingHeader({ eyebrow, title, description, titleClassName }: {
  eyebrow?: string; title: string; description?: string;
  /** The loaded title's class, so the bar takes its font size (headings are not drawn). */
  titleClassName?: string;
}) {
  return (
    <div className="loading-header" aria-hidden="true">
      {eyebrow ? <span className="loading-header__eyebrow"><LoadingText>{eyebrow}</LoadingText></span> : null}
      <div className={titleClassName ?? 'loading-header__title'}><LoadingText>{title}</LoadingText></div>
      {description ? <p className="loading-header__description"><LoadingText>{description}</LoadingText></p> : null}
    </div>
  );
}

/** Table rows at the loaded rows' height (`--loading-row-height`), `count` of them. */
export function LoadingTableRows({ count, className }: { count: number; className?: string }) {
  return <>{Array.from({ length: count }, (_, index) => <LoadingBlock key={index} className={`loading-block--row ${className ?? ''}`.trim()} />)}</>;
}

/** A chart's plot area: the loaded chart's frame supplies the size; `height` is the plot's. */
export function LoadingChart({ height }: { height: number }) {
  return <span className="loading-block loading-chart" style={{ blockSize: `${height}px` }} aria-hidden="true" />;
}

/** A card picture at the card art's ratio (512:776), for card grids and lists. */
export function LoadingCardTile() {
  return <LoadingBlock className="loading-card-tile" />;
}

/** A rendered deck image: DeckRenderPreview's square stage. */
export function LoadingDeckRender() {
  return <div className="deck-render-preview"><LoadingBlock className="deck-render-preview__loading" /></div>;
}
