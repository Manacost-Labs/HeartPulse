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
const zilliax = { ...cards[2], id: 'TOY_330', dbfId: 102983, name: 'Зиллиакс Делюкс 3000', rarity: 'LEGENDARY', cost: 0 };
const etc = { ...cards[2], id: 'ETC_080', dbfId: 90749, name: 'E.T.C., менеджер группы', rarity: 'LEGENDARY' };
const modules = Array.from({ length: 8 }, (_, index) => ({ ...cards[2], id: `TOY_330t${92 + index}`, dbfId: 104944 + index,
  name: `Модуль ${index + 1}`, cost: index + 1, attack: 1, health: 2, image: svg(`Модуль ${index + 1}`) }));
const art = [{ ...zilliax, id: 'TOY_330t5', dbfId: 110440 }];
const bloodCard = { ...cards[0], id: 'DK_CARD', dbfId: 78338, name: 'Чары крови', classes: ['DEATHKNIGHT'] };
const tourist = { ...cards[0], id: 'VAC_424', dbfId: 107187, name: 'Райла', text: 'Турист-паладин', rarity: 'LEGENDARY' };
const guest = { ...cards[2], id: 'VAC_435', dbfId: 105679, name: 'Гостевой заклинатель', classes: ['PALADIN'], set: 'ISLAND_VACATION' };
const loadRules: NonNullable<DeckBuilderPorts['loadRules']> = async () => ({
  runes: { DK_CARD: { blood: 2, frost: 0, unholy: 0 } }, tourists: { VAC_424: 'PALADIN' },
});
const ports: DeckBuilderPorts = {
  encode: () => 'AAECAf0EAA==', limit: () => 30,
  label: (_kind, value) => ({ CORE: 'Основной набор', MINION: 'Существо', SPELL: 'Заклинание',
    BEAST: 'Зверь', FIRE: 'Огонь' })[value] || value,
  load: async query => ({ cards: cards.filter(card => card.name.toLowerCase().includes(query.query.toLowerCase())), total: 3, totalPages: 1,
    facets: { sets: ['CORE'], types: ['MINION', 'SPELL'], mechanics: ['TAUNT'], minionTypes: ['BEAST'], spellSchools: ['FIRE'] },
    mechanicTranslations: { TAUNT: 'Провокация' } }),
  render: fn(async () => ({ imageUrl: '/api/public-resource/deckview/static/generated/deck.jpg' })),
  download: fn(async () => {}),
};
const meta = { title: 'Constructed/DeckBuilder', component: DeckBuilderWorkbench,
  parameters: { layout: 'fullscreen' }, args: { ports },
  decorators: [Story => <div style={{ padding: 20, background: '#e5cc98', minHeight: '100vh' }}><Story /></div>],
} satisfies Meta<typeof DeckBuilderWorkbench>;
export default meta;
type Story = StoryObj<typeof meta>;
async function openDeck(canvas: { getByRole: (role: 'button', options: { name: RegExp }) => HTMLElement }) {
  if (window.innerWidth < 768) await userEvent.click(canvas.getByRole('button', { name: /^Колода ·/ }));
}

export const Empty: Story = {};
export const Filters: Story = {
  play: async ({ canvas }) => {
    await canvas.findByRole('option', { name: 'Основной набор' });
    await userEvent.selectOptions(canvas.getByLabelText('Дополнение'), 'CORE');
    await userEvent.click(canvas.getByRole('button', { name: 'Мана: 4' }));
    await userEvent.click(canvas.getByText('Ещё фильтры'));
    await userEvent.selectOptions(canvas.getByLabelText('Механика'), 'TAUNT');
    await expect(canvas.getByLabelText('Механика')).toHaveValue('TAUNT');
    await userEvent.click(canvas.getByRole('button', { name: 'Сбросить' }));
    await expect(canvas.getByLabelText('Дополнение')).toHaveValue('');
    await expect(canvas.getByRole('button', { name: 'Любая мана' })).toHaveAttribute('aria-pressed', 'true');
  },
};
export const FullDeck: Story = {
  args: { initial: { cards: Array.from({ length: 15 }, (_, index) => ({ ...cards[index % 3],
    dbfId: index + 20, rarity: 'COMMON', count: 2 })) } },
  play: async ({ canvas }) => {
    await openDeck(canvas);
    const save = await canvas.findByRole('button', { name: 'Сохранить картинку' });
    await expect(save.closest('.hp-builder-deck')?.getBoundingClientRect().height).toBeLessThanOrEqual(window.innerHeight);
    save.scrollIntoView({ block: 'center', behavior: 'instant' });
    await expect(save.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight);
  },
};
export const Selected: Story = {
  args: { initial: { cards: cards.map(card => ({ ...card, count: 1 })) } },
  play: async ({ canvas }) => {
    await openDeck(canvas);
    await userEvent.click(await canvas.findByRole('button', { name: 'Управление картой: Огненный шар' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Ещё копия: Огненный шар' }));
    await expect(canvas.getByLabelText('Карт в колоде: 4 из 30')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить картинку' }));
    await expect((await canvas.findAllByText('Картинка «Моя колода» сохранена')).some(element => element.checkVisibility())).toBe(true);
    await expect(ports.download).toHaveBeenCalled();
  },
};
export const DeckCode: Story = {
  args: { initial: { cards: cards.map(card => ({ ...card, count: 1 })) },
    ports: { ...ports, encode: () => 'AAECAf0E'.repeat(25) } },
  play: async ({ canvas }) => {
    await openDeck(canvas);
    await userEvent.click(await canvas.findByRole('button', { name: 'Код колоды' }));
    await expect(canvas.getByRole('dialog', { name: 'Код колоды' })).toBeVisible();
    await expect(canvas.getByLabelText('Код колоды для Hearthstone')).toHaveValue('AAECAf0E'.repeat(25));
  },
};
export const ZilliaxModules: Story = {
  args: { initial: { cards: [{ ...zilliax, count: 1 }] }, ports: { ...ports,
    loadConfiguration: async () => ({ kind: 'zilliax', modules, art, banned: [] }) } },
  play: async ({ canvas }) => {
    await openDeck(canvas);
    await userEvent.click(await canvas.findByRole('button', { name: `Настроить: ${zilliax.name}` }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Модуль: Модуль 1' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Модуль: Модуль 2' }));
    await expect(canvas.getByRole('button', { name: 'Модуль: Модуль 3' })).toBeDisabled();
    await openDeck(canvas);
    await expect(canvas.getByRole('button', { name: 'Сохранить картинку' })).toBeEnabled();
  },
};
export const EtcBand: Story = {
  args: { initial: { cards: [{ ...etc, count: 1 }] }, ports: { ...ports,
    loadConfiguration: async () => ({ kind: 'etc', modules: [], art: [], banned: ['ETC_080', 'TOY_330'] }) } },
  play: async ({ canvas }) => {
    await openDeck(canvas);
    await userEvent.click(await canvas.findByRole('button', { name: `Настроить: ${etc.name}` }));
    for (const card of cards) await userEvent.click(await canvas.findByRole('button', { name: `Добавить в E.T.C.: ${card.name}` }));
    await expect(canvas.getByText('Выберите 3 карты · 3/3')).toBeInTheDocument();
    await expect(canvas.getByLabelText('Карт в колоде: 1 из 30')).toBeInTheDocument();
  },
};
export const ConfigurationError: Story = {
  args: { initial: { cards: [{ ...zilliax, count: 1 }] }, ports: { ...ports,
    loadConfiguration: async () => { throw new Error('Fixture unavailable'); } } },
  play: async ({ canvas }) => {
    await openDeck(canvas);
    await userEvent.click(await canvas.findByRole('button', { name: `Настроить: ${zilliax.name}` }));
    await expect(await canvas.findByRole('button', { name: 'Повторить загрузку настроек' })).toBeVisible();
    await openDeck(canvas);
    await expect(canvas.getByRole('button', { name: 'Сохранить картинку' })).toBeDisabled();
  },
};
export const DeathKnightRunes: Story = {
  args: { initial: { heroClass: 'DEATHKNIGHT' }, ports: { ...ports, loadRules,
    load: async () => ({ cards: [bloodCard, cards[2]], total: 2, totalPages: 1 }) } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: `Добавить: ${bloodCard.name}` })).toBeDisabled();
    await userEvent.selectOptions(canvas.getByLabelText('Кровь'), '3');
    await expect(canvas.getByLabelText('Лёд')).toHaveValue('0');
    await userEvent.click(await canvas.findByRole('button', { name: `Добавить: ${bloodCard.name}` }));
    await expect(canvas.getByLabelText('Карт в колоде: 1 из 30')).toBeInTheDocument();
  },
};
export const TouristCards: Story = {
  args: { initial: { cards: [{ ...tourist, count: 1 }] }, ports: { ...ports, loadRules,
    load: async query => ({ cards: query.pool === 'tourist' ? [guest] : [tourist, cards[2]], total: 2, totalPages: 1 }) } },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByText('Ещё фильтры'));
    await userEvent.selectOptions(await canvas.findByRole('combobox', { name: 'Карты' }), 'tourist');
    await userEvent.click(await canvas.findByRole('button', { name: `Добавить: ${guest.name}` }));
    await openDeck(canvas);
    await expect(canvas.getByLabelText('Карт в колоде: 2 из 30')).toBeInTheDocument();
  },
};
export const RulesUnavailable: Story = {
  args: { initial: { heroClass: 'DEATHKNIGHT' }, ports: { ...ports,
    loadRules: async () => { throw new Error('Fixture unavailable'); },
    load: async () => ({ cards: [bloodCard], total: 1, totalPages: 1 }) } },
};
export const Loading: Story = { args: { ports: { ...ports, load: () => new Promise(() => {}) } } };
export const CatalogError: Story = { args: { ports: { ...ports, load: async () => { throw new Error('Unavailable'); } } } };
export const NoCards: Story = { args: { ports: { ...ports, load: async () => ({ cards: [], total: 0, totalPages: 1 }) } } };
export const RenderError: Story = {
  args: { initial: { cards: [{ ...cards[0], count: 1 }] }, ports: { ...ports, render: async () => { throw new Error('Unavailable'); } } },
  play: async ({ canvas }) => {
    await openDeck(canvas);
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить картинку' }));
    await expect(await canvas.findByText('Не удалось сохранить картинку. Попробуйте ещё раз.')).toBeInTheDocument();
  },
};
