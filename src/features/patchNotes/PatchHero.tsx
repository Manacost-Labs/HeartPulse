import { preload } from 'react-dom';
import { ArrowDown, ArrowUp, ExternalLink, RefreshCw, ScrollText } from 'lucide-react';
import {
  patchExpansionCode, patchFeaturedArtwork, patchHeroLead, patchKindShares,
  type PatchCardView, type PatchKindCounts, type PatchNotesDetail, type PatchView,
} from '../../modules/patchNotes/public';
import { cardArtSources, expansionBadge, heroPlate } from './patchArt';

/* The patch's landing plate: expansion seal, version, lead art and the change count at a glance. */

const KIND_ROWS = [
  { kind: 'buff', label: 'Усиления', Icon: ArrowUp },
  { kind: 'nerf', label: 'Ослабления', Icon: ArrowDown },
  { kind: 'rework', label: 'Изменения', Icon: RefreshCw },
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

export function PatchHero({ patch, view, date, highlights }: {
  patch: PatchNotesDetail; view: PatchView; date: string | null; highlights: PatchCardView[];
}) {
  const lead = patchHeroLead(view);
  const plate = heroPlate(lead, view.sections[0]?.id);
  const featured = patchFeaturedArtwork([...highlights, ...view.groups.flatMap(group => group.entries)]);
  const art = featured ? cardArtSources(featured.url) : null;
  const expansion = patchExpansionCode(patch.version);
  // The plate leads the paint; React hoists this into <head> during the server render.
  preload(plate.src, { as: 'image', imageSrcSet: plate.srcSet, imageSizes: HERO_SIZES, fetchPriority: 'high' });
  return (
    <header className="hp-patch-hero" data-lead={lead ? ('mode' in lead ? lead.mode : lead.classKey) : undefined}>
      <img className="hp-patch-hero__plate" src={plate.src} srcSet={plate.srcSet} sizes={HERO_SIZES}
        width={plate.width} height={plate.height} style={{ objectPosition: plate.focus }}
        alt="" aria-hidden="true" decoding="async" fetchPriority="high" />
      {art && featured && (
        <figure className="hp-patch-hero__art">
          <img src={art.src} srcSet={art.srcSet} sizes="(min-width: 960px) 380px, 55vw" alt="" decoding="async" />
          <figcaption>Арт: {featured.card.name}</figcaption>
        </figure>
      )}
      <div className="hp-patch-hero__content">
        {/* The page heading lives in the patch card: a tall route banner would push the changes below the fold. */}
        <div className="hp-patch-hero__eyebrow">
          <h1>Патчноуты Hearthstone</h1>
          <span>Патч {patch.version}</span>
          {date && <time dateTime={patch.publishedAt ?? undefined}>{date}</time>}
        </div>
        {expansion && (
          <p className="hp-patch-hero__set">
            <ExpansionSeal code={expansion} />
            <span><small>Цикл дополнения</small>{expansionBadge(expansion).label}</span>
          </p>
        )}
        <h2 className="hp-patch-hero__title">{patch.title}</h2>
        {patch.summary && <p className="hp-patch-hero__lead">{patch.summary}</p>}
        {view.total > 0 && (
          <div className="hp-patch-hero__tally">
            <dl className="hp-patch-hero__stats">
              <div data-kind="total"><dt><ScrollText aria-hidden="true" />Изменений карт</dt><dd>{view.total}</dd></div>
              {KIND_ROWS.map(({ kind, label, Icon }) => (
                <div key={kind} data-kind={kind}><dt><Icon aria-hidden="true" />{label}</dt><dd>{view.kinds[kind]}</dd></div>
              ))}
            </dl>
            <KindShareBar kinds={view.kinds} />
          </div>
        )}
        {(patch.officialUrl || patch.sourceUrl) && (
          <p className="hp-patch-hero__links">
            {patch.officialUrl && <a href={patch.officialUrl} target="_blank" rel="noreferrer">Официальный патчноут Blizzard <ExternalLink aria-hidden="true" /></a>}
            {patch.sourceUrl && <a href={patch.sourceUrl} target="_blank" rel="noreferrer">Статья на hs-manacost.ru <ExternalLink aria-hidden="true" /></a>}
          </p>
        )}
      </div>
    </header>
  );
}
