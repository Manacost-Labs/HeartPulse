import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import StandardMatchups from './StandardMatchups';

const columns = ['Дракон Воин', 'Друид на атаке', 'Жрец на воровстве', 'Чернокнижник на возвышении', 'Айя Разбойник'].map(name => ({ name, label: name, popularity: '10%' }));
const meta = {
  title: 'Meta/Matchup Matrix', component: StandardMatchups,
  decorators: [Story => <div className="arena-app-standard-matchups"><Story /></div>],
  args: { external: { format: 'standard', changeFormat: () => undefined, loading: false, error: false, retry: () => undefined, data: { format: 'standard', formatLabel: 'Стандарт', rank: 'legend', rankLabel: 'Легенда', source: 'Workshop', updatedAt: null, columns, rows: columns.map((column, index) => ({ archetype: column.name, archetypeLabel: column.label, winrate: 52, cells: columns.map((opponent, opponentIndex) => ({ opponent: opponent.name, opponentLabel: opponent.label, winrate: index === opponentIndex ? 50 : index === 0 ? null : 35 + index * 5 + opponentIndex * 2 })) })) } } },
} satisfies Meta<typeof StandardMatchups>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = {};
export const PopulatedOverview: Story = { play: async ({ canvas }) => {
  await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Архетип' }), columns[1].name);
} };
export const Loading: Story = { args: { external: { ...meta.args.external, loading: true,
  data: { ...meta.args.external.data, rows: [], columns: [] } } } };
export const Matrix: Story = { play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole('button', { name: /^Матрица/ })); await expect(canvas.getByRole('button', { name: 'Скачать Матрица матчапов: SVG' })).toBeVisible(); await expect(getComputedStyle(canvas.getByText('Соперники').closest('th') ?? canvasElement).backgroundImage).toContain('linear-gradient'); } };
