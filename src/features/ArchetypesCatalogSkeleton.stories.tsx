import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { ArchetypesCatalogSkeleton } from './ArchetypesCatalogSkeleton';
import { ConstructedArchetypesFixture, installConstructedArchetypeFixtures } from '../../tests/fixtures/constructed-archetypes-harness';
const meta = {
  title: 'Constructed/Archetype catalog loading', component: ArchetypesCatalogSkeleton,
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <section className="archetypes-page" style={{ maxWidth: 1092, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></section>],
  beforeEach: installConstructedArchetypeFixtures,
} satisfies Meta<typeof ArchetypesCatalogSkeleton>;
export default meta;
export const Loading: StoryObj<typeof meta> = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем архетипы');
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};
export const Ready: StoryObj<typeof meta> = {
  render: () => <ConstructedArchetypesFixture />,
  play: async ({ canvas }) => { await expect(await canvas.findByRole('heading', { name: 'Воровской Жрец' })).toBeVisible(); },
};
