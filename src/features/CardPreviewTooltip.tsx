import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { publicResourceUrl } from '../publicResourceUrl';
import './CardPreviewTooltip.css';

export type CardPreviewTarget = {
  id: string;
  name: string;
  imageUrl?: string | null;
  rect: DOMRect;
};

const TOOLTIP_WIDTH = 248;
const TOOLTIP_HEIGHT = 350;
const TOOLTIP_GAP = 10;

export function fallbackCardRender(id: string): string {
  return `/api/public-resource/hsjson/v1/render/latest/ruRU/512x/${encodeURIComponent(id)}.png`;
}

export default function CardPreviewTooltip({ preview }: { preview: CardPreviewTarget }) {
  const fallback = fallbackCardRender(preview.id);
  const [source, setSource] = useState(publicResourceUrl(preview.imageUrl) || fallback);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setSource(publicResourceUrl(preview.imageUrl) || fallback);
    setImageFailed(false);
  }, [fallback, preview.imageUrl]);
  if (typeof document === 'undefined') return null;
  if (imageFailed) return null;

  const canOpenRight = preview.rect.right + TOOLTIP_GAP + TOOLTIP_WIDTH <= window.innerWidth - TOOLTIP_GAP;
  const left = canOpenRight
    ? preview.rect.right + TOOLTIP_GAP
    : Math.max(TOOLTIP_GAP, preview.rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP);
  const top = Math.max(
    TOOLTIP_GAP,
    Math.min(preview.rect.top + preview.rect.height / 2 - TOOLTIP_HEIGHT / 2, window.innerHeight - TOOLTIP_HEIGHT - TOOLTIP_GAP),
  );

  return createPortal(
    <aside
      className="card-preview-tooltip"
      style={{ left, top, width: TOOLTIP_WIDTH }}
      role="tooltip"
      aria-label={`Полная карта ${preview.name}`}
      data-card-preview-id={preview.id}
    >
      <img
        src={source}
        alt={preview.name}
        onError={() => {
          if (source !== fallback) setSource(fallback);
          else setImageFailed(true);
        }}
      />
    </aside>,
    document.body,
  );
}
