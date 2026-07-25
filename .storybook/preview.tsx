import type { Preview } from '@storybook/react-vite';

import '../src/index.css';
import './preview.css';

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
