import { useState } from 'react';
import MediaLightbox, { type MediaLightboxItem } from './MediaLightbox';
import '../GlobalUtilityHeader.css';

const palette = ['#7a2b16', '#2f5d3a', '#2e4a7a', '#6a3a7a', '#8a6a1c', '#6a2a2a'];

/** A drawn picture: a coloured plate with its number, in a landscape or portrait shape. */
function plate(number: number, portrait: boolean, scale = 1): string {
  const [width, height] = (portrait ? [800, 1200] : [1600, 1000]).map(side => side * scale);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<rect width="${width}" height="${height}" fill="${palette[(number - 1) % palette.length]}"/>`
    + `<circle cx="${width / 2}" cy="${height / 2}" r="${height / 3}" fill="#e7b85b"/>`
    + `<text x="${width / 2}" y="${height / 2 + height / 12}" font-size="${height / 4}" text-anchor="middle" fill="#30251c">${number}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function fixtureItems(count: number): MediaLightboxItem[] {
  return Array.from({ length: count }, (_, position) => {
    const number = position + 1;
    const portrait = number % 3 === 0;
    return {
      id: `plate-${number}`,
      src: plate(number, portrait),
      thumb: plate(number, portrait, 0.2),
      alt: `Арт ${number}`,
      title: `Арт ${number}`,
      description: 'Иллюстрация для проверки просмотрщика.',
      meta: portrait ? '800 x 1200' : '1600 x 1000',
    };
  });
}

/**
 * A grid of thumbnails and the MediaLightbox they open (stories and
 * tests/media-lightbox-browser.test.mjs). `scrolledPage` puts the grid halfway
 * down a page taller than the screen, under the site's sticky header.
 */
export default function MediaLightboxFixture({ count = 6, scrolledPage = false }: { count?: number; scrolledPage?: boolean }) {
  const [index, setIndex] = useState(-1);
  const items = fixtureItems(count);
  return (
    <div style={{ padding: scrolledPage ? '0 0 1600px' : 24, minHeight: '100vh', background: '#f1e1bd' }}>
      {scrolledPage && <header className="global-utility-header"><div className="global-utility-header__inner">Шапка</div></header>}
      {scrolledPage && <div style={{ height: 1200 }} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {items.map((item, position) => (
          <button key={item.id} type="button" aria-label={`Открыть ${item.alt}`} data-lightbox-src={item.src}
            style={{ border: 0, padding: 0, background: 'none' }} onClick={() => setIndex(position)}>
            <img src={item.thumb ?? item.src} alt={item.alt} width={item.id.endsWith('3') || item.id.endsWith('6') ? 96 : 160} height={item.id.endsWith('3') || item.id.endsWith('6') ? 144 : 100} />
          </button>
        ))}
      </div>
      {index >= 0 && (
        <MediaLightbox
          items={items}
          index={index}
          onClose={() => setIndex(-1)}
          onIndexChange={setIndex}
          actions={<a className="media-lightbox__action" href={items[index].src} download>Скачать</a>}
        />
      )}
    </div>
  );
}
