import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { ParserRunsCard } from './ParserRunsCard';
import { normalizeParserControl, normalizeParserRuns } from './normalize';
import '../contests.css';
import '../../modules/adminWorkspace/adminWorkspace.css';

const snapshot = normalizeParserControl({
  sections: [
    {
      id: 'arena',
      label: 'Арена',
      group: 'arena',
      sources: [
        { id: 'hsreplay_arena', label: 'HSReplay Arena', status: 'healthy', canRunManually: true },
        { id: 'hsguru_arena', label: 'HSGuru Arena', status: 'healthy', canRunManually: true },
      ],
    },
    {
      id: 'constructed',
      label: 'Традиционный режим',
      group: 'constructed',
      sources: [
        { id: 'hsguru_meta', label: 'HSGuru Meta', status: 'warning', canRunManually: true },
      ],
    },
  ],
});

const runs = normalizeParserRuns({
  runs: [
    {
      id: 'run-2026-09-13-01',
      status: 'running',
      reason: 'Обновление после патча 33.4',
      requestedAt: '2026-09-13T15:44:00Z',
      requestedBy: 'ops@hearthpulse.net',
      sourceIds: ['hsreplay_arena', 'hsguru_arena'],
      totalSources: 2,
      completedSources: 1,
      results: [{
        sourceId: 'hsreplay_arena',
        state: 'ok',
        status: 'healthy',
        rowsTotal: 731,
        durationMs: 18_400,
        fetchedAt: '2026-09-13T15:44:22Z',
      }],
    },
    {
      id: 'run-2026-09-13-00',
      status: 'partial',
      reason: 'Проверка стабильного снимка',
      requestedAt: '2026-09-13T14:10:00Z',
      requestedBy: 'ops@hearthpulse.net',
      sourceIds: ['hsguru_meta'],
      totalSources: 1,
      completedSources: 1,
      failedSources: 1,
      results: [{
        sourceId: 'hsguru_meta',
        state: 'partial',
        status: 'warning',
        servingCachedDataset: true,
        rowsTotal: 648,
        message: 'Свежий снимок не прошёл проверку качества.',
        errors: ['publisher returned stale data'],
      }],
    },
  ],
});

const meta = {
  title: 'Admin/Parser Runs',
  component: ParserRunsCard,
  decorators: [Story => (
    <main className="admin-workspace-page admin-tailadmin-shell" style={{ minHeight: '100vh', padding: 24 }}>
      <Story />
    </main>
  )],
  parameters: { layout: 'fullscreen' },
  args: {
    sections: snapshot.sections,
    runs,
    starting: false,
    refreshing: false,
    loadError: null,
    onStart: fn(),
    onRefresh: fn(),
  },
} satisfies Meta<typeof ParserRunsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OperationsTable: Story = {
  play: async ({ canvas, args }) => {
    const firstSection = canvas.getByRole('checkbox', { name: /Арена/ });
    await userEvent.click(firstSection);
    await userEvent.type(canvas.getByPlaceholderText(/проверка данных после патча/i), 'Контрольный запуск');
    await userEvent.click(canvas.getByRole('button', { name: 'Запустить · 1' }));
    await expect(args.onStart).toHaveBeenCalledWith(['arena'], 'Контрольный запуск');

    await userEvent.click(canvas.getByRole('button', { name: 'Открыть детали запуска: Обновление после патча 33.4' }));
    await expect(await canvas.findByRole('dialog', { name: 'Детали запуска' })).toBeVisible();
    await expect(canvas.getByText('HSReplay Arena')).toBeVisible();
    const drawerCloseButton = canvas.getByRole('button', { name: 'Закрыть детали запуска' });
    await expect(drawerCloseButton).toHaveFocus();
    await userEvent.tab();
    await expect(drawerCloseButton).toHaveFocus();
    await userEvent.click(drawerCloseButton);
    await expect(canvas.queryByRole('dialog', { name: 'Детали запуска' })).not.toBeInTheDocument();
  },
};

export const HistoryUnavailable: Story = {
  args: {
    runs: [],
    loadError: 'Сервер данных временно недоступен',
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('Не удалось обновить историю запусков');
    await userEvent.click(canvas.getByRole('button', { name: 'Повторить' }));
    await expect(args.onRefresh).toHaveBeenCalledOnce();
  },
};
