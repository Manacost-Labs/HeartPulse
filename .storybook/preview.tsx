import '../src/features/StandardCards.styles';
import type { Preview } from '@storybook/react-vite';

import '../src/index.css';
import '../src/route-parchment.css';
import './preview.css';
import { installFieldFocusMode } from '../src/app/shell/installFieldFocusMode';

const disposeFieldFocusMode = installFieldFocusMode(document);
if (import.meta.hot && disposeFieldFocusMode) import.meta.hot.dispose(disposeFieldFocusMode);

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
    Story => (
      <main className="storybook-manacost-surface arena-app-shell">
        <Story />
      </main>
    ),
  ],
  tags: ['autodocs'],
};

export default preview;
