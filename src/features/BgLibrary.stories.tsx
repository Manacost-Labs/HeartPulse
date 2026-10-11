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
  in_pool: true, mechanics: [], images: {},
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
    await expect(canvas.queryByRole('button', { name: 'Сбросить всё' })).not.toBeInTheDocument();
  },
};
