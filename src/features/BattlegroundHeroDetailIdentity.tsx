import React, { useState } from 'react';
import { ExternalLink, Maximize2 } from 'lucide-react';
import { bgDetailCardSources, bgDetailCardText } from './battlegroundHeroDetailMedia';
import { bgHeroArmorValue, bgHeroDescriptionRu, bgHeroRaceLabel } from './battlegroundHeroDetailText';
import type { BattlegroundHeroDetailCard, BattlegroundHeroDetailLibraryHero } from './battlegroundHeroDetailTypes';

export function BattlegroundHeroImage({
  sources,
  alt,
  className = '',
  imgClassName = '',
  fallback,
}: {
  sources: string[];
  alt: string;
  className?: string;
  imgClassName?: string;
  fallback?: React.ReactNode;
}) {
  const sourceKey = sources.join('|');
  const [imageState, setImageState] = useState(() => ({ sourceKey, srcIdx: 0 }));

  if (imageState.sourceKey !== sourceKey) {
    setImageState({ sourceKey, srcIdx: 0 });
  }

  const src = sources[imageState.srcIdx] || '';

  if (!src) return fallback ? <div className={className}>{fallback}</div> : null;

  return (
    <div className={className}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setImageState(current => ({ ...current, srcIdx: current.srcIdx + 1 }))}
        className={imgClassName}
      />
    </div>
  );
}

export function BattlegroundHeroMediaCard({
  title,
  card,
  tone = 'normal',
  onOpen,
}: {
  title: string;
  card: BattlegroundHeroDetailCard;
  tone?: 'normal' | 'gold';
  onOpen: () => void;
}) {
  const sources = bgDetailCardSources(card, tone);
  const text = bgDetailCardText(card, tone);
  if (!card || sources.length === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`bg-hero-action-card group rounded-2xl border p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f] ${
        tone === 'gold'
          ? 'bg-hero-action-card--gold border-[#d6a74c] bg-[linear-gradient(135deg,#fff2cf,#eed19c)]'
          : 'border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffdf8,#f8eed9)]'
      }`}
    >
      <div className="bg-hero-action-card__body grid items-start gap-3">
        <BattlegroundHeroImage
          sources={sources}
          alt={card.name || title}
          className="bg-hero-action-card__media"
          imgClassName="bg-hero-action-card__image"
        />
        <div className="min-w-0">
          <p className="bg-hero-action-card__kicker font-hs text-xs uppercase tracking-[0.16em]">{title}</p>
          <h3 className="bg-hero-action-card__title mt-1 font-hs text-lg leading-tight text-[#3d2a1e]">{card.name || title}</h3>
          {text && (
            <p className="bg-hero-action-card__text mt-1.5 text-sm leading-relaxed">
              {text}
            </p>
          )}
        </div>
      </div>
      <Maximize2 aria-hidden="true" className="bg-hero-action-card__zoom" />
    </button>
  );
}

/** Who the hero is, when the library knows it. Armor and links live in the header. */
export function BattlegroundHeroProfileInfo({ heroName, libraryHero }: { heroName: string; libraryHero: BattlegroundHeroDetailLibraryHero }) {
  const description = bgHeroDescriptionRu(heroName, libraryHero?.character?.description);
  const race = bgHeroRaceLabel(libraryHero?.race);
  const artist = String(libraryHero?.artist || '').trim();
  // A missing fact is left out instead of shown as «—»: an empty tile reads as a broken page.
  const facts = [
    { label: 'Раса', value: race },
    { label: 'Художник', value: artist },
  ].filter(fact => fact.value && fact.value !== '—');
  if (!description && facts.length === 0) return null;
  return (
    <section className="bg-hero-ledger-panel bg-hero-profile rounded-2xl border border-[#d7b66a]/65 p-4">
      <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">Профиль героя</p>
      <h2 className="font-hs text-2xl text-[#3d2a1e]">Кто это</h2>
      {description && <p className="bg-hero-profile__text mt-2 text-sm leading-7 text-[#5f4730]">{description}</p>}
      {facts.length > 0 && (
        <dl className="bg-hero-profile__facts mt-3">
          {facts.map(fact => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** Armor, the patch state and the reference links: one line of facts under the hero name. */
export function BattlegroundHeroFacts({ libraryHero, latestPatch, links }: {
  libraryHero: BattlegroundHeroDetailLibraryHero;
  latestPatch: string | null;
  links: Array<{ label: string; url: string }>;
}) {
  const solo = bgHeroArmorValue(libraryHero?.armor, 'normal');
  const duos = bgHeroArmorValue(libraryHero?.armor, 'duos');
  const armor = [solo !== '—' ? `${solo}` : '', duos !== '—' ? `дуо ${duos}` : ''].filter(Boolean).join(' · ');
  return (
    <ul className="bg-hero-facts" aria-label="Факты о герое">
      {armor && <li className="bg-hero-facts__item"><span>Броня</span> {armor}</li>}
      <li className="bg-hero-facts__item">
        {latestPatch
          ? <a href="#hero-patches">Последнее изменение: {latestPatch.replace(/^Патч/, 'патч')}</a>
          : 'Изменений баланса не было'}
      </li>
      {links.map(link => (
        <li key={link.url} className="bg-hero-facts__item bg-hero-facts__item--link">
          <a href={link.url} target="_blank" rel="noreferrer">
            {link.label} <ExternalLink aria-hidden="true" className="inline h-3.5 w-3.5" />
          </a>
        </li>
      ))}
    </ul>
  );
}
