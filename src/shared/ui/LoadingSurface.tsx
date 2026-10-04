import React from 'react';

// Styles: LoadingSurface.css, loaded globally by src/index.css. Loaders sit
// on most data routes; one global rule set costs less than a separate
// render-blocking stylesheet on each of them.

type LoadingLayout = 'panel' | 'rows' | 'grid';

const DEFAULT_BLOCKS: Record<LoadingLayout, { count: number; shape: string }> = {
  panel: { count: 3, shape: 'loading-block--line' },
  rows: { count: 3, shape: 'loading-block--row' },
  grid: { count: 6, shape: 'loading-block--tile' },
};

function classes(...names: Array<string | false | undefined>): string {
  return names.filter(Boolean).join(' ');
}

/** One placeholder block: the shared fill plus the single compositor-driven sheen. */
export function LoadingBlock({ className }: { className?: string }) {
  return <span className={classes('loading-block', className)} aria-hidden="true" />;
}

export type LoadingSurfaceProps = {
  /** What is loading («Загружаем мету»): the status text for assistive technology and the caption. */
  label: string;
  /** Optional second caption line. */
  detail?: string;
  /** Keep the caption for assistive technology only, for surfaces that look like their content. */
  quiet?: boolean;
  /** `panel` draws a framed card; `rows` and `grid` draw only their blocks. */
  layout?: LoadingLayout;
  /** Number of default blocks. */
  count?: number;
  /** The owning surface's class: it reserves the block size of the content that replaces the loader. */
  className?: string;
  /** Layout class of the block container, usually the content's own grid or list class. */
  blocksClassName?: string;
  /** Custom `LoadingBlock` set shaped like the content; it replaces the default blocks and their sizes. */
  children?: React.ReactNode;
};

/**
 * The single loading state of a data section. It announces one polite status,
 * keeps the final size so the swap to content does not shift the page, and
 * animates only a transform, so it costs no repaint per frame.
 */
export function LoadingSurface({
  label,
  detail,
  quiet = false,
  layout = 'panel',
  count,
  className,
  blocksClassName,
  children,
}: LoadingSurfaceProps) {
  const defaults = DEFAULT_BLOCKS[layout];
  const blocks = children ?? Array.from({ length: count ?? defaults.count }, (_, index) => (
    <LoadingBlock key={index} className={defaults.shape} />
  ));
  return (
    <div
      className={classes('loading-surface', `loading-surface--${layout}`, className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-loading-surface={layout}
    >
      <span className={classes('loading-surface__caption', quiet && 'sr-only')}>
        <strong>{label}</strong>
        {detail && <span>{detail}</span>}
      </span>
      <div className={classes('loading-surface__blocks', blocksClassName)} aria-hidden="true">{blocks}</div>
    </div>
  );
}
