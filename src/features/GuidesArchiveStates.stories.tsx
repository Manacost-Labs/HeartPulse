import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import GuidesArchive, { type GuideDetailSeed } from './GuidesArchive';

/**
 * Loading states of the guide archive besides the measured first load:
 * a dimmed previous page while the next one loads, the request failure with
 * its retry, and a guide whose server teaser stays on screen while only its
 * body loads. `network` stories send the real request (a browser test holds
 * it to prove the deadline ends in the error state).
 */
type Mode = 'ready' | 'refresh' | 'fail' | 'hold' | 'network';

const seed: GuideDetailSeed = {
  title: 'Гайд по новому сезону Hearthstone', description: 'Подробный разбор колод и стратегий нового сезона.',
  image: null, publishedAt: '2026-10-19', kind: 'Гайд', menuName: 'Стандарт',
};
const page = (pageNumber: number) => ({
  page: pageNumber, limit: 18, total: 36, totalPages: 2, filters: { kinds: [{ slug: 'guide', label: 'Гайды', count: 36 }], menus: [] },
  items: Array.from({ length: 3 }, (_, index) => ({ id: pageNumber * 10 + index, slug: `guide-${pageNumber}-${index}`,
    title: `Большой гайд по колодам нового сезона Hearthstone, часть ${pageNumber * 10 + index}`,
    description: 'Как выбирать карты, строить колоду и побеждать в новом сезоне.',
    image: null, publishedAt: '2026-10-19', menuName: 'Стандартный режим', kind: 'Гайд', kindSlug: 'guide', oldUrl: null, menuCode: null })),
});
const detail = { ...seed, id: 1, slug: 'sizing-guide', kindSlug: 'guide', menuCode: null, oldUrl: null, keywords: null, replyCount: 0,
  sourceUrl: null, fallbackText: '', contentHtml: '<h2>Как играть</h2><p>Выбирайте карты с учётом кривой маны.</p>'.repeat(5) };

const meta = {
  title: 'Guides/Loading states', component: GuidesArchive,
  args: { currentPath: '/guides-archive', navigatePath: fn() },
  parameters: { layout: 'fullscreen', fullPage: true, mode: 'ready' satisfies Mode },
  decorators: [Story => <div className="arena-app-guides-archive" style={{ maxWidth: 1092, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
  beforeEach: ({ parameters }) => {
    const original = window.fetch;
    const mode = parameters.mode as Mode;
    let requests = 0;
    window.fetch = async (input, init) => {
      const url = String(input);
      if (!url.startsWith('/api/guides-archive') || mode === 'network') return original(input, init);
      requests += 1;
      if (mode === 'fail') return new Response('{}', { status: 500 });
      // The first answer arrives; the next request (another page) stays in flight.
      if (mode === 'hold' || (mode === 'refresh' && requests > 1)) return new Promise<Response>(() => {});
      if (url.startsWith('/api/guides-archive/')) return new Response(JSON.stringify(detail));
      return new Response(JSON.stringify(page(new URL(url, location.origin).searchParams.get('page') === '2' ? 2 : 1)));
    };
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof GuidesArchive>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Filter or page changes keep the previous grid, dimmed and aria-busy, until the new page arrives. */
export const Refreshing: Story = {
  parameters: { mode: 'refresh' },
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findAllByRole('link')).toHaveLength(3);
    await userEvent.click(canvas.getByRole('button', { name: /Вперед/ }));
    const grid = canvasElement.querySelector('.guide-archive-grid');
    await waitFor(() => expect(grid).toHaveAttribute('aria-busy', 'true'));
    await expect(grid).toHaveClass('data-surface');
    await expect(canvas.getAllByRole('link')).toHaveLength(3);
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
  },
};

/** The first load: the count is a placeholder, never «0 материалов». */
export const FirstLoad: Story = {
  parameters: { mode: 'hold' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем архив');
    await expect(canvas.queryByText(/материалов/)).not.toBeInTheDocument();
  },
};

export const LoadError: Story = {
  parameters: { mode: 'fail' },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Не удалось загрузить архив гайдов');
    await expect(canvas.getByRole('button', { name: 'Повторить' })).toBeEnabled();
    await expect(canvas.queryByText(/материалов/)).not.toBeInTheDocument();
  },
};

/** Access confirmed on a server-rendered teaser: its header stays, only the body waits. */
export const DetailSeeded: Story = {
  args: { currentPath: '/guides-archive/sizing-guide', detailSeed: seed },
  parameters: { mode: 'hold' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent(seed.title);
    await expect(canvas.getByText(seed.description)).toBeVisible();
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем гайд');
  },
};

export const DetailSeededReady: Story = {
  args: { currentPath: '/guides-archive/sizing-guide', detailSeed: seed },
  play: async ({ canvas }) => {
    await expect(await canvas.findAllByRole('heading', { name: 'Как играть', level: 2 })).toHaveLength(5);
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
  },
};

export const DetailError: Story = {
  args: { currentPath: '/guides-archive/sizing-guide', detailSeed: seed },
  parameters: { mode: 'fail' },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Не удалось загрузить гайд');
    await expect(canvas.getByRole('button', { name: 'Повторить' })).toBeEnabled();
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent(seed.title);
  },
};

/** Real requests, for the deadline browser test. */
export const Network: Story = { parameters: { mode: 'network' } };
export const DetailNetwork: Story = { args: { currentPath: '/guides-archive/sizing-guide', detailSeed: seed }, parameters: { mode: 'network' } };
