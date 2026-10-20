import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import Cosmetics, { type CatalogPayload, type HeroSummary } from './Cosmetics';

/**
 * Loading states of the cosmetics catalog besides the measured first load:
 * the previous page stays on screen (dimmed, aria-busy) while the next one
 * loads, and a failed catalog or item request offers a retry. `Network`
 * stories send the real request (a browser test holds it to prove the
 * deadline ends in the error state).
 */
type Mode = 'refresh' | 'cache' | 'fail' | 'network';
const hero: HeroSummary = {
  cardId: 'HERO_11ai', dbf: 120228, name: { ru: 'Керриган-арахнид', en: null },
  class: { slug: 'deathknight', nameRu: 'Рыцарь смерти' }, rarity: { slug: 'mythic', nameRu: 'Мифический' },
  categorySlugs: [], images: { static: null, animated: null },
};
const catalog = (page: number): CatalogPayload => ({
  items: Array.from({ length: 12 }, (_, index) => ({ ...hero, cardId: `HERO_${page}_${index}` })),
  pagination: { page, perPage: 12, total: 24, totalPages: 2 }, updatedAt: '2026-10-19T12:00:00Z', source: 'HearthPulse',
});

const meta = {
  title: 'Cosmetics/Loading states', component: Cosmetics,
  args: { currentPath: '/cosmetics/heroes', navigatePath: fn(), initialSearch: '' },
  parameters: { layout: 'fullscreen', fullPage: true, mode: 'refresh' satisfies Mode },
  decorators: [Story => <div style={{ maxWidth: 1092, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
  beforeEach: ({ parameters }) => {
    const original = window.fetch;
    const mode = parameters.mode as Mode;
    let requests = 0;
    window.fetch = async (input, init) => {
      if (!String(input).startsWith('/api/cosmetics/') || mode === 'network') return original(input, init);
      requests += 1;
      if (mode === 'fail') return new Response('{"error":"Каталог временно недоступен"}', { status: 503 });
      // `refresh`: the first page arrives, the next stays in flight. `cache`: two
      // pages arrive, then the revalidation of the first stays in flight.
      if (requests > (mode === 'cache' ? 2 : 1)) return new Promise<Response>(() => {});
      return new Response(JSON.stringify(catalog(new URL(String(input), location.origin).searchParams.get('page') === '2' ? 2 : 1)));
    };
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof Cosmetics>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Refreshing: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /Вперёд/ }));
    const grid = canvasElement.querySelector('.cosmetics-grid');
    await waitFor(() => expect(grid).toHaveAttribute('aria-busy', 'true'));
    await expect(canvas.getAllByRole('link', { name: /Керриган-арахнид/ })).toHaveLength(12);
    await expect(canvasElement.querySelector('.loading-surface')).toBeNull();
  },
};

/** A page this visit already loaded shows at once from memory while it revalidates: no skeleton flash. */
export const CachedPage: Story = {
  parameters: { mode: 'cache' },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /Вперёд/ }));
    await canvas.findByText('Страница 2 из 2');
    await userEvent.click(await canvas.findByRole('button', { name: /Назад/ }));
    await expect(canvasElement.querySelector('.loading-surface')).toBeNull();
    await expect(canvasElement.querySelector('a[href*="/HERO_1_0"]')).not.toBeNull();
    await expect(canvasElement.querySelector('.cosmetics-grid')).toHaveAttribute('aria-busy', 'true');
  },
};

export const LoadError: Story = {
  parameters: { mode: 'fail' },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Каталог временно недоступен');
    await expect(canvas.getByRole('button', { name: 'Повторить' })).toBeEnabled();
    await expect(canvas.queryByText('Ничего не найдено')).not.toBeInTheDocument();
  },
};

export const DetailError: Story = {
  args: { currentPath: '/cosmetics/heroes/HERO_11ai' },
  parameters: { mode: 'fail' },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Не удалось загрузить страницу');
    await expect(canvas.getByRole('button', { name: 'Повторить' })).toBeEnabled();
  },
};

export const Network: Story = { parameters: { mode: 'network' } };
export const DetailNetwork: Story = { args: { currentPath: '/cosmetics/heroes/HERO_11ai' }, parameters: { mode: 'network' } };
