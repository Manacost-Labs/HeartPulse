import type { ReactNode } from 'react';
import { preload } from 'react-dom';
import { ArrowDown, ArrowUp, ExternalLink, RefreshCw } from 'lucide-react';
import {
  patchExpansionCode, patchFeaturedArtwork, patchHeadline, patchHeroLead, patchKindShares,
  type PatchCardView, type PatchKindCounts, type PatchNotesDetail, type PatchView,
} from '../../modules/patchNotes/public';
import { cardArtSources, expansionBadge, heroPlate } from './patchArt';

/* The patch header: art, version, date, the patch's point in one line and one buff/nerf tally. */

const KIND_ROWS = [
  { kind: 'buff', label: 'усилений', Icon: ArrowUp },
  { kind: 'nerf', label: 'ослаблений', Icon: ArrowDown },
  { kind: 'rework', label: 'переработок', Icon: RefreshCw },
] as const;

const HERO_SIZES = '(min-width: 1480px) 1180px, 100vw';

/** Buff, nerf and rework shares as one bar; the numbers next to it carry the meaning, the bar is decoration. */
export function KindShareBar({ kinds, className = '' }: { kinds: PatchKindCounts; className?: string }) {
  const shares = patchKindShares(kinds);
  return (
    <span className={`hp-patch-share ${className}`} aria-hidden="true">
      {KIND_ROWS.map(({ kind }) => shares[kind] > 0 && <span key={kind} data-kind={kind} style={{ inlineSize: `${shares[kind]}%` }} />)}
    </span>
  );
}

/** The expansion glyph in a gold seal; a set without a glyph keeps the seal with its initial. */
export function ExpansionSeal({ code, size = 'large' }: { code: string; size?: 'large' | 'small' }) {
  const { label, glyph } = expansionBadge(code);
  return (
    <span className="hp-patch-seal" data-size={size} aria-hidden="true">
      {glyph ? <img src={glyph} alt="" width={72} height={72} loading={size === 'large' ? 'eager' : 'lazy'} decoding="async" />
        : <b>{label.replace(/^[^\p{L}]+/u, '').charAt(0)}</b>}
    </span>
  );
}

/** `versions` is the version switcher: the header shows the version only through it, so it is never said twice. */
export function PatchHero({ patch, view, date, highlights, versions }: {
  patch: PatchNotesDetail; view: PatchView; date: string | null; highlights: PatchCardView[]; versions: ReactNode;
}) {
  const lead = patchHeroLead(view);
  const plate = heroPlate(lead, view.sections[0]?.id);
  const featured = patchFeaturedArtwork([...highlights, ...view.groups.flatMap(group => group.entries)]);
  const art = featured ? cardArtSources(featured.url) : null;
  const expansion = patchExpansionCode(patch.version);
  const headline = patchHeadline(patch.title) ?? `Патч ${patch.version}`;
  // The plate leads the paint; React hoists this into <head> during the server render.
  preload(plate.src, { as: 'image', imageSrcSet: plate.srcSet, imageSizes: HERO_SIZES, fetchPriority: 'high' });
  return (
    <header className="hp-patch-hero" data-lead={lead ? ('mode' in lead ? lead.mode : lead.classKey) : undefined}>
      <img className="hp-patch-hero__plate" src={plate.src} srcSet={plate.srcSet} sizes={HERO_SIZES}
        width={plate.width} height={plate.height} style={{ objectPosition: plate.focus }}
        alt="" aria-hidden="true" decoding="async" fetchPriority="high" />
      {art && <img className="hp-patch-hero__art" src={art.src} srcSet={art.srcSet} sizes="(min-width: 960px) 380px, 55vw"
        alt="" aria-hidden="true" decoding="async" />}
      <div className="hp-patch-hero__content">
        {/* The page heading lives in the patch card: a tall route banner would push the changes below the fold. */}
        <h1 className="hp-patch-hero__kicker">Патчноуты Hearthstone</h1>
        <div className="hp-patch-hero__line">
          {versions}
          {date && <time dateTime={patch.publishedAt ?? undefined}>{date}</time>}
          {expansion && (
            <span className="hp-patch-hero__set"><ExpansionSeal code={expansion} size="small" />{expansionBadge(expansion).label}</span>
          )}
        </div>
        <h2 className="hp-patch-hero__title">{headline}</h2>
        {view.total > 0 && (
          <div className="hp-patch-hero__tally">
            <p className="hp-patch-hero__counts">
              <span data-kind="total"><b>{view.total}</b> изм.</span>
              {KIND_ROWS.filter(({ kind }) => view.kinds[kind] > 0).map(({ kind, label, Icon }) => (
                <span key={kind} data-kind={kind}><Icon aria-hidden="true" /><b>{view.kinds[kind]}</b> {label}</span>
              ))}
            </p>
            <KindShareBar kinds={view.kinds} />
          </div>
        )}
        {(patch.officialUrl || patch.sourceUrl) && (
          <p className="hp-patch-hero__links">
            {patch.sourceUrl && <a href={patch.sourceUrl} target="_blank" rel="noreferrer">hs-manacost.ru <ExternalLink aria-hidden="true" /></a>}
            {patch.officialUrl && <a href={patch.officialUrl} target="_blank" rel="noreferrer">Патчноут Blizzard <ExternalLink aria-hidden="true" /></a>}
          </p>
        )}
      </div>
    </header>
  );
}
