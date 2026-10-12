import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { BattlegroundTrinketGalleryStats } from './BattlegroundTrinketGalleryStats';
import '../battlegrounds-parchment.css';

const rates = [20, 20, 0, 0, 30, 10, 10, 10];
const meta = {
  title: 'Battlegrounds/Trinket Distribution', component: BattlegroundTrinketGalleryStats,
  args: {
    pickRate: '12,4%', averagePlacement: '4,2',
    placementBars: rates.map((rate, index) => ({ place: index + 1, rate, height: rate / 30 * 100 })),
  },
  decorators: [Story => <div className="arena-app-battlegrounds" style={{ maxWidth: 380, padding: 16 }}><Story /></div>],
} satisfies Meta<typeof BattlegroundTrinketGalleryStats>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ZeroPlacements: Story = {
  play: async ({ canvasElement }) => {
    const bars = canvasElement.querySelectorAll('.bg-trinket-gallery-stats__distribution i');
    await expect(bars).toHaveLength(8);
    await expect(bars[2].getBoundingClientRect().height).toBe(0);
    await expect(bars[3].getBoundingClientRect().height).toBe(0);
    await expect(bars[4].getBoundingClientRect().height).toBeGreaterThan(0);
  },
};

export const NoObservations: Story = {
  args: { pickRate: '—', averagePlacement: '—', placementBars: rates.map((_, index) => ({ place: index + 1, rate: 0, height: 0 })) },
  play: async ({ canvasElement }) => {
    await expect([...canvasElement.querySelectorAll('.bg-trinket-gallery-stats__distribution i')].every(bar => bar.getBoundingClientRect().height === 0)).toBe(true);
  },
};
