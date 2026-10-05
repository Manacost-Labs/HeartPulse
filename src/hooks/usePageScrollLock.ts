import { useEffect } from 'react';

const scrollOffsetProperty = '--page-scroll-lock-offset';

type SavedInlineStyles = {
  body: Pick<CSSStyleDeclaration, 'position' | 'top' | 'left' | 'right' | 'width' | 'overflow' | 'overscrollBehavior'>;
  html: Pick<CSSStyleDeclaration, 'overflow' | 'overscrollBehavior'>;
  scrollOffset: [string, string];
};

let lockCount = 0;
let lockedScrollY = 0;
let savedStyles: SavedInlineStyles | null = null;

function lockPageScroll() {
  if (lockCount++) return;

  const body = document.body;
  const html = document.documentElement;
  lockedScrollY = window.scrollY;
  savedStyles = {
    body: {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
    },
    html: {
      overflow: html.style.overflow,
      overscrollBehavior: html.style.overscrollBehavior,
    },
    scrollOffset: [body.style.getPropertyValue(scrollOffsetProperty), body.style.getPropertyPriority(scrollOffsetProperty)],
  };

  html.style.overflow = 'hidden';
  html.style.overscrollBehavior = 'none';
  body.style.position = 'fixed';
  body.style.top = `-${lockedScrollY}px`;
  body.style.setProperty(scrollOffsetProperty, `${lockedScrollY}px`);
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
  body.style.overscrollBehavior = 'none';
}

function unlockPageScroll() {
  if ((lockCount && --lockCount) || !savedStyles) return;

  const body = document.body;
  const html = document.documentElement;
  Object.assign(body.style, savedStyles.body);
  Object.assign(html.style, savedStyles.html);
  body.style.setProperty(scrollOffsetProperty, ...savedStyles.scrollOffset);
  savedStyles = null;
  window.scrollTo(0, lockedScrollY);
}

/** Nested locks preserve the reading position; the inherited offset keeps sticky chrome visible over the fixed body. */
export function usePageScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    lockPageScroll();
    return unlockPageScroll;
  }, [active]);
}
