import React, { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import MediaLightbox, { type MediaLightboxItem } from '../components/ModalSurface/MediaLightbox';
import { fallbackCardImageElementToOrigin } from '../config/publicAssetDelivery';
import type { ConstructedCardMediaItem } from './constructedCardMedia';

type ConstructedCardLightboxProps = {
  items: ConstructedCardMediaItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

/** The media of a card page (its renders, variants and art) in the shared MediaLightbox. */
export default function ConstructedCardLightbox({ items, index, onClose, onIndexChange }: ConstructedCardLightboxProps) {
  const mediaItems = useMemo<MediaLightboxItem[]>(() => items.map(item => ({
    id: `${item.id}:${item.url}`,
    kind: item.kind,
    src: item.url,
    thumb: item.thumbnailUrl,
    alt: item.label,
    title: item.label,
    description: item.description,
  })), [items]);
  const sourceUrl = items[index]?.sourceUrl;

  return (
    <MediaLightbox
      items={mediaItems}
      index={index}
      onClose={onClose}
      onIndexChange={onIndexChange}
      onImageError={event => { fallbackCardImageElementToOrigin(event.currentTarget); }}
      actions={sourceUrl ? <a href={sourceUrl} className="media-lightbox__action" target="_blank" rel="noreferrer">Источник <ExternalLink size={15} aria-hidden="true" /></a> : null}
    />
  );
}
