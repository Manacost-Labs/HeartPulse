import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, waitFor } from 'storybook/test';
import { ArchetypeHistoryCharts } from './ArchetypeHistoryCharts';
import real from '../../tests/fixtures/archetype-charts-real-20261021.json';
import '../shared/ui/analytics/Analytics.css';
import './ConstructedArchetypes.css';

// HSGuru history of Quest Priest captured on 21 Oct 2026: four patch periods, then the
// black_empire expansion window that starts with a day of data.
const meta = {
  title: 'Archetype detail/History charts',
  component: ArchetypeHistoryCharts,
  args: { history: real.archetypes['Quest Priest'].history },
  parameters: { layout: 'padded' },
  decorators: [Story => <div className="archetypes-page archetype-detail-page" style={{ maxWidth: 1092 }}><section className="archetype-history"><Story /></section></div>],
} satisfies Meta<typeof ArchetypeHistoryCharts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const QuestPriest: Story = {
  play: async ({ canvasElement }) => {
    const charts = canvasElement.querySelectorAll('.analytics-chart');
    await expect(charts).toHaveLength(3);
    // Each change of HSGuru period is a labelled boundary instead of a joined line.
    await expect(charts[1].querySelectorAll('.analytics-chart__boundary').length).toBeGreaterThan(2);
    await expect(charts[1]).toHaveTextContent('Тёмная империя');
    const svg = charts[2].querySelector('svg[data-chart]');
    if (!svg) throw new Error('the daily games chart has no plot');
    const box = svg.getBoundingClientRect();
    await fireEvent.pointerMove(svg, { clientX: box.left + box.width * 0.6, clientY: box.top + 80, pointerType: 'mouse' });
    await waitFor(() => expect(charts[2].querySelector('.analytics-chart__tooltip')).not.toBeNull());
    await fireEvent.pointerOut(svg, { pointerType: 'mouse', relatedTarget: canvasElement });
    await waitFor(() => expect(charts[2].querySelector('.analytics-chart__tooltip')).toBeNull());
  },
};

export const SmallSamples: Story = { args: { history: real.archetypes['Zee Shaman'].history } };

export const FirstDayOfPeriod: Story = { args: { history: real.archetypes['Quest Priest'].history.slice(-2) } };
