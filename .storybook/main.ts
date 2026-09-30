import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    {
      name: '@storybook/addon-mcp',
      options: {
        toolsets: {
          test: false,
        },
      },
    },
  ],
  framework: '@storybook/react-vite',
  // Vite is only Storybook's bundler; the site itself is built by Next.js. The
  // React plugin gives stories Fast Refresh, Tailwind compiles the utilities,
  // and the release constant is the one a local Next.js build uses.
  viteFinal: config => mergeConfig(config, {
    plugins: [react(), tailwindcss()],
    define: { __APP_RELEASE_SHA__: JSON.stringify('development') },
  }),
  // Vite already serves and copies public/; a second copy can race during builds.
  docs: {
    autodocs: 'tag',
  },
  core: {
    disableWhatsNewNotifications: true,
  },
};

export default config;
