/**
 * The viewer's card answers held in the page (`constructedCardDetailPrefetch`, `constructedCardListPrefetch` in
 * `src/features`) and the views showing them (`useCatalogData`, the card page). A held
 * answer is shown only while access is confirmed: a refusal of a card route (401, 403), a paid request answered as to
 * a guest (`statsAccess: false`) or an access that is not confirmed (`forgetPaidCardAnswers`) drops every held answer,
 * of every card and slice (the server answers by the session, so an answer asked while access was still being checked
 * may carry paid numbers too), and makes a request still on its way whose answer is paid (`statsAccess: true`) answer
 * as refused; the views showing paid numbers drop them in the same frame (`onPaidCardAnswersForgotten`): the next paid
 * figure on the page comes from a new answer of the server.
 */
const caches = new Set<() => void>();
const shownViews = new Set<(sync: boolean) => void>();
let generation = 0;

/** A cache of paid answers registers the way to empty it. */
export function holdPaidCardAnswers(forget: () => void): void {
  caches.add(forget);
}

/**
 * A view that shows held answers (the catalog list, the card page) drops their paid numbers when they are forgotten;
 * with `sync` it does so before the next frame (`flushSync` in the view: this module stays free of `react-dom`, server
 * components import the module's public face). Returns the unsubscribe.
 */
export function onPaidCardAnswersForgotten(hide: (sync: boolean) => void): () => void {
  shownViews.add(hide);
  return () => { shownViews.delete(hide); };
}

/**
 * `sync` (a refusal or a guest answer, read outside React): the shown views drop their paid numbers before the next
 * frame. From an effect (access not confirmed, already rendered so) they update with it.
 */
export function forgetPaidCardAnswers({ sync = true }: { sync?: boolean } = {}): void {
  generation += 1;
  for (const forget of caches) forget();
  for (const view of shownViews) view(sync);
}

/** The current generation of paid answers; a paid request started in an older one is no confirmation. */
export function paidCardAnswersGeneration(): number {
  return generation;
}

/** A refusal of the viewer by a card route. */
export const refusesViewer = (status: number) => status === 401 || status === 403;
