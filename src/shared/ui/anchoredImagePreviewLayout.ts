type AnchorRect = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'height'>;

const EDGE = 12;
const CHROME_HEIGHT = 66;
const IMAGE_RATIO = 724 / 512;

const BARE_RATIO = 776 / 512; // the 512x card render, with no frame around it
const BARE_MAX_WIDTH = 360;

/**
 * Keeps the complete image beside its trigger, using vertical space when neither side fits.
 * `bare`: the card render alone, without the framed plate, larger.
 */
export function anchoredImagePreviewLayout(rect: AnchorRect, viewportWidth: number, viewportHeight: number, bare = false) {
  const width = bare
    ? Math.min(BARE_MAX_WIDTH, viewportWidth - EDGE * 2, (viewportHeight - EDGE * 2) / BARE_RATIO)
    : Math.min(324, viewportWidth - EDGE * 2, (viewportHeight - EDGE * 2 - CHROME_HEIGHT) / IMAGE_RATIO + 24);
  const height = bare
    ? width * BARE_RATIO
    : Math.min(viewportHeight - EDGE * 2, (width - 24) * IMAGE_RATIO + CHROME_HEIGHT);
  const clampX = (value: number) => Math.max(EDGE, Math.min(value, viewportWidth - width - EDGE));
  const clampY = (value: number) => Math.max(EDGE, Math.min(value, viewportHeight - height - EDGE));
  let left: number;
  let top = clampY(rect.top + rect.height / 2 - height / 2);
  if (rect.right + EDGE + width <= viewportWidth - EDGE) {
    left = rect.right + EDGE;
  } else if (rect.left - EDGE - width >= EDGE) {
    left = rect.left - EDGE - width;
  } else {
    left = clampX((rect.left + rect.right - width) / 2);
    if (rect.top - EDGE - height >= EDGE) top = rect.top - EDGE - height;
    else if (rect.bottom + EDGE + height <= viewportHeight - EDGE) top = rect.bottom + EDGE;
  }
  return { left: clampX(left), top, width, height };
}
