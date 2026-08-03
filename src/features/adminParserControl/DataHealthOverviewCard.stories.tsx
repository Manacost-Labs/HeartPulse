import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DataHealthOverviewCard } from './DataHealthOverviewCard';
import { normalizeParserControl } from './normalize';
import '../contests.css';
import './DataHealthOverviewCard.css';

const healthySnapshot = normalizeParserControl({
  generatedAt: '2026-08-03T12:00:00Z',
  policy: { mode: 'stable' },
  sections: [{
    id: 'cards',
    label: 'Карты',
    sources: [{
      id: 'constructed-cards',
      label: 'Карты традиционного режима',
      status: 'healthy',
      lastSuccessAt: '2026-08-03T11:58:00Z',
      publishedFetchedAt: '2026-08-03T11:58:00Z',
      publicationChannel: 'stable',
      itemCount: 1152,
    }],
  }],
});

const degradedSnapshot = normalizeParserControl({
  generatedAt: '2026-08-03T12:00:00Z',
  policy: { mode: 'stable' },
  sections: [{
    id: 'meta',
    label: 'Мета',
    sources: [
      {
        id: 'hsguru-meta-matrix',
        label: 'Матрица матчапов',
        status: 'warning',
        state: 'partial',
        lastSuccessAt: '2026-08-03T10:00:00Z',
        publishedFetchedAt: '2026-08-03T10:00:00Z',
        publicationChannel: 'stable_baseline',
        stableBaselineAvailable: true,
        itemCount: 648,
        lastError: 'Часть срезов недоступна; пользователям показана последняя стабильная версия.',
      },
      {
        id: 'arena-tierlist',
        label: 'Тир-лист Арены',
        status: 'error',
        state: 'hard_failed',
        publicationChannel: 'unavailable',
        lastError: 'Свежий снимок не прошёл проверку качества.',
      },
    ],
  }],
});

const meta = {
  title: 'Admin/Мониторинг данных',
  component: DataHealthOverviewCard,
  decorators: [Story => <main className="admin-workspace-page"><Story /></main>],
  parameters: { layout: 'padded' },
  args: {
    refreshing: false,
    onRefresh: fn(),
    now: Date.parse('2026-08-03T12:00:00Z'),
  },
} satisfies Meta<typeof DataHealthOverviewCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {
  args: { snapshot: healthySnapshot },
};

export const RequiresAttention: Story = {
  args: { snapshot: degradedSnapshot },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Требуется вмешательство')).toBeInTheDocument();
    await expect(canvas.getByText('Матрица матчапов')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Обновить сейчас' }));
    await expect(args.onRefresh).toHaveBeenCalledOnce();
  },
};

export const Refreshing: Story = {
  args: { snapshot: degradedSnapshot, refreshing: true },
};
