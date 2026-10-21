import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { StandardMatchupsClassKey, StandardMatchupsData } from '../modules/standardMatchups/public';
import StandardMatchupMatrix from './StandardMatchupMatrix';

// A slice of the HSGuru Legend snapshot of 21.10.2026: the ten most played archetypes and two rare ones.
const SNAPSHOT: Array<[string, string, StandardMatchupsClassKey, string, number, Array<number | null>]> = [
  ['Quest Priest', 'Квест Жрец', 'priest', '26.2%', 56.6, [50, 44.9, 57.1, 49, 77.1, 51.8, 62.9, 70.7, 58.5, 63.3, 63.2, 51]],
  ['Divergence Warlock', 'Дивергенция Чернокнижник', 'warlock', '9.6%', 52.9, [55.1, 50, 46.4, 55.5, 65.3, 69.2, 60.1, 66.9, 59.6, 39.5, 41.9, 48.7]],
  ['AYAYA Rogue', 'Айя Разбойник', 'rogue', '9.4%', 48.8, [42.9, 53.6, 50, 45.2, 62.3, 69.3, 49.1, 53.3, 49.5, 39.3, 49.4, 44.3]],
  ['Harold Warlock', 'Чернокнижник на возвещении', 'warlock', '6.6%', 53.9, [51, 44.5, 54.8, 50, 70.2, 68.3, 63.6, 62.5, 53.2, 40.4, 53.8, 60.5]],
  ['Harold DK', 'Рыцарь смерти на возвещении', 'deathknight', '5.3%', 40, [22.9, 34.7, 37.7, 29.8, 50, 49, 63.3, 48, 48.1, 51.2, 30.5, 48.8]],
  ['Mill Rogue', 'Милл Разбойник', 'rogue', '3.1%', 40, [48.2, 30.8, 30.7, 31.7, 51, 50, 35.6, 19.6, 51.2, 18.4, null, null]],
  ['Thief Priest', 'Жрец на воровстве', 'priest', '2.9%', 45.4, [37.1, 39.9, 50.9, 36.4, 36.7, 64.4, 50, 43.8, 28.2, 57.5, 51.6, 58.6]],
  ['Pure Paladin', 'Чистый Паладин', 'paladin', '2.6%', 43.8, [29.3, 33.1, 46.7, 37.5, 52, 80.4, 56.3, 50, 28.1, 36.1, 39.3, 53.1]],
  ['Raza DH', 'Раза Охотник на демонов', 'demonhunter', '2.4%', 48.6, [41.5, 40.4, 50.5, 46.8, 51.9, 48.8, 71.8, 71.9, 50, 62.2, 39.3, 58.6]],
  ['Dragon Warrior', 'Дракон Воин', 'warrior', '2.4%', 51.3, [36.7, 60.5, 60.7, 59.6, 48.8, 81.6, 42.5, 63.9, 37.8, 50, null, null]],
  ['Burn Mage', 'Берн Маг', 'mage', '1.8%', 49.6, [36.8, 58.1, 50.6, 46.2, 69.5, null, 48.4, 60.7, 60.7, null, 50, null]],
  ['Pirate Warrior', 'Пиратский Воин', 'warrior', '1.0%', 52.7, [49, 51.3, 55.7, 39.5, 51.2, null, 41.4, 46.9, 41.4, null, null, null]],
];

const data: StandardMatchupsData = {
  format: 'standard', formatLabel: 'Стандарт', rank: 'legend', rankLabel: 'Легенда', source: 'hsguru',
  sourceUrl: 'https://www.hsguru.com/matchups?min_archetype_sample=100&min_matchup_sample=25&rank=legend',
  updatedAt: '2026-10-21T05:19:59Z',
  columns: SNAPSHOT.map(([name, label, classKey, popularity]) => ({ name, label, classKey, popularity })),
  rows: SNAPSHOT.map(([archetype, archetypeLabel, classKey, , winrate, cells]) => ({ archetype, archetypeLabel, classKey,
    winrate, cells: cells.map((rate, index) => ({ opponent: SNAPSHOT[index][0], opponentLabel: SNAPSHOT[index][1], winrate: rate })) })),
};

const labelOf = (name: string, label?: string) => label || name;

function Controlled({ initial }: { initial: string }) {
  const [selected, setSelected] = useState(initial);
  return <StandardMatchupMatrix data={data} labelOf={labelOf} selected={selected} onSelectedChange={setSelected} />;
}

const meta = {
  title: 'Meta/Matchup Matrix/VaryloUI matrix',
  component: Controlled,
  decorators: [Story => <div className="arena-app-standard-matchups" style={{ padding: 16 }}><Story /></div>],
  args: { initial: 'Quest Priest' },
} satisfies Meta<typeof Controlled>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Лучше всего против')).toBeVisible();
    await expect(canvas.getByRole('grid')).toBeVisible();
  },
};

/** A rare archetype: its pairs with other rare decks are muted and left out of the summary. */
export const RareArchetype: Story = {
  args: { initial: 'Pirate Warrior' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(canvas.getByRole('gridcell', { name: /Пиратский Воин против Чистый Паладин/ }));
    await expect(canvasElement.querySelector('.ui-matchup-matrix__tip')?.textContent).toContain('точность низкая');
  },
};

/** The matrix reads its own width: in a phone-wide column it becomes the list of the picked archetype. */
export const Phone: Story = {
  decorators: [Story => <div style={{ maxWidth: 412 }}><Story /></div>],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Квест Жрец против соперников')).toBeVisible();
  },
};
