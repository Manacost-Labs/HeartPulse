import type { Meta, StoryObj } from '@storybook/react-vite';
import { installSoftPaywallFixtures, SoftPaywallFixture } from '../../tests/fixtures/soft-paywall-harness';

// A page-sized fixture for `tests/soft-paywall-browser.test.mjs`; the test
// picks the page and the access level through the query string. The test runs
// axe itself, so the accessibility add-on stays out of its way.
const meta = {
  title: 'Browser test fixtures/Soft paywall',
  component: SoftPaywallFixture,
  parameters: { layout: 'fullscreen', fullPage: true, a11y: { test: 'off' } },
  tags: ['!autodocs'],
  beforeEach: installSoftPaywallFixtures,
} satisfies Meta<typeof SoftPaywallFixture>;

export default meta;

export const Fixture: StoryObj<typeof meta> = {};
