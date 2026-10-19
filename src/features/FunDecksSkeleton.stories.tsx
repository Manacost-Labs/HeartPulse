import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { FunDecksSkeleton } from './FunDecksSkeleton';
const meta = {
  title: 'Constructed/Fun decks loading', component: FunDecksSkeleton,
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div className="fun-decks-page" style={{ maxWidth: 1092, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
} satisfies Meta<typeof FunDecksSkeleton>;
export default meta;
export const Loading: StoryObj<typeof meta> = { play: async ({ canvas }) => {
  await expect(canvas.getByRole('status')).toHaveTextContent('Собираем фан-колоды');
  await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
} };
