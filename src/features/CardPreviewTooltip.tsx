import { AnchoredImagePreview } from '../shared/ui/AnchoredImagePreview';
import { publicResourceUrl } from '../publicResourceUrl';
import './CardPreviewTooltip.css';

export type CardPreviewTarget = {
  id: string;
  name: string;
  imageUrl?: string | null;
  rect: DOMRect;
};

export function fallbackCardRender(id: string): string {
  return `/api/public-resource/hsjson/v1/render/latest/ruRU/512x/${encodeURIComponent(id)}.png`;
}

export default function CardPreviewTooltip({ preview }: { preview: CardPreviewTarget }) {
  const fallback = fallbackCardRender(preview.id);
  const preferredSource = publicResourceUrl(preview.imageUrl) || fallback;
  return (
    <AnchoredImagePreview
      key={`${preview.id}:${preferredSource}`}
      source={preferredSource}
      fallbackSource={fallback}
      name={preview.name}
      accessibleName={`Полная карта ${preview.name}`}
      anchorRect={preview.rect}
      previewId={preview.id}
      className="card-preview-tooltip"
      data-card-preview-id={preview.id}
    />
  );
}
