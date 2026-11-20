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

/** A subscriber's list: the three fixture decks repeated under other codes, so there are more than the old first page of six. */
function manyDecks() {
  const decks = Array.from({ length: 9 }, (_, index) => {
    const deck = fixture.funDecks.decks[index % fixture.funDecks.decks.length];
    return { ...deck, title: `${deck.title}${index >= 3 ? ` ${Math.floor(index / 3) + 1}` : ''}`, deckCode: `${deck.deckCode}~${index}` };
  });
  return { ...fixture.funDecks, stats: { total: decks.length, standard: 3, wild: 6 }, decks };
}

/** An off-meta deck, a pinned one and one with the longest labels, to see the chips line up in every view. */
function kindDecks() {
  const [first, second, third] = fixture.funDecks.decks;
  const decks = [
    { ...first, kind: 'off_meta', pinned: true, why: ['Офф-мета', 'Концепт', 'Далеко от меты'], tags: ['offmeta', 'concept'] },
    { ...second, kind: 'off_meta', why: ['Офф-мета', 'Забытый архетип'], tags: ['offmeta'] },
    { ...third, pinned: true, title: 'Очень длинное название колоды про необычную идею', why: ['Пакет: Йогг-Сарон', 'Хайлендер', 'Далеко от меты'], tags: ['concept'] },
  ];
  return { ...fixture.funDecks, decks };
}

const meta = {
  title: 'Constructed/Fun deck layouts',
  component: FunDecksPage,
  args: { initialPreview: null },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div style={{ maxWidth: 1200, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
  beforeEach: ({ args }) => {
    const original = window.fetch;
    const many = Boolean((args as { manyDecks?: boolean }).manyDecks);
    const kinds = Boolean((args as { kinds?: boolean }).kinds);
    try { window.localStorage.removeItem('hp:deck-layout'); window.localStorage.removeItem('hp:fun-decks:layout'); } catch { /* storage may be blocked */ }
    window.fetch = (input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname === '/api/fun-decks') return Promise.resolve(Response.json(many ? manyDecks() : kinds ? kindDecks() : fixture.funDecks));
      if (url.pathname === '/api/deck/resolve') {
        ((window as unknown as { __funDeckResolves?: string[] }).__funDeckResolves ??= []).push(url.searchParams.get('code') ?? '');
        const code = (url.searchParams.get('code') ?? '').replace(/~\d+$/, '');
        const deck = resolved[code];
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

/** A subscriber sees every deck of the filter at once, with no «Показать ещё». */
export const AllDecks: Story = {
  args: { manyDecks: true } as never,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('9 колод')).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: /Показать ещё/ })).toBeNull();
    await expect(canvas.getAllByRole('article')).toHaveLength(9);
  },
};

/** Off-meta and pinned decks keep the same chips and head height as the others. */
export const OffMetaAndPinned: Story = {
  args: { kinds: true } as never,
  play: async ({ canvas }) => {
    await expect((await canvas.findAllByText('Офф-мета', { selector: 'li' })).length).toBeGreaterThan(0);
  },
};
