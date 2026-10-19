import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { CosmeticsDetailSkeleton } from './CosmeticsDetailSkeleton';
const meta = {
  title: 'Cosmetics/Detail loading', component: CosmeticsDetailSkeleton, args: { kind: 'heroes' },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div className="route-parchment-page cosmetics-page" style={{ maxWidth: 1092, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><section className="cosmetics-surface"><Story /></section></div>],
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем предмет косметики');
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
  },
} satisfies Meta<typeof CosmeticsDetailSkeleton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Hero: Story = {};
export const Coin: Story = { args: { kind: 'coins' } };
export const Pet: Story = { args: { kind: 'pets' } };
