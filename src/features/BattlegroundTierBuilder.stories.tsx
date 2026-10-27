import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { BattlegroundTierBuilder, type ClassicRuntime } from './BattlegroundTierBuilder';

const art = (label: string, hue: number) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="hsl(${hue} 45% 38%)"/><text x="64" y="76" font-size="36" text-anchor="middle" fill="#fff0c8">${label}</text></svg>`)}`;
const races = ['MURLOC', 'BEAST', 'DEMON', 'DRAGON', 'UNDEAD', 'NAGA'];
/** The browser draft each story starts from; set before the story mounts. */
const useDraft = (draft: unknown) => () => {
  try {
    if (draft) window.localStorage.setItem('hearthpulse-tier-draft-v1', JSON.stringify({ version: 1, draft }));
    else window.localStorage.removeItem('hearthpulse-tier-draft-v1');
  } catch { /* Storybook may block storage; the builder still opens. */ }
};
const runtime = (): ClassicRuntime => ({
    loadBattlegroundsLibrary: async () => ({ cards: Array.from({ length: 24 }, (_, index) => ({
      id: `BG_QA_${index}`, name: `Существо ${index + 1}`, techLevel: 1 + index % 6, races: [races[index % races.length]],
      artUrl: art(String(index + 1), index * 15),
    })) }),
    loadCurrentHeroesData: async () => [{ tier: 'S', heroes: [{ name: 'Рено Джексон', image: art('Р', 40) }] }],
    loadCurrentAccessoriesData: async () => ({ small: [{ id: 'TR_QA', name: 'Малый аксессуар', size: 'SMALL', image: art('А', 200) }], large: [] }),
    loadImageFromSource: src => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    }),
});

const meta = {
  title: 'Battlegrounds/Tier builder',
  component: BattlegroundTierBuilder,
  args: { runtime: runtime() },
  decorators: [Story => <div style={{ padding: 16, background: '#ead6a7' }}><Story /></div>],
} satisfies Meta<typeof BattlegroundTierBuilder>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyBoard: Story = {
  beforeEach: useDraft(null),
  parameters: { docs: { description: { story: 'Pool filters beside the VaryloUI tier list; cards move by mouse, long press or Space and arrows.' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('В пуле 25 карт по текущим фильтрам. В тирах: 0.')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Существа' }));
    await expect(canvas.getByText('В пуле 24 карты по текущим фильтрам. В тирах: 0.')).toBeVisible();
  },
};
export const SavedDraft: Story = {
  beforeEach: useDraft({ S: ['BG_QA_0', 'BG_QA_3'], A: ['hero-рено-джексон'], C: ['TR_QA'] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('4 карты в тирах')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Все в пул' }));
    await expect(canvas.getByText('0 карт в тирах')).toBeVisible();
    // The emptied board keeps focus on the control that emptied it.
    await expect(canvas.getByRole('button', { name: 'Все в пул' })).toHaveFocus();
    await userEvent.click(canvas.getByRole('button', { name: 'Отменить' }));
    await expect(canvas.getByText('4 карты в тирах')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Отменить' }));
    await expect(canvas.getByRole('button', { name: 'Отменить' })).toHaveFocus();
  },
};
