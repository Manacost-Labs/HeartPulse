import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { BattlegroundMinionStats } from '../modules/battlegrounds/public';
import { CardVariantImages, CardVariantSwitch } from '../shared/ui/CardVariantSwitch';
import { BattlegroundMinionHeader } from './BattlegroundMinionHeader';
import { BattlegroundMinionStatsSections } from './BattlegroundMinionStatsSections';
import { minionPlacementTone, minionStatsKpis } from './battlegroundMinionStatsModel';
import lowTierFixture from '../../tests/fixtures/bg-minion-stats-view-104551-20261021.json';
import highTierFixture from '../../tests/fixtures/bg-minion-stats-view-130298-20261021.json';

// Express output for real hs-data-api answers of 21.10.2026 (tests/bg-minion-stats-model.test.ts keeps them in sync).
const lowTier = lowTierFixture as BattlegroundMinionStats;
const highTier = highTierFixture as BattlegroundMinionStats;

/** The minion part of the library detail page, as BgLibrary composes it. */
function MinionStatsPage({ stats, name, text, empty = false }: { stats: BattlegroundMinionStats; name: string; text: string; empty?: boolean }) {
  const [variant, setVariant] = useState<'normal' | 'golden'>('normal');
  const totals = empty ? null : stats[variant];
  return (
    <div className="bg-library-detail-page">
      <BattlegroundMinionHeader
        title={name}
        // As BgLibrary composes it: the full card in both versions, the golden from `golden/<base id>`.
        card={<CardVariantImages value={variant} alt={name} images={[
          { id: 'normal', src: `/api/public-resource/hsjson/v1/bgs/latest/ruRU/512x/${stats.minion.cardId}.png` },
          { id: 'golden', src: `/api/public-resource/db/uploads/golden/${stats.minion.cardId}.png` },
        ]} />}
        variant={<CardVariantSwitch tone="plate" value={variant} onChange={value => setVariant(value as 'normal' | 'golden')}
          options={[{ id: 'normal', label: 'Обычная', note: `${stats.minion.attack}/${stats.minion.health}` }, { id: 'golden', label: 'Золотая' }]} />}
        facts={[{ key: 'tier', label: `Таверна ${stats.minion.tavernTier}` }]}
        rulesText={text}
        art={stats.minion.images.art}
        kpis={minionStatsKpis(totals)}
        placementTone={minionPlacementTone(totals)}
        emptyText="По этому существу нет игр в выборке HSReplay за последние 7 дней."
        methodology={!empty}
      />
      {empty ? null : <BattlegroundMinionStatsSections stats={stats} variant={variant} />}
    </div>
  );
}

const meta = {
  title: 'Battlegrounds/Minion statistics',
  component: MinionStatsPage,
  args: { stats: lowTier, name: 'Безобидная черепушка', text: 'Предсмертный хрип: призывает двух скелетов 1/1.' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MinionStatsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LowTier: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1, name: 'Безобидная черепушка' })).toBeInTheDocument();
    await expect(canvas.getByText('Место с ним и без')).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('.minion-board__slots li')).toHaveLength(7);
    await expect(canvas.queryByText('Медианная атака')).not.toBeInTheDocument();
  },
};

export const HighTierGolden: Story = {
  args: { stats: highTier, name: 'Балинда Каменный Очаг', text: 'Ваши заклинания, применяемые к вашим существам, срабатывают дважды.' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: /Золотая/ }));
    await expect(canvas.getByText('Медианная атака')).toBeInTheDocument();
  },
};

export const NoGames: Story = {
  args: { empty: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/нет игр в выборке/)).toBeInTheDocument();
    await expect(canvasElement.querySelector('.minion-section')).toBeNull();
  },
};

export const Phone: Story = {
  args: { stats: highTier, name: 'Балинда Каменный Очаг', text: 'Ваши заклинания, применяемые к вашим существам, срабатывают дважды.' },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
