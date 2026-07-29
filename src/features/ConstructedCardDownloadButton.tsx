import React from 'react';
import { Download } from 'lucide-react';

type ConstructedCardDownloadButtonProps = {
  cardId: string;
  cardName: string;
  href: string;
};

export function constructedCardDownloadFilename(cardName: string, cardId: string): string {
  const safeName = cardName
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-|-$/g, '');
  const safeId = cardId.replace(/[^A-Za-z0-9_-]/g, '') || 'card';
  return `${safeName || 'Hearthstone-card'}-${safeId}.webp`;
}

export default function ConstructedCardDownloadButton({
  cardId,
  cardName,
  href,
}: ConstructedCardDownloadButtonProps) {
  const accessibleName = `Скачать карту «${cardName}» в полном качестве`;
  return (
    <a
      className="constructed-card-download"
      href={href}
      download={constructedCardDownloadFilename(cardName, cardId)}
      aria-label={accessibleName}
      title={accessibleName}
      onClick={event => event.stopPropagation()}
    >
      <Download size={16} aria-hidden="true" />
    </a>
  );
}
