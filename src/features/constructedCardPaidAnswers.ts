/**
 * The viewer's card answers held in the page (`constructedCardDetailPrefetch`, `constructedCardListPrefetch`). A held
 * answer is shown only while access is confirmed: a refusal of a card route (401, 403), a paid request answered as to
 * a guest (`statsAccess: false`) or an access that is not confirmed (`forgetPaidCardAnswers`) drops every held answer,
 * of every card and slice (the server answers by the session, so an answer asked while access was still being checked
 * may carry paid numbers too), and makes a request still on its way whose answer is paid (`statsAccess: true`) answer
 * as refused: the next paid figure on the page comes from a new answer of the server.
 */
const caches = new Set<() => void>();
let generation = 0;

/** A cache of paid answers registers the way to empty it. */
export function holdPaidCardAnswers(forget: () => void): void {
  caches.add(forget);
}

export function forgetPaidCardAnswers(): void {
  generation += 1;
  for (const forget of caches) forget();
}

/** The current generation of paid answers; a paid request started in an older one is no confirmation. */
export function paidCardAnswersGeneration(): number {
  return generation;
}

/** A refusal of the viewer by a card route. */
export const refusesViewer = (status: number) => status === 401 || status === 403;
