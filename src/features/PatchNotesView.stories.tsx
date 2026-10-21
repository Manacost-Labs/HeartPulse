import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { PatchNotesDetail, PatchNotesEntry, PatchNotesSummary } from '../modules/patchNotes/public';
import { PatchNotesView } from './PatchNotesView';

const trinket = (id: string, name: string, sourceName: string, subtitle: string, before: number, after: number): PatchNotesEntry => ({
  id, name, sourceName, mode: 'battlegrounds', cardId: id, cardClass: null, cardType: 'trinket', renderUrl: null, subtitle, note: null,
  changes: [{ label: 'Стоимость', before, after, better: 'lower' }],
});

// Values copied from the 36.6.3 article and the Battlegrounds catalog.
const patch: PatchNotesDetail = {
  version: '36.6.3', build: '36.6.3.253932', title: 'Обновление 36.6.3: балансные изменения Стандарта и Полей сражений',
  publishedAt: '2026-10-01T15:55:00+00:00', sourceUrl: 'https://hs-manacost.ru/', officialUrl: 'https://playhearthstone.com/',
  changeCount: 6, missingBefore: 0,
  summary: 'Обновление Hearthstone 36.6.3, выход которого состоялся 1 октября, включает в себя ряд изменений для Стандарта и Полей сражений.',
  entries: [
    { id: 'serpent', name: 'Змей ветреных вершин', sourceName: null, mode: 'constructed', cardId: 'TLC_600', cardClass: 'WARRIOR',
      cardType: 'minion', renderUrl: null, subtitle: null, note: null, changes: [{ label: 'Текст',
        before: 'Боевой клич: наносит 5 ед. урона. Вы получаете 5 ед. брони. Родня: стоит на (3) меньше.',
        after: 'Боевой клич: наносит 5 ед. урона. Вы получаете 5 ед. брони. Родня: стоит на (2) меньше.' }] },
    { id: 'pantry', name: 'Заражение кладовой', sourceName: null, mode: 'constructed', cardId: 'JAIL_200', cardClass: 'DRUID',
      cardType: 'spell', renderUrl: null, subtitle: null, note: null,
      changes: [{ label: 'Текст', before: 'Призывает двух случайных существ за (3).', after: 'Призывает двух случайных существ за (2).' }] },
    trinket('BG36_MagicItem_403', 'Молот Сумерек', 'Hammer of Twilight', 'Малый аксессуар', 1, 2),
    trinket('BG36_MagicItem_400', 'Изображение оскверненной монетки', 'Corrupted Coin Portrait', 'Малый аксессуар', 0, 3),
    trinket('BG30_MagicItem_924', 'Пойло из Пиратской Бухты', 'Booty Bay Brew', 'Малый аксессуар', 3, 2),
    trinket('BG36_MagicItem_403t', 'Молот Сумерек', 'Hammer of Twilight', 'Большой аксессуар', 1, 3),
  ],
  pictureSections: [
    { mode: 'battlegrounds', title: 'ИЗМЕНЕНИЯ СУЩЕСТВ' }, { mode: 'battlegrounds', title: 'ИЗМЕНЕНИЯ ЗАКЛИНАНИЙ ТАВЕРНЫ' },
  ],
  generalChanges: [{ mode: 'battlegrounds', lines: ['Аберрации больше не встречаются в каждом матче.'] }],
};
const archive: PatchNotesSummary[] = [
  { version: '37.0.0', build: '37.0.0.254477', title: 'Обновление 37.0', publishedAt: '2026-10-12T16:55:00+00:00', sourceUrl: null, officialUrl: null, changeCount: 1 },
  { version: '36.6.3', build: '36.6.3.253932', title: patch.title, publishedAt: patch.publishedAt, sourceUrl: null, officialUrl: null, changeCount: 59 },
  { version: '36.4.2', build: '36.4.2.251332', title: 'Обновление 36.4.2', publishedAt: '2026-09-04T00:48:51', sourceUrl: null, officialUrl: null, changeCount: 72 },
];

const meta = {
  title: 'Patch notes/Patch view',
  component: PatchNotesView,
  args: { patch, archive, onSelectVersion: fn() },
  decorators: [Story => <div style={{ padding: 16 }}><Story /></div>],
} satisfies Meta<typeof PatchNotesView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CardChanges: Story = {
  parameters: { docs: { description: { story: 'Header with counts by kind and mode, filters, compact cards with was → now, picture-only sections and the archive.' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('article')).toHaveLength(6);
    await userEvent.click(canvas.getByRole('button', { name: /^Ослабления/ }));
    await expect(canvas.getAllByRole('article')).toHaveLength(3);
    await userEvent.click(canvas.getByRole('button', { name: /^Все \d/ }));
    await userEvent.type(canvas.getByRole('searchbox'), 'booty');
    await expect(canvas.getAllByRole('article')).toHaveLength(1);
    await expect(canvas.getByRole('heading', { name: 'Пойло из Пиратской Бухты' })).toBeVisible();
  },
};
export const BattlegroundsOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(within(canvas.getByRole('group', { name: 'Режим' })).getByRole('button', { name: /^Поля сражений/ }));
    await expect(canvas.getAllByRole('article')).toHaveLength(4);
    await expect(canvas.getByText(/в статье только картинками/)).toBeVisible();
  },
};
export const PhoneVersionPicker: Story = {
  parameters: { docs: { description: { story: 'Below 960 px of content width the archive becomes a version select in the header.' } } },
  decorators: [Story => <div style={{ width: 380 }}><Story /></div>],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('navigation', { name: 'Архив патчей' })).toBeNull();
    await userEvent.selectOptions(canvas.getByLabelText('Версия'), '36.4.2');
    await expect(args.onSelectVersion).toHaveBeenCalledWith('/standard/patches/?version=36.4.2');
    await userEvent.selectOptions(canvas.getByLabelText('Версия'), '37.0.0');
    await expect(args.onSelectVersion).toHaveBeenLastCalledWith('/standard/patches/');
  },
};
export const OnlyNewValues: Story = {
  args: { patch: { ...patch, missingBefore: 1, pictureSections: [], generalChanges: [],
    entries: [{ ...patch.entries[0], changes: [{ label: 'Текст', after: 'Призывает древня 2/2 с Насмешкой.' }] }] } },
};
export const NoCardChanges: Story = { args: { patch: { ...patch, entries: [], changeCount: 0, pictureSections: [], generalChanges: [] } } };
