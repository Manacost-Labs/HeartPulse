import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { HomePageContent } from './HomePageContent';

const summary = { topClasses: [{ id: 'mage', name: 'Маг', winrate: 54 }], topCards: [], topLegendaries: [] };
const articles = [{ id: 'recovered', title: 'Свежая статья после загрузки', date: '2026-10-13', image: '',
  excerpt: 'Готовые разделы остаются на месте.', url: 'https://hearthpulse.net/articles/' }];
let read = fn<typeof fetch>();
let cancelled = 0;

const meta = {
  title: 'Home/First paint recovery',
  component: HomePageContent,
  args: { summary, articles, onNavigate: fn() },
  decorators: [Story => <div className="arena-app-home" style={{ maxWidth: 1120 }}><Story /></div>],
  beforeEach: ({ parameters }) => {
    const original = globalThis.fetch;
    cancelled = 0;
    read = fn<typeof fetch>((input, init) => {
      const path = String(input);
      if (path !== '/api/home/summary' && path !== '/api/articles') return original(input, init);
      return new Promise<Response>((resolve, reject) => {
        const abort = () => { cancelled++; clearTimeout(timer); reject(init?.signal?.reason); };
        const timer = setTimeout(() => {
          init?.signal?.removeEventListener('abort', abort);
          resolve(new Response(JSON.stringify(path === '/api/articles' ? { articles } : summary),
            { status: parameters.failHomeFeeds ? 503 : 200 }));
        }, 500);
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener('abort', abort, { once: true });
      });
    });
    globalThis.fetch = read;
    return () => { globalThis.fetch = original; };
  },
} satisfies Meta<typeof HomePageContent>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ServerPrepared: Story = {
  play: async ({ canvas, args }) => {
    await expect(await canvas.findByText(articles[0].title)).toBeVisible();
    await expect(read).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('link', { name: 'Открыть тир-лист' }));
    await expect(args.onNavigate).toHaveBeenCalledWith('tierlist');
  },
};
export const MissingArticles: Story = {
  args: { articles: null },
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByText(articles[0].title)).toBeVisible();
    await expect(read).toHaveBeenCalledTimes(1);
    const content = canvasElement.querySelector('[data-home-feed="articles"]');
    if (!content) throw new Error('Missing article board');
    await Promise.all(content.getAnimations().map(animation => animation.finished));
    await expect(getComputedStyle(content).opacity).toBe('1');
  },
};
export const MissingBothFeeds: Story = {
  args: { summary: null, articles: null },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(articles[0].title)).toBeVisible();
    await expect(await canvas.findByText('Маг')).toBeVisible();
    await expect(read).toHaveBeenCalledTimes(2);
  },
};
export const EmptyServerFeed: Story = {
  args: { articles: [] },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Новые публикации скоро появятся.')).toBeVisible();
    await expect(read).not.toHaveBeenCalled();
  },
};
export const FailedFeeds: Story = {
  args: { summary: null, articles: null },
  parameters: { failHomeFeeds: true },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Новые публикации скоро появятся.')).toBeVisible();
    await expect(read).toHaveBeenCalledTimes(2);
  },
};

function LeavingPreview(args: React.ComponentProps<typeof HomePageContent>) {
  const [home, setHome] = useState(true);
  return <>
    <button onClick={() => setHome(false)}>Открыть другую страницу</button>
    {home ? <HomePageContent {...args} summary={null} articles={null} /> : <h1>Другая страница</h1>}
  </>;
}
export const LeaveDuringLoading: Story = {
  render: args => <LeavingPreview {...args} />,
  play: async ({ canvas }) => {
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть другую страницу' }));
    await expect(canvas.getByRole('heading', { name: 'Другая страница' })).toBeVisible();
    await waitFor(() => expect(cancelled).toBe(2));
  },
};
