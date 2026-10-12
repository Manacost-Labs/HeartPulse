import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { TierListControls, TierBadge, type ManaFilterValue } from './TierListControls';

function ControlsExample({ canUseTable = true }: { canUseTable?: boolean }) {
  const [activeClassId, setClass] = useState('__all__');
  const [search, setSearch] = useState('');
  const [rarity, setRarity] = useState('all');
  const [mana, setMana] = useState<ManaFilterValue>('all');
  const [view, setView] = useState<'gallery' | 'table'>('gallery');
  const reset = () => { setSearch(''); setRarity('all'); setMana('all'); };
  return <>
    <TierListControls sections={['mage', 'warrior', 'any'].map((id, index) => ({
      id, name: ['Маг', 'Воин', 'Нейтральные'][index], tiers: [], totalCards: 100,
      color: '#735133', textDark: true,
    }))} activeClassId={activeClassId} onClassChange={id => { setClass(id); reset(); }}
      search={search} onSearchChange={setSearch} rarity={rarity} onRarityChange={setRarity}
      mana={mana} onManaChange={setMana} view={view} onViewChange={setView}
      canUseTable={canUseTable} onReset={reset} />
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {['S', 'A', 'B', 'C', 'D', 'E', 'F', 'U'].map(tier => <TierBadge key={tier} tier={tier} />)}
    </div>
  </>;
}
const meta = { title: 'Arena/Tier list controls', component: ControlsExample } satisfies Meta<typeof ControlsExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FiltersAndReset: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Маг' }));
    await userEvent.type(canvas.getByRole('searchbox', { name: 'Поиск карт' }), 'Рагнарос');
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Редкость' }), 'legendary');
    await expect(canvas.getByRole('combobox', { name: 'Редкость' }).parentElement?.querySelector('img')).toHaveAttribute('src', '/assets/legendary.png');
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Мана' }), '10');
    await expect(canvas.getByRole('combobox', { name: 'Мана' })).toHaveValue('10');
    await expect(canvas.getByRole('combobox', { name: 'Мана' })).toHaveAttribute('data-selected', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Сбросить' }));
    await expect(canvas.getByRole('searchbox')).toHaveValue('');
    await expect(canvas.getByRole('combobox', { name: 'Редкость' })).toHaveValue('all');
    await expect(canvas.getByRole('combobox', { name: 'Редкость' }).parentElement?.querySelector('img')).toHaveAttribute('src', '/assets/common.png');
    await expect(canvas.getByRole('combobox', { name: 'Мана' })).toHaveValue('all');
    await expect(canvas.getByRole('combobox', { name: 'Мана' })).toHaveAttribute('data-selected', 'false');
    await expect(canvas.getByRole('button', { name: 'Маг' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Таблица' }));
    await expect(canvas.getByRole('button', { name: 'Таблица' })).toHaveAttribute('aria-pressed', 'true');
  },
};
export const GalleryOnly: Story = {
  args: { canUseTable: false },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: 'Таблица' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Воин' }));
    await expect(canvas.getByRole('button', { name: 'Воин' })).toHaveAttribute('aria-pressed', 'true');
  },
};

export const Badges: Story = {
  render: () => <div style={{ padding: 24, background: '#f8e7bf', color: '#3d291d' }}>
    <h2 style={{ marginBottom: 16 }}>Заголовки тиров</h2>
    <div role="group" aria-label="Значки в заголовках" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {['S', 'A', 'B', 'C', 'D', 'E', 'F', 'U'].map(tier => <TierBadge key={tier} tier={tier} />)}
    </div>
    <h2 style={{ marginBlock: '24px 16px' }}>Таблица и окно карты</h2>
    <div role="group" aria-label="Компактные значки" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {['S', 'A', 'B', 'C', 'D', 'E', 'F', 'U'].map(tier => <TierBadge key={tier} tier={tier} small />)}
    </div>
  </div>,
};
