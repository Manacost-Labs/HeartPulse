import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import BgLibrary from './BgLibrary';

const cards = [
  {
    card_id: 'BG36_110', dbf: 131718,
    name: { ru: 'Счастье', en: 'Joyous' },
    creature_type: { slug: 'aberration', name_ru: 'Аберрация' },
    attack: 2, health: 3,
  },
  {
    card_id: 'BG32_842', dbf: 120762,
    name: { ru: 'Зверь для проверки фильтра', en: 'Beast filter fixture' },
    creature_type: { slug: 'beast', name_ru: 'Зверь' },
    attack: 1, health: 1,
  },
].map(card => ({
  ...card, card_type: { slug: 'minion' }, tavern_tier: 1,
  in_pool: true, mechanics: [], images: { card: '/arena-logo-icon.webp?v=arena-legacy-20260629', golden: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 330"%3E%3Crect width="240" height="330" fill="%23b98536"/%3E%3C/svg%3E' },
}));

const meta = {
  title: 'Battlegrounds/Library',
  component: BgLibrary,
  args: { currentPath: '/library/minions', navigatePath: fn() },
  decorators: [Story => <div className="arena-app-battlegrounds"><Story /></div>],
  beforeEach: () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input), location.origin).pathname;
      if (path === '/api/bg/library/meta') {
        return Response.json({ creature_types: cards.map(card => card.creature_type) });
      }
      if (path === '/api/bg/library/cards') return Response.json({ data: cards });
      if (path === '/api/bg/library/cards/by-dbf/131718') return Response.json({ ...cards[0], tavern_tier: 4 });
      if (path === '/api/bg/library/minions/131718') return Response.json(null);
      return originalFetch(input, init);
    };
    return () => { globalThis.fetch = originalFetch; };
  },
} satisfies Meta<typeof BgLibrary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AberrationFilter: Story = {
  play: async ({ canvas, args }) => {
    const filter = await canvas.findByRole('button', { name: 'Аберрация' });
    await expect(canvas.getByText('2 найдено · 2 загружено')).toBeVisible();
    await expect(filter.querySelector('img')).toHaveAttribute('src', '/bg-legacy/assset/aberration.webp');
    await userEvent.click(filter);
    await expect(filter).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByText('1 найдено · 2 загружено')).toBeVisible();
    await expect(canvas.queryByRole('link', { name: /Зверь для проверки фильтра/ })).not.toBeInTheDocument();
    const card = canvas.getByRole('link', { name: /Открыть страницу карты Счастье/ });
    await userEvent.click(card);
    await expect(args.navigatePath).toHaveBeenCalledWith(expect.stringMatching(/^\/library\/minions\/.+-131718$/));
  },
};

export const CompactControls: Story = {
  play: async ({ canvas }) => {
    const filter = await canvas.findByRole('button', { name: 'Аберрация' });
    await userEvent.click(filter);
    await userEvent.type(canvas.getByRole('searchbox', { name: 'Поиск карт' }), 'Нет такой карты');
    await expect(canvas.getByText('По выбранным фильтрам ничего не найдено.')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Сбросить фильтры' }));
    await expect(canvas.getByRole('searchbox')).toHaveValue('');
    await expect(canvas.getByText('2 найдено · 2 загружено')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Аберрация' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(canvas.getByText('Дополнительно'));
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Показывать карты Duo' }));
    await userEvent.click(canvas.getByText('Дополнительно'));
    await expect(canvas.getByRole('button', { name: 'Убрать фильтр: Duo' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Убрать фильтр: Duo' }));
    const search = canvas.getByRole('searchbox', { name: 'Поиск карт' });
    await userEvent.type(search, 'Счастье');
    await userEvent.click(canvas.getByRole('button', { name: 'Очистить поиск' }));
    await expect(search).toHaveValue('');
    await expect(canvas.queryByRole('button', { name: 'Сбросить всё' })).not.toBeInTheDocument();
  },
};

export const LargeCatalog: Story = {
  args: { cacheScope: 'large-catalog-preview' },
  beforeEach: () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input), location.origin).pathname;
      if (path === '/api/bg/library/cards') return Response.json({ data: Array.from({ length: 120 }, (_, index) => ({
        ...cards[index % cards.length], dbf: 200000 + index, card_id: `BG_FIXTURE_${index}`,
        name: { ru: `Проверочная карта ${index + 1}`, en: `Catalog fixture ${index + 1}` },
      })) });
      return originalFetch(input, init);
    };
    return () => { globalThis.fetch = originalFetch; };
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('120 найдено · 120 загружено')).toBeVisible();
    await expect(canvas.getAllByRole('link', { name: /Открыть страницу карты/ })).toHaveLength(36);
  },
};

export const MinionDetail: Story = {
  args: { currentPath: '/library/minions/счастье-131718/' },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { level: 1, name: 'Счастье' })).toBeVisible();
    await expect(canvas.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await expect(canvas.getByRole('button', { name: 'Назад в библиотеку' })).toBeVisible();
  },
};
