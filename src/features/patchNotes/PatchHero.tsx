import type { ReactNode } from 'react';
import { preload } from 'react-dom';
import { ExternalLink } from 'lucide-react';
import {
  patchDigest, patchExpansionCode, patchFeaturedArtwork, patchHeadline, patchHeroLead,
  type PatchCardView, type PatchDigestPart, type PatchNotesDetail, type PatchView,
} from '../../modules/patchNotes/public';
import { pluralRu } from '../../shared/text/pluralRu';
import { cardArtSources, expansionBadge, heroPlate } from './patchArt';
import { KIND_ICONS } from './patchKinds';

/* The patch header: art, version, date, title and "главное" — a line per section of what got worse, better or reworked. */

const KIND_FORMS = {
  buff: ['усиление', 'усиления', 'усилений'],
  nerf: ['ослабление', 'ослабления', 'ослаблений'],
  rework: ['переработка', 'переработки', 'переработок'],
} as const;

/** One kind of a digest line: its mark, then the cards of a short section or the count of a long one. */
function DigestPart({ part }: { part: PatchDigestPart }) {
  const Icon = KIND_ICONS[part.kind];
  const [one, few, many] = KIND_FORMS[part.kind];
  const word = pluralRu(part.count, one, few, many);
  return (
    <span className="hp-patch-hero__digest-part" data-kind={part.kind}>
      <Icon aria-hidden="true" />
      {part.names ? <><span className="sr-only">{word}: </span>{part.names.join(', ')}</> : <><b>{part.count}</b> {word}</>}
    </span>
  );
}

const HERO_SIZES = '(min-width: 1480px) 1180px, 100vw';

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
  const digest = patchDigest(view);
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
        {digest.length > 0 && (
          <ul className="hp-patch-hero__digest" aria-label="Главное">
            {digest.map(line => (
              <li key={line.section}>
                <b className="hp-patch-hero__digest-mode">{line.title}</b>
                {line.parts.map(part => <DigestPart key={part.kind} part={part} />)}
              </li>
            ))}
          </ul>
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
