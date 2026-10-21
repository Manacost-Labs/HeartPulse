import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { PatchNotesDetail, PatchNotesSummary } from '../modules/patchNotes/public';
import { PatchNotesView } from './PatchNotesView';

const patch: PatchNotesDetail = {
  version: '36.6.3', build: '36.6.3.253932', title: 'Обновление 36.6.3: балансные изменения Стандарта и Полей сражений',
  publishedAt: '2026-10-01T15:55:00+00:00', sourceUrl: 'https://hs-manacost.ru/', officialUrl: 'https://playhearthstone.com/',
  changeCount: 4, summary: null, missingBefore: 0,
  entries: [
    { id: 'serpent', name: 'Змей ветреных вершин', mode: 'constructed', cardId: 'TLC_600', cardClass: 'WARRIOR', subtitle: null,
      note: 'Родня срабатывала слишком рано.', changes: [{ label: 'Текст',
        before: 'Боевой клич: наносит 5 ед. урона. Вы получаете 5 ед. брони. Родня: стоит на (3) меньше.',
        after: 'Боевой клич: наносит 5 ед. урона. Вы получаете 5 ед. брони. Родня: стоит на (2) меньше.' }] },
    { id: 'seismopod', name: 'Сейсмопод', mode: 'constructed', cardId: null, cardClass: null, subtitle: null, note: null,
      changes: [{ label: 'Стоимость', before: 9, after: 8, better: 'lower' }, { label: 'Атака', before: 9, after: 8, better: 'higher' }] },
    { id: 'incense', name: 'Baleful Incense', mode: 'battlegrounds', cardId: null, cardClass: null, subtitle: 'Малый аксессуар', note: null,
      changes: [{ label: 'Стоимость', before: 4, after: 3, better: 'lower' }] },
    { id: 'reno', name: 'Рено Джексон', mode: 'battlegrounds', cardId: null, cardClass: null, subtitle: 'Броня героя', note: null,
      changes: [{ label: 'Броня, соло', before: 16, after: 12, better: 'higher' }, { label: 'Броня, дуэты', before: 14, after: 10, better: 'higher' }] },
  ],
};
const archive: PatchNotesSummary[] = [
  { version: '36.6.3', build: '36.6.3.253932', title: patch.title, publishedAt: patch.publishedAt, sourceUrl: null, officialUrl: null, changeCount: 59 },
  { version: '36.4.2', build: '36.4.2.251332', title: 'Обновление 36.4.2', publishedAt: '2026-09-04T00:48:51', sourceUrl: null, officialUrl: null, changeCount: 72 },
];

const meta = {
  title: 'Patch notes/Patch view',
  component: PatchNotesView,
  args: { patch, archive },
  decorators: [Story => <div style={{ padding: 16 }}><Story /></div>],
} satisfies Meta<typeof PatchNotesView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CardChanges: Story = {
  parameters: { docs: { description: { story: 'Was → now per card, buff or nerf only for numbers, class and mode sections, the archive beside it.' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('article')).toHaveLength(4);
    await userEvent.click(canvas.getByRole('button', { name: /Ослабления/ }));
    await expect(canvas.getAllByRole('article')).toHaveLength(1);
    await expect(canvas.getByRole('heading', { name: 'Рено Джексон' })).toBeVisible();
  },
};
export const OnlyNewValues: Story = {
  args: { patch: { ...patch, missingBefore: 1, entries: [{ ...patch.entries[0], changes: [{ label: 'Текст', after: 'Призывает древня 2/2.' }] }] } },
};
export const NoCardChanges: Story = { args: { patch: { ...patch, entries: [], changeCount: 0 } } };
