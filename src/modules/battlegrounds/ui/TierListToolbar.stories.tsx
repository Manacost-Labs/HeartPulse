import { useState } from 'react';
import '../public.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import type { BattlegroundTierListKey } from '../model/tierList';
import { TierListChoice, TierListChoices, TierListToolbar } from './TierListToolbar';

const MMR = ['Все игроки', 'Топ 50%', 'Топ 20%', 'Топ 5%', 'Топ 1%'];

function ToolbarExample({ initialList = 'trinkets' }: { initialList?: BattlegroundTierListKey }) {
  const [list, setList] = useState<BattlegroundTierListKey>(initialList);
  const [size, setSize] = useState('Большие');
  const [mmr, setMmr] = useState('Топ 1%');
  const sizes = ['Все', 'Малые', 'Большие'];
  return <div className="arena-app-battlegrounds"><div className="bg-tier-list-page">
    <TierListToolbar
      list={list}
      onList={setList}
      meta="130 из 251 · HSReplay · 26.10, 06:01"
      primary={list === 'spells' ? undefined : <TierListChoices label="Размер аксессуара">
        {sizes.map(value => <TierListChoice key={value} active={size === value} onClick={() => setSize(value)}>{value}</TierListChoice>)}
      </TierListChoices>}
      secondary={list === 'spells' ? undefined : {
        summary: `${mmr} · 7 дней`,
        content: <TierListChoices label="Рейтинг игроков" legend>
          {MMR.map(value => <TierListChoice key={value} active={mmr === value} onClick={() => setMmr(value)}>{value}</TierListChoice>)}
        </TierListChoices>,
      }}
    />
  </div></div>;
}

const meta = {
  title: 'Battlegrounds/TierListToolbar',
  component: ToolbarExample,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ToolbarExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Trinkets: Story = {
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole('button', { name: /Топ 1% · 7 дней/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Топ 5%' }));
    await expect(canvas.getByRole('button', { name: /Топ 5% · 7 дней/ })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Стратегии' }));
    await expect(canvas.getByRole('button', { name: 'Стратегии' })).toHaveAttribute('aria-pressed', 'true');
  },
};

export const WithoutFilters: Story = { args: { initialList: 'spells' } };

export const Phone: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
