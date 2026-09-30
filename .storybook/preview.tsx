// The stylesheets load in the order of the Next.js layout: `index.css` declares
// the Tailwind cascade layers first. A stylesheet with `@layer utilities` ahead
// of it would put utilities below the base reset, and every `p-3` would be 0.
import '../src/index.css';
import '../src/parchment-theme.css';
import '../src/features/StandardCards.styles';
import '../src/route-parchment.css';
import './preview.css';
import type { Preview } from '@storybook/react-vite';
import { sb } from 'storybook/test';

sb.mock(import('../src/features/constructedCardListPrefetch.ts'), { spy: true });
sb.mock(import('../src/features/constructedCardDetailPrefetch.ts'), { spy: true });

import { installFieldFocusMode } from '../src/app/shell/installFieldFocusMode';

const disposeFieldFocusMode = installFieldFocusMode(document);
if (import.meta.hot) import.meta.hot.dispose(disposeFieldFocusMode);

const preview: Preview = {
  parameters: {
    a11y: {
      test: 'error',
    },
    backgrounds: {
      options: {
        parchment: {
          name: 'Manacost parchment',
          value: '#f6e5bd',
        },
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'padded',
  },
  initialGlobals: {
    backgrounds: {
      value: 'parchment',
    },
  },
  decorators: [
    (Story, context) => {
      if (!context.parameters.fullPage) {
        return (
          <main className="storybook-manacost-surface arena-app-shell">
            <Story />
          </main>
        );
      }
      // A full page sits in the application root, as in the Next.js layout: modal
      // surfaces and the page tour make `#root` inert while they are open. A docs
      // page shows several stories at once, so only the story view carries the id.
      return context.viewMode === 'story' ? <div id="root"><Story /></div> : <Story />;
    },
  ],
  tags: ['autodocs'],
};

export default preview;
