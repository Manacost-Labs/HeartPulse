'use client';
import { memo, useState } from 'react';

function kolodaTileSource(value?: string | null): string {
  const source = typeof value === 'string' ? value : '';
  return source.startsWith('/api/public-resource/db/uploads/') ? source : '';
}

type TileProps = { name: string; cost: number; tile?: string | null; artwork?: string | null; rarity?: string | null };

function CardTileImage({ name, cost, tile, artwork, rarity }: TileProps) {
  const [failed, setFailed] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const tileSource = kolodaTileSource(tile);
  const artSource = kolodaTileSource(artwork);
  return <span className="constructed-catalog-tile" data-rarity={(rarity || 'common').trim().toLowerCase()}>
    {tileSource && !failed
      ? <img className="constructed-catalog-tile__image" src={tileSource} alt={name} width={320} height={64}
          loading="lazy" decoding="async" ref={image => { if (image?.complete && image.naturalWidth === 0) setFailed(true); }} onError={() => setFailed(true)} />
      : <span className="constructed-catalog-tile__fallback">
          {artSource && !artFailed && <img className="constructed-catalog-tile__art" src={artSource} alt="" loading="lazy" decoding="async" ref={image => { if (image?.complete && image.naturalWidth === 0) setArtFailed(true); }} onError={() => setArtFailed(true)} />}
          <b className="constructed-catalog-tile__mana">{cost}</b><span className="constructed-catalog-tile__name">{name}</span>
        </span>}
  </span>;
}

/** Uses Koloda's public tile, with a readable row when artwork is unavailable. */
export const ConstructedCardTile = memo(function ConstructedCardTile(props: TileProps) {
  return <CardTileImage key={`${props.tile ?? ''}:${props.artwork ?? ''}`} {...props} />;
});
