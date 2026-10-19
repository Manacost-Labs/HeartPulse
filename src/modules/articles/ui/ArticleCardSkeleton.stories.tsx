import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { LoadingSurface } from '../../../shared/ui/LoadingSurface';
import { ArticleCardSkeleton } from './ArticleCardSkeleton';

const meta = {
  title: 'Articles/Card skeleton', component: ArticleCardSkeleton,
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div className="arena-app-shell arena-app-articles" style={{ width: 'min(100%, 382px)', padding: '24px' }}>
    <LoadingSurface label="Загружаем статью" quiet layout="rows"><Story /></LoadingSurface>
  </div>],
} satisfies Meta<typeof ArticleCardSkeleton>;
export default meta;

export const Card: StoryObj<typeof meta> = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем статью');
    await expect(canvas.queryByRole('article')).not.toBeInTheDocument();
  },
};
