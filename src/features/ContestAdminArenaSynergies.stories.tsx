import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import type { ArenaSynergyPayload } from '../../shared/arenaSynergyContract';
import { ArenaSynergyPanel } from './ContestAdminArenaSynergies';
import './contests.css';

const payload: ArenaSynergyPayload = {
  schemaVersion: 1,
  generatedAt: '2026-07-30T10:00:00Z',
  selectedClass: 'ALL',
  source: {
    winningDecksFetchedAt: '2026-07-30T09:55:00Z',
    cardStatsFetchedAt: '2026-07-30T09:55:00Z',
  },
  cohort: {
    id: '36.0:6d08469a64ab61f4',
    patchVersion: '36.0',
    patchPublishedAt: '2026-06-30T12:52:40Z',
    poolFingerprint: '6d08469a64ab61f4',
    from: '2026-07-24T04:21:58Z',
    to: '2026-07-30T04:11:39Z',
  },
  summary: {
    runsAvailable: 500,
    runsAnalyzed: 500,
    redraftRuns: 488,
    recordCounts: { '12-0': 12, '12-1': 95, '12-2': 393 },
    warnings: [],
  },
  availableClasses: [
    { id: 'ALL', label: 'Все классы', runs: 500 },
    { id: 'MAGE', label: 'Маг', runs: 22 },
    { id: 'DEMONHUNTER', label: 'Охотник на демонов', runs: 329 },
    { id: 'PALADIN', label: 'Паладин', runs: 66 },
  ],
  methodology: {
    sampleLimit: 500,
    minimumPairRuns: 13,
    minimumLift: 1.25,
    packageFilterShare: 0.5,
    classStratified: true,
    note: 'Связь показывает совместную встречаемость в 12-победных колодах, а не доказывает причинный прирост побед.',
  },
  combinations: [{
    cards: [
      {
        id: 'REV_509',
        name: 'Увеличительная глефа',
        cost: 3,
        type: 'WEAPON',
        rarity: 'RARE',
        deckWinRate: 58.7,
        runs: 47,
      },
      {
        id: 'REV_511',
        name: 'Клещ-библиофил',
        cost: 2,
        type: 'MINION',
        rarity: 'COMMON',
        deckWinRate: 57.3,
        runs: 65,
      },
    ],
    observedRuns: 20,
    expectedRuns: 9.3,
    supportPercent: 4,
    lift: 1.94,
    score: 78,
    confidence: 'high',
    forcedPackageShare: 0,
  }],
  redraft: [{
    card: {
      id: 'JAIL_733',
      name: 'Злобный пусточешуйник',
      cost: 3,
      type: 'MINION',
      rarity: 'RARE',
      deckWinRate: 61.9,
      runs: 161,
    },
    addedCopies: 143,
    addedRuns: 138,
    discardedCopies: 0,
    discardedRuns: 0,
    decisions: 143,
    addShare: 1,
    netCopies: 143,
  }],
};

const meta = {
  title: 'Admin/Arena Synergies',
  component: ArenaSynergyPanel,
  decorators: [
    Story => (
      <div className="admin-workspace-page">
        <Story />
      </div>
    ),
  ],
  args: {
    selectedClass: 'ALL',
    onClassChange: fn(),
    onReload: fn(),
  },
} satisfies Meta<typeof ArenaSynergyPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  args: {
    payload,
    loading: false,
    error: null,
  },
  play: async ({ canvas, args }) => {
    await userEvent.selectOptions(canvas.getByLabelText('Класс'), 'MAGE');
    await expect(args.onClassChange).toHaveBeenCalledWith('MAGE');

    await userEvent.click(canvas.getByRole('tab', { name: 'Redraft' }));
    await expect(canvas.getByRole('tab', { name: 'Redraft' })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByText('Злобный пусточешуйник')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Обновить данные' }));
    await expect(args.onReload).toHaveBeenCalled();
  },
};

export const Loading: Story = {
  args: {
    payload: null,
    loading: true,
    error: null,
  },
};

export const Error: Story = {
  args: {
    payload: null,
    loading: false,
    error: 'Не удалось загрузить сочетания Арены',
  },
};
