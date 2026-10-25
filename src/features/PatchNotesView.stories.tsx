import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { PatchNotesDetail, PatchNotesEntry, PatchNotesSummary } from '../modules/patchNotes/public';
import { PatchNotesView } from './PatchNotesView';

const trinket = (id: string, name: string, sourceName: string, subtitle: string, before: number, after: number): PatchNotesEntry => ({
  id, name, sourceName, mode: 'battlegrounds', cardId: id, cardClass: null, cardType: 'trinket', renderUrl: null, artwork: null, format: null, archetypes: [], history: [], subtitle, note: null,
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
      cardType: 'minion', renderUrl: null, artwork: null, format: 'standard', subtitle: null, history: [],
      archetypes: [
        { format: 'standard', slug: 'std-dragon-warrior', name: 'Воин на драконах', classKey: 'warrior', popularity: 3.1, decks: 12, totalDecks: 12 },
        { format: 'standard', slug: 'dragon-pirate-warrior', name: 'Пиратский воин на драконах', classKey: 'warrior', popularity: 0.3, decks: 2, totalDecks: 2 },
      ], note: null, changes: [{ label: 'Текст',
        before: 'Боевой клич: наносит 5 ед. урона. Вы получаете 5 ед. брони. Родня: стоит на (3) меньше.',
        after: 'Боевой клич: наносит 5 ед. урона. Вы получаете 5 ед. брони. Родня: стоит на (2) меньше.' }] },
    { id: 'pantry', name: 'Заражение кладовой', sourceName: null, mode: 'constructed', cardId: 'JAIL_200', cardClass: 'DRUID',
      cardType: 'spell', renderUrl: null, artwork: null, format: 'standard', archetypes: [], history: [], subtitle: null, note: null,
      changes: [{ label: 'Текст', before: 'Призывает двух случайных существ за (3).', after: 'Призывает двух случайных существ за (2).' }] },
    trinket('BG36_MagicItem_403', 'Молот Сумерек', 'Hammer of Twilight', 'Малый аксессуар', 1, 2),
    trinket('BG36_MagicItem_400', 'Изображение оскверненной монетки', 'Corrupted Coin Portrait', 'Малый аксессуар', 0, 3),
    { ...trinket('BG30_MagicItem_924', 'Пойло из Пиратской Бухты', 'Booty Bay Brew', 'Малый аксессуар', 3, 2),
      history: [{ version: '36.0.3', entryId: 'battlegrounds-малый-аксессуар-booty-bay-brew', publishedAt: '2026-07-21T21:29:08' }] },
    trinket('BG36_MagicItem_403t', 'Молот Сумерек', 'Hammer of Twilight', 'Большой аксессуар', 1, 3),
  ],
  pictureSections: [
    { mode: 'battlegrounds', title: 'ИЗМЕНЕНИЯ СУЩЕСТВ' }, { mode: 'battlegrounds', title: 'ИЗМЕНЕНИЯ ЗАКЛИНАНИЙ ТАВЕРНЫ' },
  ],
  generalChanges: [{ mode: 'battlegrounds', lines: ['Аберрации больше не встречаются в каждом матче.'] }],
  meta: { day: '2026-09-30', period: 'black_empire', updatedAt: '2026-09-30T20:00:02Z', formats: ['standard'], missing: ['wild'] },
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
  parameters: { docs: { description: { story: 'Header with one tally, one sticky bar of modes, class/type, search and kind, and cards with only the render, the name and was → now. A short patch has no highlight cards: they would repeat the cards below.' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const listed = () => canvasElement.querySelectorAll('.hp-patch-section article');
    await expect(canvas.getByRole('heading', { level: 2, name: 'Балансные изменения Стандарта и Полей сражений' })).toBeVisible();
    // Six changes are read whole: "Главное" keeps only the cards → archetypes flow.
    await expect(canvasElement.querySelector('.hp-patch-highlights__list')).toBeNull();
    await expect(listed()).toHaveLength(6);
    await userEvent.click(canvas.getByRole('button', { name: /^Только ослабления/ }));
    await expect(canvas.getAllByRole('article')).toHaveLength(3);
    await userEvent.click(canvas.getByRole('button', { name: 'Все' }));
    await userEvent.type(canvas.getByRole('searchbox'), 'booty');
    await expect(canvas.getAllByRole('article')).toHaveLength(1);
    await expect(canvas.getByRole('heading', { name: /Пойло из Пиратской Бухты/ })).toBeVisible();
  },
};

export const CardDetailsAndFilters: Story = {
  parameters: { docs: { description: { story: 'The type, English name, archetypes and history of a card wait behind its "…"; the class/type select filters to one group; the empty filter state offers a reset.' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const serpent = canvas.getByRole('article', { name: /Змей ветреных вершин/ });
    await expect(within(serpent).queryByRole('link', { name: /Воин на драконах/ })).not.toBeVisible();
    await userEvent.click(within(serpent).getByLabelText('Подробнее: Змей ветреных вершин'));
    await expect(within(serpent).getByRole('link', { name: /Воин на драконах/ })).toHaveAttribute('href', '/standard/archetypes/standard/std-dragon-warrior/');
    await expect(canvas.getByText(/Вольный: данные сейчас недоступны/)).toBeInTheDocument();
    const brew = canvas.getByRole('article', { name: /Пойло из Пиратской Бухты/ });
    await userEvent.click(within(brew).getByLabelText(/^Подробнее/));
    await expect(within(brew).getByRole('link', { name: '36.0.3' })).toHaveAttribute('href',
      '/standard/patches/?version=36.0.3#card-battlegrounds-малый-аксессуар-booty-bay-brew');
    await userEvent.selectOptions(canvas.getByLabelText('Класс или тип карт'), 'Большой аксессуар · 1');
    await expect(canvasElement.querySelectorAll('.hp-patch-section article')).toHaveLength(1);
    await userEvent.type(canvas.getByRole('searchbox'), 'нет такой карты');
    await expect(canvas.getByText('Под эти фильтры не попало ни одно изменение.')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Сбросить фильтры' }));
    await expect(canvasElement.querySelectorAll('.hp-patch-section article')).toHaveLength(6);
  },
};

export const CollapsedSection: Story = {
  parameters: { docs: { description: { story: 'Section banners fold; a mode link in the bar opens a folded section again.' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const section = canvasElement.querySelector<HTMLDetailsElement>('#hp-patch-section-battlegrounds');
    // The opened section fades in; visibility is asserted after that short animation.
    await waitFor(() => expect(canvas.getByText(/в статье только картинками/)).toBeVisible());
    await userEvent.click(canvas.getByRole('heading', { name: /^Поля сражений/ }));
    await expect(section?.open).toBe(false);
    await userEvent.click(within(canvas.getByRole('navigation', { name: 'Разделы патча' })).getByRole('link', { name: /^Поля сражений/ }));
    await expect(section?.open).toBe(true);
  },
};

export const PhoneVersionPicker: Story = {
  parameters: { docs: { description: { story: 'On narrow content the header art becomes a top band and only the search and kind row sticks. Arrows go to the neighbouring patches, the select to any of them.' } } },
  decorators: [Story => <div style={{ width: 380 }}><Story /></div>],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const switcher = canvas.getByRole('navigation', { name: 'Версии патча' });
    await expect(within(switcher).getByRole('link', { name: /новый патч 37\.0\.0/ })).toHaveAttribute('href', '/standard/patches/');
    await userEvent.selectOptions(within(switcher).getByLabelText('Версия патча'), '36.4.2');
    await expect(args.onSelectVersion).toHaveBeenCalledWith('/standard/patches/?version=36.4.2');
  },
};

export const OnlyNewValues: Story = {
  args: { patch: { ...patch, missingBefore: 1, pictureSections: [], generalChanges: [],
    entries: [{ ...patch.entries[0], changes: [{ label: 'Текст', after: 'Призывает древня 2/2 с Насмешкой.' }] }] } },
};
export const NoCardChanges: Story = { args: { patch: { ...patch, entries: [], changeCount: 0, pictureSections: [], generalChanges: [], meta: null } } };

// A real wiki full art shipped with the site stands in for catalog art, which Storybook cannot proxy.
const wideArt = { url: '/archetype-art/void-soul-dh.webp', width: 1200, height: 1602 };
const standardCard = (id: string, name: string, cardClass: string, before: number, after: number): PatchNotesEntry => ({
  id, name, sourceName: null, mode: 'constructed', cardId: id, cardClass, cardType: 'minion', renderUrl: null, artwork: wideArt,
  format: 'standard', archetypes: [], history: [], subtitle: null, note: null,
  changes: [{ label: 'Стоимость', before, after, better: 'lower' }, { label: 'Здоровье', before: 3, after: 4, better: 'higher' }],
});

export const ConstructedLead: Story = {
  parameters: { docs: { description: { story: 'A Standard-led patch: the most changed class leads the header art; four highlights share one quiet panel (render beside the name and the change); costs read as mana gems.' } } },
  args: { patch: { ...patch, version: '35.4.2', entries: [
    standardCard('A1', 'Первая карта', 'DEMONHUNTER', 3, 2), standardCard('A2', 'Вторая карта', 'DEMONHUNTER', 5, 4),
    standardCard('A3', 'Третья карта', 'MAGE', 2, 3), standardCard('A4', 'Четвёртая карта', 'DEMONHUNTER', 4, 3),
    standardCard('A5', 'Пятая карта', 'MAGE', 6, 5), standardCard('A6', 'Шестая карта', 'MAGE', 7, 6),
    standardCard('A7', 'Седьмая карта', 'DEMONHUNTER', 1, 2),
    // Two trinkets make a short section, read whole below, so every highlight is a Standard card with art.
    ...patch.entries.slice(2, 4),
  ], pictureSections: [], generalChanges: [] } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.hp-patch-hero__plate')?.getAttribute('src')).toBe('/archetype-art/classes/demonhunter-1920.webp');
    await expect(within(canvasElement).getByText('Катаклизм')).toBeVisible();
    await expect(canvasElement.querySelectorAll('.hp-patch-highlights__list .hp-patch-card[data-featured]')).toHaveLength(4);
    await expect(canvasElement.querySelectorAll('.hp-change[data-stat="mana"] .hp-stat').length).toBeGreaterThan(0);
  },
};

const costUp = (id: string, name: string): PatchNotesEntry => ({
  ...standardCard(id, name, 'DEMONHUNTER', 4, 5), changes: [{ label: 'Стоимость', before: 4, after: 5, better: 'lower' }],
});

export const LongGroupByKind: Story = {
  parameters: { docs: { description: { story: 'A group of six or more rows with mixed kinds reads nerfs, buffs, then reworks, each kind named once above its rows; the rows drop their own mark. A mode shown only as pictures in the article is one line of the source note, not a section.' } } },
  args: { patch: { ...patch, version: '35.4.2', entries: [
    standardCard('B1', 'Первая карта', 'DEMONHUNTER', 3, 2), costUp('B2', 'Вторая карта'),
    standardCard('B3', 'Третья карта', 'DEMONHUNTER', 2, 1), costUp('B4', 'Четвёртая карта'),
    standardCard('B5', 'Пятая карта', 'DEMONHUNTER', 6, 5),
    { ...standardCard('B6', 'Шестая карта', 'DEMONHUNTER', 1, 1), changes: [{ label: 'Текст', before: 'Наносит 2 ед. урона.', after: 'Наносит 3 ед. урона.' }] },
  ], pictureSections: [{ mode: 'arena', title: 'Изменения Арены' }], generalChanges: [] } },
  play: async ({ canvasElement }) => {
    const group = canvasElement.querySelector<HTMLElement>('.hp-patch-section .hp-patch-group');
    await expect([...(group?.querySelectorAll('.hp-patch-kind-block') ?? [])].map(node => node.textContent))
      .toEqual(['Ослабления', 'Усиления', 'Переработки']);
    await expect(group?.querySelectorAll('.hp-patch-card .hp-patch-kind')).toHaveLength(0);
    await expect(canvasElement.querySelector('.hp-patch-section[data-section="arena"]')).toBeNull();
    await expect(within(canvasElement).getByText(/Изменения Арены — в статье только картинками/)).toBeVisible();
  },
};

export const ExpansionArchive: Story = {
  parameters: { docs: { description: { story: '"Все патчи" opens the archive drawer: a timeline of expansion cycles; the newest set has no glyph yet, so its seal shows the initial.' } } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Все патчи' }));
    const archive = within(canvasElement.querySelector<HTMLElement>('.hp-patch-archive') ?? canvasElement);
    // The drawer slides in; visibility is asserted after that short animation.
    await waitFor(() => expect(archive.getByRole('heading', { name: 'Все патчи' })).toBeVisible());
    await expect(archive.getByText('Власть Темной империи')).toBeVisible();
    await expect(archive.getByText('Побег из Аметистовой крепости')).toBeVisible();
    await expect(archive.getByRole('link', { name: /36\.6\.3/ })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(archive.getByRole('button', { name: 'Закрыть' }));
    await expect(canvasElement.querySelector<HTMLDialogElement>('.hp-patch-drawer')?.open).toBe(false);
  },
};

export const MetaFlow: Story = {
  parameters: { docs: { description: { story: 'Fewer than three changed cards in the meta of the day before the patch read as a list: each card, then the archetypes that play it with their class icon and the number of builds.' } } },
  play: async ({ canvasElement }) => {
    const flow = canvasElement.querySelector<HTMLElement>('.hp-patch-flow');
    await expect(flow?.dataset.layout).toBe('list');
    await expect(within(flow ?? canvasElement).getByText('Архетипы на момент выхода патча (данные за 30 сентября 2026 г.)')).toBeVisible();
    await expect(flow?.querySelector('.ui-sankey-chart')).toBeNull();
    await expect([...(flow?.querySelectorAll('.hp-patch-flow__targets a') ?? [])].map(link => link.getAttribute('href')))
      .toContain('/standard/archetypes/standard/std-dragon-warrior/');
  },
};

const druidUse = { format: 'standard' as const, slug: 'aggro-druid', name: 'Друид на атаке', classKey: 'druid', popularity: 2.4, decks: 3, totalDecks: 9 };
const spider: PatchNotesEntry = {
  id: 'spider', name: 'Паучок', sourceName: null, mode: 'constructed', cardId: 'EDR_528', cardClass: 'DRUID', cardType: 'minion',
  renderUrl: null, artwork: null, format: 'standard', subtitle: null, history: [], note: null, archetypes: [{ ...druidUse, decks: 6 }],
  changes: [{ label: 'Здоровье', before: 3, after: 2, better: 'higher' }],
};

export const MetaFlowSankey: Story = {
  args: { patch: { ...patch, entries: [
    ...patch.entries.map(entry => entry.id === 'pantry' ? { ...entry, archetypes: [druidUse] } : entry), spider,
  ] } },
  parameters: { docs: { description: { story: 'Valyro Sankey: three or more changed cards (buff/nerf/rework colour) flow into the archetypes whose builds play them; the flow is the number of those builds. Below 640 px of content the same links are a list.' } } },
  play: async ({ canvasElement }) => {
    const flow = canvasElement.querySelector<HTMLElement>('.hp-patch-flow');
    await expect(flow?.dataset.layout).toBe('chart');
    await waitFor(() => expect(flow?.querySelectorAll('.ui-sankey-chart__node[data-clickable]').length).toBe(6));
    await expect(flow?.querySelectorAll('.ui-sankey-chart__link')).toHaveLength(4);
  },
};
