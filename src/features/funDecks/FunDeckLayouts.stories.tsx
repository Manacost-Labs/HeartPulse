import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import FunDecksPage from '../FunDecksPage';
import fixture from './funDeckLayouts.fixture.json';

/**
 * The three deck views of the fun-decks page on real lists: Mech Rogue with
 * a built Zilliax and the E.T.C. band, a 40-card Questline Shaman and a
 * Standard Rainbow DK. The selection and every deck list come from the
 * fixture; card art requests go to the site as usual.
 */
const resolved = fixture.resolved as Record<string, Record<string, unknown>>;

const meta = {
  title: 'Constructed/Fun deck layouts',
  component: FunDecksPage,
  args: { hasFullAccess: true, initialPreview: null },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div style={{ maxWidth: 1200, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
  beforeEach: () => {
    const original = window.fetch;
    try { window.localStorage.removeItem('hp:fun-decks:layout'); } catch { /* storage may be blocked */ }
    window.fetch = (input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname === '/api/fun-decks') return Promise.resolve(Response.json(fixture.funDecks));
      if (url.pathname === '/api/deck/resolve') {
        const deck = resolved[url.searchParams.get('code') ?? ''];
        return Promise.resolve(deck ? Response.json({ ok: true, ...deck }) : Response.json({ error: 'Нет колоды' }, { status: 404 }));
      }
      return original(input, init);
    };
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof FunDecksPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tiles: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: 'Плитки' })).toHaveAttribute('aria-pressed', 'true');
    const zilliax = await canvas.findByRole('link', { name: '4 маны · Зиллиакс Делюкс 3000' });
    await expect(zilliax).toHaveAttribute('href', '/standard/cards/wild/TOY_330/');
    await expect(canvas.getByRole('img', { name: '2 маны · Аварийный модуль' })).toBeInTheDocument();
  },
};

export const Rows: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Строки' }));
    await expect(canvas.getByRole('button', { name: 'Строки' })).toHaveAttribute('aria-pressed', 'true');
    await expect(await canvas.findAllByRole('img', { name: /^Кривая маны/ })).toHaveLength(3);
  },
};

export const Images: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Картинки' }));
    await expect(canvas.getByRole('button', { name: 'Картинки' })).toHaveAttribute('aria-pressed', 'true');
  },
};
