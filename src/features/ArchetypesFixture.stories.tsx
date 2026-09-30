import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArchetypesDetailFixture, installArchetypesDetailFixtures } from '../../tests/fixtures/archetypes-detail-harness';
import { DeckBuilderFixture, installDeckBuilderFixtures } from '../../tests/fixtures/deck-builder-autoload-harness';

// Page-sized fixtures for `tests/archetypes-detail-browser.test.mjs`; the test
// picks the state through the query string. The test runs axe itself, so the
// accessibility add-on stays out of its way.
const meta = {
  title: 'Browser test fixtures/Administrator archetypes',
  parameters: { layout: 'fullscreen', fullPage: true, a11y: { test: 'off' } },
  tags: ['!autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ArchetypePage: Story = {
  beforeEach: installArchetypesDetailFixtures,
  render: () => <ArchetypesDetailFixture />,
};

export const DeckBuilder: Story = {
  beforeEach: installDeckBuilderFixtures,
  render: () => <DeckBuilderFixture />,
};
