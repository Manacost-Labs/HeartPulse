import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ConstructedArchetypesFixture, installConstructedArchetypeFixtures,
} from '../../tests/fixtures/constructed-archetypes-harness';

// A page-sized fixture for `tests/constructed-archetypes-browser.test.mjs`; the
// test picks the format and the simulated render failure through the query string.
// The test runs axe itself, so the accessibility add-on stays out of its way.
const meta = {
  title: 'Browser test fixtures/Constructed archetypes',
  component: ConstructedArchetypesFixture,
  parameters: { layout: 'fullscreen', fullPage: true, a11y: { test: 'off' } },
  tags: ['!autodocs'],
  beforeEach: installConstructedArchetypeFixtures,
} satisfies Meta<typeof ConstructedArchetypesFixture>;

export default meta;

export const Fixture: StoryObj<typeof meta> = {};
