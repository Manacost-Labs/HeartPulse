import type { Meta, StoryObj } from '@storybook/react-vite';
import { HsReplayDeckFixture } from '../../tests/fixtures/hsreplay-deck-mobile-harness';
import { NestedDeckModalFixture } from '../../tests/fixtures/standard-meta-nested-modal-harness';

// Fixtures for `tests/hsreplay-deck-mobile-browser.test.mjs`; the test picks
// the deck size and the simulated failures through the query string. The test
// runs axe itself, so the accessibility add-on stays out of its way.
const meta = {
  title: 'Browser test fixtures/Deck list',
  parameters: { layout: 'fullscreen', fullPage: true, a11y: { test: 'off' } },
  tags: ['!autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const DeckList: Story = { render: () => <HsReplayDeckFixture /> };

export const NestedDeckModal: Story = { render: () => <NestedDeckModalFixture /> };
