import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { PatchNotesDetail, PatchNotesEntry } from '../modules/patchNotes/public';
import { PatchNotesView } from './PatchNotesView';
import './PatchNotesView.css';
import { PatchNotesSkeleton } from './patchNotes/PatchNotesSkeleton';

const archive = (sha: string) => `https://api.kolodahearthstone.com/uploads/card-history-media/${sha}.png`;

const base: Omit<PatchNotesEntry, 'id' | 'name' | 'mode' | 'cardId' | 'changes'> = {
  sourceName: null, cardClass: null, cardType: null, renderUrl: null, artwork: null, format: null, archetypes: [], history: [],
  subtitle: null, note: null, beforeRenderUrl: null, afterRenderUrl: null,
};

// Pictures and values of 37.0.2 as the card history of the data API holds them.
const matriarch: PatchNotesEntry = {
  ...base, id: 'constructed-матриарх', name: 'Матриарх', mode: 'constructed', cardId: 'BE_036', cardClass: 'NEUTRAL', cardType: 'minion', format: 'standard',
  beforeRenderUrl: archive('f1d0a999db274d35cbe0007314c676ce0712b33fa8332c3d1ae4aaeab0224958'),
  afterRenderUrl: archive('9a947b36a7df4bb529a5e06e51ee2262d2f65663178fd88497aa15e7eb6bbfbc'),
  changes: [{ label: 'Стоимость', before: 9, after: 10, better: 'lower' }],
  note: 'Матриарх выходил слишком рано и слишком надёжно.',
};
const wrathguard: PatchNotesEntry = {
  ...base, id: 'battlegrounds-жертвенный-страж-гнева', name: 'Жертвенный страж гнева', mode: 'battlegrounds', cardId: 'BG36_362', cardType: 'minion',
  beforeRenderUrl: archive('6acc7c499a8c7fca0fd53930bcfed62888c7bcbb09b01ed6584017330b44e99f'),
  afterRenderUrl: archive('c5a1e1ead804ed3f8c173eec57e2bf43dc293d3abbd225de8e8af960f00e296e'),
  changes: [{ label: 'Атака', before: 5, after: 6, better: 'higher' }],
};
const tiered: PatchNotesEntry = {
  ...wrathguard, id: 'battlegrounds-алчная-гиена', name: 'Алчная гиена', cardId: 'BG21_009',
  changes: [{ label: 'Уровень таверны', before: 4, after: 5 }, { label: 'Атака', before: 5, after: 4, better: 'higher' }],
};
const trinket: PatchNotesEntry = {
  ...base, id: 'battlegrounds-малый-аксессуар-hammer', name: 'Молот Сумерек', sourceName: 'Hammer of Twilight', mode: 'battlegrounds',
  cardId: 'BG36_MagicItem_403', cardType: 'trinket', subtitle: 'Малый аксессуар', beforeRenderUrl: null, afterRenderUrl: null,
  changes: [{ label: 'Стоимость', before: 1, after: 2, better: 'lower' }],
};
const reworked: PatchNotesEntry = {
  ...base, id: 'constructed-змей', name: 'Змей ветреных вершин', mode: 'constructed', cardId: 'TLC_600', cardClass: 'WARRIOR', cardType: 'minion', format: 'standard',
  changes: [{ label: 'Текст', before: 'Боевой клич: наносит 5 ед. урона. Родня: стоит на (3) меньше.', after: 'Боевой клич: наносит 5 ед. урона. Родня: стоит на (2) меньше.' }],
};
const unknown: PatchNotesEntry = {
  ...base, id: 'constructed-неизвестная-карта', name: 'Карта вне каталога', mode: 'constructed',
  cardId: null, changes: [
    { label: 'Стоимость', before: 6, after: 5, better: 'lower' },
    { label: 'Текст', before: 'Уничтожает существо, а затем возрождает его с полным здоровьем.', after: 'Уничтожает нелегендарное существо, а затем возрождает его с полным здоровьем.' },
  ],
};

const latest: PatchNotesDetail = {
  version: '37.0.2', build: '37.0.2.254477', title: 'Обновление 37.0.2: балансные изменения Стандарта и Полей сражений',
  publishedAt: '2026-11-03T15:55:00+00:00', sourceUrl: 'https://hs-manacost.ru/', officialUrl: 'https://playhearthstone.com/',
  changeCount: 6, missingBefore: 0, summary: null, meta: null,
  entries: [matriarch, reworked, unknown, wrathguard, tiered, trinket],
  pictureSections: [],
  generalChanges: [{
    mode: 'battlegrounds',
    lines: ['Аберрации больше не встречаются в каждом матче.', 'Анимации нескольких Живых азеритов в игре теперь проигрываются как одна.'],
    marks: [{ line: 1, start: 20, end: 34, cardId: 'BG28_707', name: 'Живой азерит', renderUrl: null }],
  }],
};
const earlier: PatchNotesDetail = {
  ...latest, version: '37.0.0', build: '37.0.0.254477', title: 'Обновление 37.0', publishedAt: '2026-10-12T16:55:00+00:00',
  changeCount: 1, entries: [trinket], pictureSections: [], generalChanges: [], sourceUrl: null, officialUrl: null,
};

const meta = {
  title: 'Patch notes/Patch view',
  component: PatchNotesView,
  args: { patches: [latest, earlier] },
  decorators: [Story => <div style={{ padding: 16 }}><Story /></div>],
} satisfies Meta<typeof PatchNotesView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const BeforeAfter: Story = {
  parameters: { docs: { description: { story: 'The two newest patches. A changed card is the card before, the plates of what changed and the card after; a card without a picture pair is one current picture, a card the catalog does not know is a line of text. Archive pictures load through the site proxy, which Storybook does not have.' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('heading', { level: 2 }).map(item => item.textContent)).toEqual(['Патч 37.0.2', 'Патч 37.0.0']);
    const pair = canvas.getByRole('article', { name: 'Матриарх' });
    await expect(pair.dataset.variant).toBe('pair');
    await expect(within(pair).getByText('До')).toBeVisible();
    await expect(within(pair).getByText('После')).toBeVisible();
    await expect(within(pair).getByText('Мана')).toBeVisible();
    await expect(pair.textContent).toContain('было 9');
    await expect(pair.textContent).toContain('стало 10');
    await expect(canvas.getByRole('article', { name: 'Молот Сумерек' }).dataset.variant).toBe('single');
    await expect(canvas.getByRole('article', { name: 'Карта вне каталога' }).dataset.variant).toBe('line');
    await expect(canvas.getByText('Тир')).toBeVisible();
    await expect(canvas.getByRole('button', { name: /Живых азеритов/ })).toBeVisible();
    await expect(canvasElement.querySelectorAll('.hp-pc[data-variant="line"] ins').length).toBeGreaterThan(0);
    await expect(canvasElement.querySelector('.hp-pc[data-variant="pair"] .hp-plate__text')).toBeNull();
    await expect(canvas.getByText('Золото')).toBeVisible();
    await expect(canvasElement.querySelector('input, select, details, nav')).toBeNull();
  },
};

export const Phone: Story = {
  parameters: { docs: { description: { story: 'A phone keeps the card before and the card after side by side with the plates under them.' } } },
  decorators: [Story => <div style={{ width: 358 }}><Story /></div>],
  play: async ({ canvasElement }) => {
    const pair = canvasElement.querySelector<HTMLElement>('[data-variant="pair"]');
    await expect(pair).not.toBeNull();
    const [before, after] = [...(pair?.querySelectorAll('.hp-pc__fig') ?? [])].map(item => item.getBoundingClientRect());
    await expect(Math.abs(before.top - after.top)).toBeLessThan(2);
    await expect(before.right).toBeLessThan(after.left);
  },
};

export const Loading: Story = { render: () => <PatchNotesSkeleton /> };
