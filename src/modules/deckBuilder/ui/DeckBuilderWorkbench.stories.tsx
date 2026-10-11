import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { DeckBuilderWorkbench } from './DeckBuilderWorkbench';
import type { BuilderCard } from '../model/selection';
import type { DeckBuilderPorts } from '../useDeckBuilder';
import '../public.css';

const svg = (name: string, tile = false) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${tile ? 320 : 180}" height="${tile ? 64 : 250}" viewBox="0 0 ${tile ? 320 : 180} ${tile ? 64 : 250}"><rect width="100%" height="100%" rx="8" fill="#4b3524"/><rect x="6" y="6" width="${tile ? 308 : 168}" height="${tile ? 52 : 238}" rx="6" fill="#805b36" stroke="#ebc476"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="serif" font-size="16" fill="#fff2d1">${name}</text></svg>`)}`;
const cards: BuilderCard[] = [
  { id: 'EX1_001', dbfId: 1, name: 'Огненный шар', cost: 4, rarity: 'COMMON', classes: ['MAGE'], image: svg('Огненный шар'), tile: svg('4 · Огненный шар', true) },
  { id: 'EX1_002', dbfId: 2, name: 'Изисет', cost: 7, rarity: 'LEGENDARY', classes: ['MAGE'], image: svg('Изисет'), tile: svg('7 · Изисет ★', true) },
  { id: 'EX1_003', dbfId: 3, name: 'Речной кроколиск', cost: 2, rarity: 'COMMON', classes: ['NEUTRAL'], image: svg('Речной кроколиск'), tile: svg('2 · Речной кроколиск', true) },
];
const ports: DeckBuilderPorts = {
  encode: () => 'AAECAf0EAA==', limit: () => 30,
  load: async query => ({ cards: cards.filter(card => card.name.toLowerCase().includes(query.query.toLowerCase())), total: 3, totalPages: 1 }),
  render: fn(async () => ({ imageUrl: '/api/public-resource/deckview/static/generated/deck.jpg' })),
  download: fn(async () => {}),
};
const meta = { title: 'Constructed/DeckBuilder', component: DeckBuilderWorkbench,
  parameters: { layout: 'fullscreen' }, args: { ports },
  decorators: [Story => <div style={{ padding: 20, background: '#e5cc98', minHeight: '100vh' }}><Story /></div>],
} satisfies Meta<typeof DeckBuilderWorkbench>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Selected: Story = {
  args: { initial: { cards: cards.map(card => ({ ...card, count: 1 })) } },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Ещё копия: Огненный шар' }));
    await expect(canvas.getByLabelText('Карт в колоде: 4 из 30')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить картинку' }));
    await expect(await canvas.findByText('Картинка «Моя колода» сохранена')).toBeInTheDocument();
    await expect(ports.download).toHaveBeenCalled();
  },
};
export const Loading: Story = { args: { ports: { ...ports, load: () => new Promise(() => {}) } } };
export const CatalogError: Story = { args: { ports: { ...ports, load: async () => { throw new Error('Unavailable'); } } } };
export const NoCards: Story = { args: { ports: { ...ports, load: async () => ({ cards: [], total: 0, totalPages: 1 }) } } };
export const RenderError: Story = {
  args: { initial: { cards: [{ ...cards[0], count: 1 }] }, ports: { ...ports, render: async () => { throw new Error('Unavailable'); } } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить картинку' }));
    await expect(await canvas.findByText('Не удалось сохранить картинку. Попробуйте ещё раз.')).toBeInTheDocument();
  },
};
