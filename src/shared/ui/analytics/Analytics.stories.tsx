import './Analytics.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, userEvent } from 'storybook/test';
import { LineChart } from './LineChart';
import { BarChart } from './BarChart';
import { StackedBarChart } from './StackedBarChart';
import { TableSurface } from './TableSurface';
import { DataTable, type DataColumn } from './DataTable';

const meta = {
  title: 'Shared/Analytics', component: LineChart,
  args: { title: 'Динамика карты', subtitle: 'Использование в колодах · Стандарт', unit: '%', domain: { minimum: 0 },
    points: [{ x: 1, y: 0.01, label: '27 июл' }, { x: 4, y: 0, label: '30 июл' }, { x: 16, y: 0.03, label: '11 авг' }] },
  decorators: [Story => <div style={{ maxWidth: 1000, margin: '24px auto', padding: 16 }}><Story /></div>],
} satisfies Meta<typeof LineChart>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SmallPercentages: Story = {
  play: async ({ canvas }) => {
    const slider = canvas.getByRole('slider');
    slider.focus();
    await fireEvent.input(slider, { target: { value: '0' } });
    await expect(slider).toHaveValue('0');
    await expect(canvas.getByRole('status')).toHaveTextContent('0,01%');
  },
};
export const DenseHistory: Story = { args: { points: Array.from({ length: 208 }, (_, index) => ({ x: index, y: index % 17 === 0 ? 0.03 : index % 11 === 0 ? 0.01 : 0, label: `Срез ${index + 1}` })) } };
export const MissingObservations: Story = { args: { points: [{ x: 1, y: 53 }, { x: 2, y: null }, { x: 3, y: 51 }], domain: undefined } };
export const SingleObservation: Story = { args: { points: [{ x: 1, y: 0, label: 'Сегодня' }] } };
export const CountZero: Story = {
  args: { title: 'Количество игр', subtitle: 'Единичное наблюдение', unit: 'count', points: [{ x: 1, y: 0, label: 'Сегодня' }] },
  play: async ({ canvasElement }) => {
    const labels = [...canvasElement.querySelectorAll('g:has(> .analytics-chart__grid) > text')].map(label => label.textContent);
    await expect(labels).toEqual(['0', '1']);
  },
};
export const NarrowPercentageRange: Story = {
  args: { title: 'Узкий диапазон винрейта', subtitle: 'История винрейта', domain: undefined, points: [{ x: 1, y: 48.57, label: 'Вчера' }, { x: 2, y: 48.58, label: 'Сегодня' }] },
  play: async ({ canvasElement }) => {
    const labels = [...canvasElement.querySelectorAll('g:has(> .analytics-chart__grid) > text')].map(label => label.textContent);
    await expect(new Set(labels).size).toBe(labels.length);
    await expect(labels.length).toBeGreaterThan(2);
    await expect(labels.every(label => label?.startsWith('48,5'))).toBe(true);
  },
};
export const Empty: Story = { args: { points: [] } };
export const SelectableBars: Story = { render: () => <BarChart title="Доля классов" rows={[{ label: 'Воин', value: 14.8 }, { label: 'Маг', value: 9.2 }]} onSelect={() => undefined} /> };
export const EmptyTable: Story = { render: () => <DataTable title="Нет наблюдений" rows={[]} columns={columns} /> };
export const CompactTable: Story = { render: () => <TableSurface title="Карты" density="compact"><table><thead><tr><th scope="col">Карта</th><th scope="col">Победы</th></tr></thead><tbody><tr><th scope="row"><span style={{ display: 'inline-flex', alignItems: 'center', height: 56 }}>Тестовая плитка карты</span></th><td>52%</td></tr></tbody></table></TableSurface> };
export const NativeMatrix: Story = { render: () => <TableSurface title="Матрица матчапов" imageExport><table><caption className="sr-only">Матрица матчапов</caption><thead><tr><th scope="col">Архетип</th><th scope="col">Дракон Воин</th><th scope="col">Друид на атаке</th></tr></thead><tbody><tr><th scope="row">Дракон Воин</th><td>50%</td><td>54,8%</td></tr><tr><th scope="row">Друид на атаке</th><td>45,2%</td><td>50%</td></tr></tbody></table></TableSurface> };
export const Placements: Story = { render: () => <BarChart title="Распределение по местам" rows={[22.1, 18.2, 13.3, 10.6, 9.14, 8.78, 9, 8.81].map((value, index) => ({ label: `${index + 1} место`, value }))} /> };
export const Tavern: Story = { render: () => <StackedBarChart title="Таверна по ходам" series={[{ key: '1', label: 'Т1', color: '#dbc47e' }, { key: '2', label: 'Т2', color: '#8fc3cd' }, { key: '3', label: 'Т3', color: '#a6bf88' }]} rows={[{ label: 'Ход 1', values: { '1': 100 } }, { label: 'Ход 2', values: { '1': 24, '2': 76 } }, { label: 'Ход 3', values: { '2': 92, '3': 8 } }]} /> };
type Row = { name: string; games: number };
const rows: Row[] = Array.from({ length: 26 }, (_, index) => ({ name: `Состав ${index + 1}`, games: index === 0 ? 1000 : index * 10 }));
const columns: DataColumn<Row>[] = [{ key: 'name', label: 'Состав', value: row => row.name }, { key: 'games', label: 'Игры', value: row => row.games, numeric: true }];
export const PaginatedTable: Story = {
  render: () => <DataTable title="Статистика героев" rows={rows} columns={columns} searchable />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Игры' }));
    await expect(canvas.getByRole('columnheader', { name: 'Игры' })).toHaveAttribute('aria-sort', 'descending');
    await expect(canvas.getByRole('cell', { name: '1000' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Далее' }));
    await expect(canvas.getByRole('status')).toHaveTextContent('страница 2 из 3');
  },
};
