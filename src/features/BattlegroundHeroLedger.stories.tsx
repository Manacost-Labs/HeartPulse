import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import '../battlegrounds-parchment.css';
import BattlegroundHeroLedger from './BattlegroundHeroLedger';

type LedgerProps = React.ComponentProps<typeof BattlegroundHeroLedger>;
const sections: LedgerProps['sections'] = ['S', 'A', 'B', 'C', 'D'].map((tier, index) => ({
  tier,
  heroes: [{
    dbfId: 61488 + index, name: ['Алекстраза', 'Рено Джексон', 'Король-лич', 'Синдрагоса', 'А. Ф. Ка'][index],
    image: `/bg-legacy/heroes_bg/${['Alexstrasza', 'Reno Jackson', 'The Lich King', 'Sindragosa', 'A. F. Kay'][index]}.png`, popularity: `${18 - index * 2}%`,
    averagePlace: `${3.7 + index * 0.3}`, bestComposition: ['Драконы', 'Элементали', 'Нежить', 'Драконы', 'Механизмы'][index],
    heroPower: { name: 'Сила героя', text: 'Улучшает ваш состав в течение матча.' },
    placementDistribution: ['18%', '16%', '14%', '13%', '12%', '10%', '9%', '8%'],
  }],
}));

const meta = {
  title: 'Battlegrounds/Hero Ledger', component: BattlegroundHeroLedger,
  parameters: { layout: 'fullscreen' },
  args: { sections, mode: 'solo', mmr: 'TOP_50_PERCENT', sortKey: 'tier', sortDirection: 'asc', onSort: fn(), onNavigate: fn() },
  decorators: [Story => <main className="arena-app-battlegrounds" style={{ padding: 16, maxWidth: 1360, margin: 'auto' }}><Story /></main>],
  beforeEach: () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => new URL(String(input), location.origin).pathname === '/api/bg/heroes/compositions'
      ? Response.json({ ok: true, compositions: {}, composition_names: {} }) : originalFetch(input, init);
    return () => { globalThis.fetch = originalFetch; };
  },
  render: function InteractiveLedger(args) {
    const [key, setKey] = useState<LedgerProps['sortKey']>(args.sortKey);
    const [direction, setDirection] = useState<LedgerProps['sortDirection']>(args.sortDirection);
    return <BattlegroundHeroLedger {...args} sortKey={key} sortDirection={direction} onSort={field => {
      args.onSort(field);
      setKey(field);
      setDirection(field === key && direction === 'asc' ? 'desc' : 'asc');
    }} />;
  },
} satisfies Meta<typeof BattlegroundHeroLedger>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TierGroups: Story = {
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('table')).toBeVisible();
    await expect(canvas.getByRole('rowgroup', { name: 'Тир S' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /^(Среднее место|Место)$/ }));
    await expect(args.onSort).toHaveBeenCalledWith('averagePlace');
    await userEvent.click(canvas.getByRole('button', { name: 'Тир' }));
    await expect(canvas.getAllByRole('rowgroup')).toHaveLength(5);
  },
};
export const SortedRows: Story = {
  args: { sortKey: 'averagePlace' },
  play: async ({ canvas, args }) => {
    const place = canvas.getAllByRole('button', { name: '6 место: 10%' })[0];
    await userEvent.click(place);
    await expect(place).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(canvas.getByRole('link', { name: /Алекстраза/ }));
    await expect(args.onNavigate).toHaveBeenCalledWith('/heroes/61488/');
  },
};
