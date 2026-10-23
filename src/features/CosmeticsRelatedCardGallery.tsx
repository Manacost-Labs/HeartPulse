import { constructedCardPath } from '../modules/constructedCards/public';
import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import { useId } from 'react';
import { cachedCardImage } from './cosmeticsCardImage';

/**
 * Generated tokens (`DAL_366t3`, `SW_052t8_t`, `TIME_713t`) have no constructed
 * card page, so linking them would send readers and crawlers to a 404. Blizzard
 * marks every token with a `t<number>` suffix after the set prefix.
 */
export function hasConstructedCardPage(cardId: string): boolean {
  return !/t\d*(?:_t)?$/.test(cardId.slice(cardId.indexOf('_') + 1));
}

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
          const content = <>
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
          </>;
          if (!hasConstructedCardPage(card.cardId)) {
            return <div key={card.cardId} className="cosmetics-related-card" data-token="">{content}</div>;
          }
          const href = canonicalPagePath(constructedCardPath('wild', card.cardId));
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
              {content}
            </a>
          );
        })}
      </div>
    </section>
  );
}
