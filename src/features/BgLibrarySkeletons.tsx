import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { Line } from './BattlegroundsSkeletons';
import { BattlegroundMinionHeader } from './BattlegroundMinionHeader';
import '../shared/ui/LoadingSurface.css';
import './BattlegroundsSkeletons.css';

// Loading states of the Battlegrounds library. Wrappers reuse the real tile,
// dossier and panel classes; blocks only stand in for data.

/** Anonymous card identity that the server page already rendered (the public teaser). */
export type BgLibraryCardTeaser = {
  dbfId: number;
  name: string;
  typeName: string;
  text: string | null;
  image: string;
};

// The listing's skeleton has a file of its own: the listing view is in every visitor's page, the card skeleton is not.
export { BgLibraryListSkeleton } from './BgLibraryListSkeleton';

const METRICS = 4;

/**
 * A card page while its statistics load. A server teaser keeps the card's
 * name, art and rules text on screen (dimmed and busy); the facts, metrics and
 * statistics panels are placeholders. The single status is the back control's
 * placeholder, outside the busy dossier.
 */
export function BgLibraryDetailSkeleton({ kicker, stats, minion = false, teaser }: {
  kicker: string;
  /** A current-pool minion: the plate of BattlegroundMinionHeader instead of the dossier. */
  minion?: boolean;
  /** The card has current-pool statistics: the metrics carry a caption and statistics panels follow. */
  stats: boolean;
  teaser?: BgLibraryCardTeaser;
}) {
  return (
    <div className="bg-library-detail-page bg-library-detail-skeleton space-y-6 text-[#26374f]">
      <LoadingSurface label="Загружаем страницу карты" quiet layout="rows"
        className="bg-skeleton-back inline-flex items-center gap-2 rounded-md border border-[#cbd9ed] bg-[#ffffff] px-4 py-2 text-sm font-semibold">
        <LoadingBlock className="bg-library-detail-skeleton__back" />
      </LoadingSurface>
      {minion ? (
        // The server's teaser stays at full strength while the rest loads: dimmed, the
        // dark plate would read as a different, brown block until the page arrives.
        <div aria-busy={teaser ? true : undefined} aria-hidden={teaser ? undefined : true}>
          <BattlegroundMinionHeader loading title={teaser?.name ?? null} facts={[]} kpis={[]} emptyText=""
            card={teaser ? <img src={teaser.image} alt={teaser.name} decoding="async" /> : null}
            rulesText={teaser?.text ?? undefined} />
        </div>
      ) : (
      <section
        className="bg-library-card-dossier overflow-hidden rounded-lg border border-[#cbd9ed] bg-[#f8fbff] shadow-[0_16px_38px_rgba(68,88,122,0.14)]"
        aria-busy={teaser ? true : undefined}
        aria-hidden={teaser ? undefined : true}
      >
        <div className="bg-library-card-dossier__layout grid gap-6 p-4 sm:p-6 lg:grid-cols-[320px_1fr]">
          <div className="bg-library-card-dossier__art relative mx-auto w-full max-w-xs flex-col">
            {teaser
              ? <img src={teaser.image} alt={teaser.name} decoding="async" className="w-full drop-shadow-[0_22px_30px_rgba(21,31,47,0.22)]" />
              : <LoadingBlock className="bg-library-detail-skeleton__art" />}
          </div>
          <div className="bg-library-card-dossier__copy min-w-0 space-y-5">
            <div>
              <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#8a651f]">{kicker}</p>
              {teaser
                ? <h1 className="bg-library-card-dossier__title mt-2 font-hs text-4xl text-[#23314a] sm:text-5xl">{teaser.name}</h1>
                : <p className="bg-library-card-dossier__title mt-2 font-hs text-4xl text-[#23314a] sm:text-5xl"><Line className="bg-skeleton-w-name" /></p>}
              <p className="mt-1 text-lg text-[#657893]" aria-hidden="true"><Line className="bg-skeleton-w-title" /></p>
            </div>
            <div className="flex flex-wrap gap-2" aria-hidden="true">
              <LoadingBlock className="bg-library-detail-skeleton__chip" />
              <LoadingBlock className="bg-library-detail-skeleton__chip" />
            </div>
            <div className="bg-library-card-description rounded-md border border-[#d6e1f1] bg-[#ffffff] p-4 text-base leading-relaxed text-[#3b4d68]">
              <p className="mb-2 font-hs text-lg text-[#26374f]">Описание карты</p>
              {teaser?.text
                ? <p className="whitespace-pre-line">{teaser.text}</p>
                : <p aria-hidden="true"><Line /><Line className="bg-skeleton-w-short bg-skeleton-line--phone" /></p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
              {Array.from({ length: METRICS }, (_, index) => (
                <div key={index} className="bg-library-metric-card min-w-0 rounded-md border border-[#cbd9ed] bg-[#f8fbff] px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#60718a]"><Line className="bg-skeleton-w-value" /></p>
                  <p className="mt-1 min-w-0 font-hs text-2xl text-[#7c5b24]"><Line className="bg-skeleton-w-value" /></p>
                  {stats && index === METRICS - 1 && <p className="mt-1 text-xs text-[#657893]"><Line className="bg-skeleton-w-title" /></p>}
                </div>
              ))}
            </div>
            <div className="bg-library-card-sources flex min-w-0 flex-wrap gap-2" aria-hidden="true">
              <span className="rounded-md border border-[#d6e1f1] bg-white px-3 py-2 text-sm font-semibold text-[#60718a]"><Line className="bg-skeleton-w-title" /></span>
            </div>
          </div>
        </div>
      </section>
      )}
      {stats && <section className="rounded-lg border border-[#cbd9ed] bg-[#f8fbff] p-4 shadow-sm sm:p-5" aria-hidden="true">
        <p className="mb-4 font-hs text-2xl text-[#26374f]"><Line className="bg-skeleton-w-title" /></p>
        <LoadingBlock className="bg-library-detail-skeleton__panel" />
      </section>}
    </div>
  );
}
