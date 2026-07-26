import { useId } from 'react';
import { cachedCardImage } from './cosmeticsCardImage';

export type RelatedCard = {
  cardId: string;
  dbf: number | null;
  name: { ru: string; en: string | null };
};

export function RelatedCardGallery({
  title,
  items,
  navigatePath,
  imageOrigin = '',
}: {
  title: string;
  items: RelatedCard[];
  navigatePath?: (path: string) => void;
  imageOrigin?: string;
}) {
  const titleId = useId();
  if (!items.length) return null;

  return (
    <section className="cosmetics-related" aria-labelledby={titleId}>
      <header className="cosmetics-related__header">
        <h3 id={titleId}>{title}</h3>
        <span className="cosmetics-count">{items.length}</span>
      </header>
      <div className="cosmetics-related-gallery">
        {items.map(card => {
          const href = `/standard/cards/wild/${encodeURIComponent(card.cardId)}`;
          return (
            <a
              key={card.cardId}
              href={href}
              className="cosmetics-related-card"
              onClick={navigatePath ? (event) => {
                event.preventDefault();
                navigatePath(href);
              } : undefined}
            >
              <img
                src={`${imageOrigin}${cachedCardImage(card.cardId)}`}
                alt={`Карта «${card.name.ru}»`}
                loading="lazy"
                decoding="async"
                width="512"
                height="768"
              />
              <strong>{card.name.ru}</strong>
              <small>{card.cardId}</small>
            </a>
          );
        })}
      </div>
    </section>
  );
}
