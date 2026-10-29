import type React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { HsguruArchetypeStats } from './HsguruArchetypeStats';
import snapshot from './hsguruArchetypeStatsSnapshot.json';
import legacySnapshot from './hsguruArchetypeLegacySnapshot.json';
import './ConstructedArchetypes.css';

// Real answers of 25.10.2026 (Зоолок): /api/constructed-archetype-stats with the
// Legend · Bans card slice, and the older Legend · week analysis as the fallback.
const legacy = legacySnapshot as unknown as React.ComponentProps<typeof HsguruArchetypeStats>['legacy'];

function collecting(query: URLSearchParams) {
  return { ...snapshot, mulligan: null, classMatchups: null, slice: {
    rank: query.get('rank') ?? 'legend', period: query.get('period') ?? 'black_empire_ban',
    coin: query.get('coin') ?? 'any_player', opponentClass: query.get('opponent') ?? 'any',
  } };
}

const meta = {
  title: 'Archetype detail/HSGuru slice stats',
  component: HsguruArchetypeStats,
  parameters: { layout: 'fullscreen' },
  args: { format: 'standard', slug: 'zoolock', legacy },
  decorators: [Story => <div className="archetypes-page archetype-detail-page" style={{ maxWidth: 1440, marginInline: 'auto' }}><Story /></div>],
  beforeEach: ({ parameters }) => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (!url.pathname.startsWith('/api/constructed-archetype-stats/')) return original(input, init);
      if (parameters.hold) return new Promise<Response>(() => {});
      // Only the snapshot's Legend · Bans slice is collected: any other one is still being collected.
      const query = url.searchParams;
      const isSnapshot = !url.search || (query.get('rank') === 'legend' && query.get('period') === 'black_empire_ban'
        && query.get('coin') === 'any_player' && query.get('opponent') === 'any');
      const body = parameters.nothingCollected || !isSnapshot ? collecting(query) : snapshot;
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    };
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof HsguruArchetypeStats>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collected: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByText(/49\s117 игр/)).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { level: 2, name: 'Матчапы и муллиган' })).toBeInTheDocument();
    // The window's short label has its full name in the tooltip of the filter and of its option.
    await expect(canvas.getByRole('combobox', { name: /^Период/ })).toHaveAttribute('title', 'Тёмная империя, с патча банов');
    const phases = [...canvasElement.querySelectorAll('.constructed-card-stats__table th')].map(cell => cell.textContent?.trim());
    await expect(phases).toContain('Не пришла');
    await expect(canvas.getByText('HSGuru · Легенда · После банов')).toBeInTheDocument();
    // Class matchups of this slice are not collected yet: the week's Legend slice fills them, named as such.
    await expect(canvas.getByText('HSGuru · Легенда · Неделя')).toBeInTheDocument();
  },
};

export const SliceCollecting: Story = {
  play: async ({ canvas }) => {
    await canvas.findByText(/49\s117 игр/);
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: /^Очерёдность хода/ }), 'on_coin');
    await expect(await canvas.findByText('Срез «Легенда · После банов · С монеткой» ещё собирается')).toBeInTheDocument();
    await expect(canvas.getByText(/собрано 520 из 8\s720 срезов \(5%\)/)).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Легенда · После банов' })).toBeInTheDocument();
  },
};

export const NothingCollected: Story = {
  args: { legacy: null },
  parameters: { nothingCollected: true },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Статистика карт для этого среза ещё собирается.')).toBeInTheDocument();
    await expect(canvas.getByText('Матчапы по классам для этого среза ещё собираются.')).toBeInTheDocument();
  },
};

export const Loading: Story = { parameters: { hold: true } };

export const Phone: Story = {
  ...Collected,
  globals: { viewport: { value: 'mobile2', isRotated: false } },
};
