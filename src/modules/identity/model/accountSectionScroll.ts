/** What the scroll needs from the page; a test supplies its own. */
export type SectionScrollHost = {
  find: (id: string) => { scrollIntoView: (options: { block: 'start' }) => void } | null;
  /** Calls `onChange` after every change of the page's elements until the returned function is called. */
  observe: (onChange: () => void) => () => void;
  nextFrame: (run: () => void) => void;
  /** Calls `run` once after `milliseconds` unless the returned function is called first. */
  after: (milliseconds: number, run: () => void) => () => void;
};

/**
 * How long a section may take to appear. Past it the visitor is reading or
 * scrolling the page already, and a jump would take it away from them.
 */
export const SECTION_SCROLL_WAIT_MS = 5_000;

/** Scrolls still waiting for their section, so the section's owner can end them. */
const waiting = new Map<string, Set<() => void>>();

/**
 * Scrolls to an account section once it is on the page. A section that waits
 * for its own data (the Twitch block renders nothing until its request
 * answers) is not there on the first frame after the tab opens, so the scroll
 * waits for the element to appear instead of giving up.
 *
 * The wait ends, without a scroll, when the returned function is called
 * (another anchor, a tab chosen by hand, the tabs leaving the page), when the
 * section's owner says it will not appear ({@link abandonSectionScroll}), or
 * after {@link SECTION_SCROLL_WAIT_MS}. Nothing is left watching the page.
 */
export function scrollToSectionWhenShown(section: string, host: SectionScrollHost): () => void {
  let ended = false;
  let release: Array<() => void> = [];
  const end = () => {
    ended = true;
    for (const stop of release.splice(0)) stop();
    waiting.get(section)?.delete(end);
    if (waiting.get(section)?.size === 0) waiting.delete(section);
  };
  const scroll = () => {
    const element = host.find(section);
    element?.scrollIntoView({ block: 'start' });
    return Boolean(element);
  };
  waiting.set(section, (waiting.get(section) ?? new Set()).add(end));
  // One frame first: the tab's panel is still `hidden` in the frame that selected it.
  host.nextFrame(() => {
    if (ended) return;
    if (scroll()) return end();
    release = [
      host.observe(() => { if (scroll()) end(); }),
      host.after(SECTION_SCROLL_WAIT_MS, end),
    ];
    return undefined;
  });
  return end;
}

/**
 * The section will not be shown (its feature is off or its data did not
 * load): every scroll waiting for it stops now instead of at the deadline.
 */
export function abandonSectionScroll(section: string): void {
  // Each `end` removes itself from the set, which a Set allows while it is being walked.
  for (const end of waiting.get(section) ?? []) end();
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
  after: (milliseconds, run) => {
    const timer = window.setTimeout(run, milliseconds);
    return () => window.clearTimeout(timer);
  },
};
