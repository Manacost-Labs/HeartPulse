/** What the scroll needs from the page; a test supplies its own. */
export type SectionScrollHost = {
  find: (id: string) => { scrollIntoView: (options: { block: 'start' }) => void } | null;
  /** Calls `onChange` after every change of the page's elements until the returned function is called. */
  observe: (onChange: () => void) => () => void;
  nextFrame: (run: () => void) => void;
};

/**
 * Scrolls to an account section once it is on the page. A section that waits
 * for its own data (the Twitch block renders nothing until its request
 * answers) is not there on the first frame after the tab opens, so the scroll
 * waits for the element to appear instead of giving up. Returns the cancel
 * function: call it when the address asks for another section or the tabs
 * leave the page.
 */
export function scrollToSectionWhenShown(section: string, host: SectionScrollHost): () => void {
  let cancelled = false;
  let stopObserving: (() => void) | null = null;
  const scroll = () => {
    const element = host.find(section);
    element?.scrollIntoView({ block: 'start' });
    return Boolean(element);
  };
  // One frame first: the tab's panel is still `hidden` in the frame that selected it.
  host.nextFrame(() => {
    if (cancelled || scroll()) return;
    stopObserving = host.observe(() => {
      if (!scroll()) return;
      stopObserving?.();
      stopObserving = null;
    });
  });
  return () => {
    cancelled = true;
    stopObserving?.();
    stopObserving = null;
  };
}

/** The browser's page as a {@link SectionScrollHost}. */
export const browserSectionScrollHost: SectionScrollHost = {
  find: id => document.getElementById(id),
  observe: onChange => {
    const observer = new MutationObserver(onChange);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  },
  nextFrame: run => { window.requestAnimationFrame(run); },
};
