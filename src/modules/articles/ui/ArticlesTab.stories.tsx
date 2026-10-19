import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { ArticlesTab } from './ArticlesTab';
import type { ArticlesData } from '../model/types';

const cover = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1176" height="597"%3E%3Crect width="1176" height="597" fill="%23784d30"/%3E%3C/svg%3E';
const data: ArticlesData = {
  updatedAt: '2026-10-19T10:00:00Z',
  articles: Array.from({ length: 3 }, (_, index) => ({
    id: `sizing-article-${index}`, date: '2026-10-19', image: cover,
    title: 'Как играть на Арене в новом сезоне: сильные классы, важные карты и стратегии для каждой колоды',
    excerpt: '', url: 'https://hearthpulse.net/articles/', tag: 'Арена', likes: 12, dislikes: 0,
  })),
};

const meta = {
  title: 'Articles/Measured loading geometry', component: ArticlesTab,
  args: { data, loading: false, onNavigate: fn() },
  parameters: { layout: 'fullscreen', fullPage: true },
  // Keep the public page's content width; the outer navigation is not part of a card.
  decorators: [Story => <div className="arena-app-shell arena-app-articles" style={{ maxWidth: '1092px', marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
} satisfies Meta<typeof ArticlesTab>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvas, args }) => {
    await expect(canvas.getAllByRole('article')).toHaveLength(3);
    await userEvent.click(canvas.getByRole('link', { name: 'Главная' }));
    await expect(args.onNavigate).toHaveBeenCalledWith('home');
  },
};
export const ShortHeadlines: Story = {
  ...Ready,
  args: { data: { ...data, articles: data.articles.map(article => ({ ...article, title: 'Новая мета Арены' })) } },
};
export const Loading: Story = {
  args: { loading: true, data: { articles: [], updatedAt: null } },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем статьи');
    await expect(canvas.queryByRole('article')).not.toBeInTheDocument();
    await expect(args.onNavigate).not.toHaveBeenCalled();
  },
};
export const Empty: Story = {
  args: { data: { articles: [], updatedAt: null } },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText('Статьи скоро появятся')).toBeVisible();
    await expect(canvas.queryByRole('article')).not.toBeInTheDocument();
    await expect(args.onNavigate).not.toHaveBeenCalled();
  },
};
