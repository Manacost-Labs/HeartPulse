import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { AsyncSurfaceState } from './recovery/RecoverableSurface';
import '../shared/ui/LoadingSurface.css';
import './recovery/RecoverableSurface.css';
import './BattlegroundsSkeletons.css';

// Loading states of the paid Battlegrounds views. Each wrapper reuses the real
// card/panel classes, so borders, padding and grid columns come from the same
// CSS as the loaded view; the blocks only stand in for data. Static labels are
// real chrome inside aria-hidden placeholders, which keeps their line heights.

/** Anonymous hero identity that the server page already rendered (the public teaser). */
export type BattlegroundHeroTeaser = {
  dbfId: number;
  name: string;
  image: string;
  heroPower: { name: string; text: string | null; image: string } | null;
};

/** A one-line text placeholder inside a real text element: `1lh` takes that element's line height. */
export function Line({ className = '' }: { className?: string }) {
  // The hidden span keeps the block from being a `span:last-child`, which the reliquary styles as a pill.
  return <><LoadingBlock className={`bg-skeleton-line ${className}`} /><span hidden /></>;
}

const STAT_LABELS = ['Тир', 'Среднее место', 'Выбор героя', 'Лучший состав'];
const MEDIA_KICKERS = ['Сила героя', 'Компаньон', 'Золотой компаньон'];

function HeroMediaCard({ kicker, gold, power }: { kicker: string; gold?: boolean; power?: BattlegroundHeroTeaser['heroPower'] }) {
  return (
    <div className={`bg-hero-action-card rounded-2xl border p-3 text-left ${gold
      ? 'bg-hero-action-card--gold border-[#d6a74c] bg-[linear-gradient(135deg,#fff2cf,#eed19c)]'
      : 'border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffdf8,#f8eed9)]'}`}>
      <p className="bg-hero-action-card__kicker font-hs text-xs uppercase tracking-[0.16em]">{kicker}</p>
      <div className="bg-hero-action-card__body mt-2 grid items-start gap-3 sm:grid-cols-[96px_1fr]">
        <div className="bg-hero-action-card__media">
          {power ? <img src={power.image} alt="" decoding="async" className="bg-hero-action-card__image" /> : <Line className="bg-skeleton-fill" />}
        </div>
        <div className="min-w-0">
          <p className="bg-hero-action-card__title font-hs text-lg leading-tight text-[#3d2a1e]">{power ? power.name : <Line className="bg-skeleton-w-title" />}</p>
          <p className="bg-hero-action-card__text mt-2 text-sm leading-relaxed">
            {power?.text ?? <><Line /><Line className="bg-skeleton-w-short bg-skeleton-line--phone" /></>}
          </p>
          <LoadingBlock className="bg-hero-skeleton-pill mt-3" /><span hidden />
        </div>
      </div>
    </div>
  );
}

/** The art and facts header. With a teaser its known identity stays readable while the statistics load. */
function HeroReliquary({ teaser }: { teaser?: BattlegroundHeroTeaser }) {
  return (
    <section
      className={`bg-hero-reliquary relative overflow-hidden rounded-[28px] border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_18px_42px_rgba(61,42,30,0.1)] sm:p-5${teaser ? ' data-surface' : ''}`}
      aria-busy={teaser ? true : undefined}
      aria-hidden={teaser ? undefined : true}
    >
      <div className="bg-hero-reliquary__layout relative grid gap-5 lg:grid-cols-[220px_1fr]">
        <div className="flex justify-center lg:block">
          <div className="bg-hero-reliquary__portrait rounded-[26px] border border-[#d7b66a]/75 bg-[radial-gradient(circle_at_top,#fff7dc,transparent_55%),linear-gradient(180deg,#fffaf0,#eedcba)] p-3 shadow-[0_18px_34px_rgba(61,42,30,0.12)]">
            <div className="w-full max-w-[210px]">
              {teaser
                ? <img src={teaser.image} alt={teaser.name} decoding="async" className="w-full object-contain drop-shadow-[0_20px_22px_rgba(61,42,30,0.22)]" />
                : <LoadingBlock className="bg-hero-skeleton-portrait" />}
            </div>
          </div>
        </div>
        <div className="bg-hero-reliquary__identity min-w-0">
          <p className="bg-hero-reliquary__kicker font-hs text-xs uppercase tracking-[0.18em]">Поля сражений · герой</p>
          {teaser
            ? <h1 className="bg-hero-reliquary__title mt-2 font-hs text-4xl leading-tight text-[#3d2a1e] sm:text-5xl">{teaser.name}</h1>
            : <p className="bg-hero-reliquary__title mt-2 font-hs text-4xl leading-tight text-[#3d2a1e] sm:text-5xl"><Line className="bg-skeleton-w-name" /></p>}
          <div className="bg-hero-stat-grid mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4" aria-hidden="true">
            {STAT_LABELS.map((label, index) => (
              <div key={label} className={`bg-hero-stat-plaque rounded-2xl border p-3 ${index === 2 ? 'border-[#bfdbfe] bg-[#dbeafe]/88' : 'border-[#d7b66a]/65 bg-[#fff8ea]/92'}`}>
                <p className="text-[11px] uppercase">{label}</p>
                <p className={`font-hs ${index === 3 ? 'text-xl' : 'text-2xl'}`}><Line className="bg-skeleton-w-value" /></p>
              </div>
            ))}
          </div>
          <div className="bg-hero-media-grid mt-4" aria-hidden="true">
            {MEDIA_KICKERS.map((kicker, index) => (
              <HeroMediaCard key={kicker} kicker={kicker} gold={index === 2} power={index === 0 ? teaser?.heroPower : undefined} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const PROFILE_FACTS = [
  ['Раса', 'border-[#e2cf99] bg-[#fff9ed]', 'text-[#8b6c42]', 'text-base'],
  ['Художник', 'border-[#e2cf99] bg-[#fff9ed]', 'text-[#8b6c42]', 'text-base'],
  ['Броня соло', 'border-[#bfdbfe] bg-[#dbeafe]/80', 'text-[#1e3a8a]', 'text-xl'],
  ['Броня дуо', 'border-[#d6a74c] bg-[#fff2cf]', 'text-[#70450e]', 'text-xl'],
] as const;
const PATCH_NOTES = ['Обновлено', 'Тир героя', 'Среднее место', 'Выбор героя', 'Броня соло', 'Броня дуо'];
const PANEL = 'bg-hero-ledger-panel rounded-2xl border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_12px_28px_rgba(61,42,30,0.08)]';

/** Profile and patch ledgers: the rest of the first viewport below the header. */
function HeroLedgers() {
  return <>
    <section className={`${PANEL} grid gap-4 lg:grid-cols-[1fr_320px]`} aria-hidden="true">
      <div>
        <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">Профиль героя</p>
        <p className="font-hs text-2xl text-[#3d2a1e]">Кто это и откуда данные</p>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#5f4730]"><Line /><Line className="bg-skeleton-line--phone" /><Line className="bg-skeleton-w-short" /></p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {PROFILE_FACTS.map(([label, tone, ink, size]) => (
            <div key={label} className={`rounded-2xl border p-3 ${tone}`}>
              <p className={`text-xs font-bold uppercase tracking-[0.14em] ${ink}`}>{label}</p>
              <p className={`mt-1 font-black text-[#3d2a1e] ${size}`}><Line className="bg-skeleton-w-value" /></p>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-[#e2cf99] bg-[#fff9ed] p-3">
        <p className="font-hs text-sm uppercase tracking-[0.14em] text-[#8b6c42]">External links</p>
        <div className="mt-3 grid gap-2">
          {[0, 1].map(index => <LoadingBlock key={index} className="bg-hero-skeleton-link" />)}
        </div>
      </div>
    </section>
    <section className={PANEL} aria-hidden="true">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">Текущий патч</p>
          <p className="font-hs text-xl text-[#3d2a1e]">Изменения патча</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PATCH_NOTES.map(label => (
          <div key={label} className="rounded-2xl border border-[#e2cf99] bg-[#fff9ed] p-3 text-[#3d2a1e]">
            <p className="text-xs font-bold uppercase tracking-[0.12em]">{label}</p>
            <p className="mt-1 text-base font-black leading-tight"><Line className="bg-skeleton-w-value" /></p>
          </div>
        ))}
      </div>
    </section>
  </>;
}

/**
 * Hero page while its statistics load. A server teaser keeps the hero's name,
 * portrait and hero power on screen (dimmed and busy); only the numbers,
 * companions and ledgers are placeholders. The single status is the back
 * control's placeholder, outside the busy header; the panels stay direct
 * children of the page, as in the loaded view, so its section rules apply.
 */
export function BattlegroundHeroDetailSkeleton({ teaser }: { teaser?: BattlegroundHeroTeaser }) {
  return (
    <div className="bg-hero-detail-page bg-hero-skeleton space-y-6 text-[#3d2a1e]">
      <LoadingSurface label="Загружаем страницу героя" quiet layout="rows"
        className="bg-skeleton-back inline-flex items-center gap-2 rounded-md border border-[#d7b66a]/70 bg-[#fff7e6]/80 px-3 py-2 text-sm font-bold">
        <LoadingBlock className="bg-hero-skeleton-back__fill" />
      </LoadingSurface>
      <HeroReliquary teaser={teaser} />
      <HeroLedgers />
    </div>
  );
}

const HERO_SECTIONS = 2;
const HEROES_PER_SECTION = 6;

/** Hero rating while the first slice loads: tier sections with the real card grid. */
export function BattlegroundHeroListSkeleton() {
  return (
    <LoadingSurface label="Загружаем героев" quiet layout="rows" blocksClassName="bg-heroes-skeleton">
      {Array.from({ length: HERO_SECTIONS }, (_, section) => (
        <div key={section} className="rounded-lg border border-[#c4a46a]/35 bg-[#fff3d8]/65 p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-3">
            <LoadingBlock className="bg-skeleton-badge" />
            <div>
              <p className="font-hs text-lg text-[#3d2a1e]"><Line className="bg-skeleton-w-value" /></p>
              <p className="text-xs text-[#8b6c42]"><Line className="bg-skeleton-w-value" /></p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
            {Array.from({ length: HEROES_PER_SECTION }, (_, hero) => (
              <div key={hero} className="battleground-hero-card bg-heroes-skeleton__card relative flex min-h-[252px] flex-col items-center overflow-visible rounded-lg p-3 text-center">
                <div className="relative flex w-full justify-center overflow-visible">
                  <LoadingBlock className="battleground-hero-main bg-heroes-skeleton__portrait aspect-[3/4] w-full max-w-[184px]" />
                </div>
                <p className="mt-2 min-h-[2.2rem] font-hs text-sm leading-tight text-[#3d2a1e]"><Line className="bg-skeleton-w-title" /></p>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  <LoadingBlock className="bg-heroes-skeleton__metric" />
                  <LoadingBlock className="bg-heroes-skeleton__metric" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </LoadingSurface>
  );
}

/** A failed or timed-out Battlegrounds read, with the retry the page offers. */
export function BattlegroundLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <AsyncSurfaceState variant="error" title="Не удалось загрузить данные" message={message} actionLabel="Повторить" onAction={onRetry} />;
}
