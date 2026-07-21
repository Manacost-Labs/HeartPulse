import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import HsReplayDeckList, { type HsReplayDeckCard } from '../../src/features/HsReplayDeckList';

const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

function fullCardImage(name: string, index: number): string {
  const hue = (index * 31) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="716" viewBox="0 0 512 716">
    <rect width="512" height="716" rx="42" fill="hsl(${hue} 45% 22%)"/>
    <rect x="22" y="22" width="468" height="672" rx="34" fill="none" stroke="#e9c776" stroke-width="18"/>
    <text x="256" y="356" fill="#fff3c4" font-family="serif" font-size="34" text-anchor="middle">${name}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function makeCards(size: number, retryImage = false): HsReplayDeckCard[] {
  return Array.from({ length: size }, (_, index) => {
    const number = index + 1;
    const name = `Русская карта ${number}`;
    return {
      id: `MOBILE_TEST_${String(number).padStart(2, '0')}`,
      dbfId: 90_000 + number,
      name,
      cost: index % 11,
      rarity: index % 7 === 0 ? 'LEGENDARY' : 'COMMON',
      elite: index % 7 === 0,
      count: 1,
      image: pixel,
      cardImage: retryImage && number === 1 ? '/retry-card.png' : fullCardImage(name, number),
    };
  });
}

const params = new URLSearchParams(window.location.search);
const requestedSize = Number.parseInt(params.get('size') || '30', 10);
const size = requestedSize === 40 ? 40 : 30;
let previewLoadAttempts = 0;
let controllerLoadAttempts = 0;
const previewModuleLoader = params.get('previewChunk') === 'retry'
  ? async () => {
      previewLoadAttempts += 1;
      if (previewLoadAttempts === 1) throw new Error('Simulated optional preview chunk failure');
      return import('../../src/features/CardPreviewSheet');
    }
  : undefined;
const previewControllerLoader = params.get('controllerChunk') === 'retry'
  ? async () => {
      controllerLoadAttempts += 1;
      if (controllerLoadAttempts === 1) throw new Error('Simulated preview controller chunk failure');
      return import('../../src/features/HsReplayDeckPreviewController');
    }
  : undefined;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main>
      <h1>Проверка мобильного состава</h1>
      <HsReplayDeckList
        cards={makeCards(size, params.get('imageFailure') === 'retry')}
        label={`Состав из ${size} карт`}
        previewModuleLoader={previewModuleLoader}
        previewControllerLoader={previewControllerLoader}
      />
    </main>
  </StrictMode>,
);
