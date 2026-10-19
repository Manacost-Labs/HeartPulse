import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import HomeLatestArticles from './HomeLatestArticles';
import './Home.css';

const image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="560" height="300"%3E%3Crect width="560" height="300" fill="%23784d30"/%3E%3C/svg%3E';
const articles = Array.from({ length: 3 }, (_, index) => ({ id: `home-sizing-${index}`, title: 'Новый сезон Hearthstone',
  date: `2026-10-${19 - index}`, image, excerpt: 'Новые карты, колоды и стратегии.', tag: 'Арена', url: 'https://hearthpulse.net/articles/' }));
const meta = {
  title: 'Home/Measured article loading', component: HomeLatestArticles,
  args: { articles, loading: false, onNavigate: fn() },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div className="arena-app-home" style={{ maxWidth: 1092, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><div className="home-modern home-workbench"><Story /></div></div>],
} satisfies Meta<typeof HomeLatestArticles>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = { play: async ({ canvas }) => { await expect(canvas.getAllByRole('link', { name: /Новый сезон Hearthstone/ })).toHaveLength(3); } };
export const LongText: Story = { args: { articles: articles.map(article => ({ ...article,
  title: 'Большой гайд по новому сезону Hearthstone: сильные классы, важные карты и стратегия игры',
  excerpt: 'Подробно разбираем карты нового дополнения, лучшие колоды и стратегии, которые помогут увереннее играть на Арене и в Стандарте.' })) } };
export const Loading: Story = { args: { loading: true, articles: [] }, play: async ({ canvas }) => {
  await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем последние статьи');
  await expect(canvas.getAllByRole('link')).toHaveLength(1);
  await expect(canvas.getByRole('status').closest('[aria-busy="true"]')).toBeNull();
} };
export const Refreshing: Story = { args: { loading: true }, play: async ({ canvas }) => {
  await expect(canvas.getAllByRole('link', { name: /Новый сезон Hearthstone/ })).toHaveLength(3);
  await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
} };
export const Empty: Story = { args: { articles: [] }, play: async ({ canvas }) => { await expect(canvas.getByRole('status')).toHaveTextContent('Новые публикации скоро появятся'); } };
