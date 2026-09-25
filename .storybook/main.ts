import type { StorybookConfig } from '@storybook/react-vite';

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
  // Vite already serves and copies public/; a second copy can race during builds.
  docs: {
    autodocs: 'tag',
  },
  core: {
    disableWhatsNewNotifications: true,
  },
};

export default config;
