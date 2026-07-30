import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import type { ArenaCombination, ArenaSynergyPayload } from '../../shared/arenaSynergyContract';
import { ArenaSynergyPanel } from './ContestAdminArenaSynergies';
import './contests.css';

const payload: ArenaSynergyPayload = {
  schemaVersion: 2,
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
    outcomeMetric: 'Качество 12W-забега: 12 / (12 + число поражений).',
    note: 'Связь показывает совместную встречаемость в 12-победных колодах, а не доказывает причинный прирост побед.',
  },
  dataQuality: {
    status: 'healthy',
    score: 100,
    metrics: {
      sourceRows: 500,
      validRuns: 500,
      invalidRuns: 0,
      duplicateRuns: 0,
      futureRuns: 0,
      impossibleDecks: 0,
      unknownCardReferences: 14,
      totalCardReferences: 11_085,
      maxClassShare: 0.656,
      maxPlayerShare: 0.008,
      sourceAgeHours: 0.3,
      volumeRatioToPrevious: 1,
    },
    checks: [
      {
        id: 'schema',
        label: 'Структура источника',
        status: 'pass',
        value: 'decks[]',
        threshold: 'обязателен массив decks',
        message: 'Структура источника распознана.',
      },
      {
        id: 'duplicates',
        label: 'Повторяющиеся draft_id',
        status: 'pass',
        value: 0,
        threshold: 'предупреждение >5%, блокировка >30%',
        message: 'Повторяющиеся забеги не найдены.',
      },
      {
        id: 'unknown-cards',
        label: 'Карты вне справочника',
        status: 'pass',
        value: 0.1,
        threshold: 'предупреждение >10%, блокировка >50%',
        message: '14 ссылок на карты не найдены в текущем справочнике.',
      },
      {
        id: 'player-skew',
        label: 'Перекос по игроку',
        status: 'pass',
        value: 0.8,
        threshold: 'предупреждение >20%',
        message: 'Один игрок не доминирует в выборке.',
      },
      {
        id: 'freshness',
        label: 'Свежесть источника',
        status: 'pass',
        value: 0.3,
        threshold: 'предупреждение >30 ч, блокировка >72 ч',
        message: 'Источник обновлён 0.3 ч назад.',
      },
    ],
  },
  reliability: {
    sampleMode: 'stable',
    servedFrom: 'live',
    currentWeight: 1,
    historicalWeight: 0,
    stableAtRuns: 200,
    previousCohortId: null,
    limitations: [
      'Выборка содержит только 12-победные забеги и не включает проигравшие контрольные колоды.',
    ],
  },
  history: [{
    id: '36.0:6d08469a64ab61f4',
    patchVersion: '36.0',
    poolFingerprint: '6d08469a64ab61f4',
    from: '2026-07-24T04:21:58Z',
    to: '2026-07-30T04:11:39Z',
    generatedAt: '2026-07-30T10:00:00Z',
    runsAnalyzed: 500,
    qualityStatus: 'healthy',
    topCombination: {
      cards: ['Увеличительная глефа', 'Клещ-библиофил'],
      score: 78,
      interactionDeltaPoints: 1.2,
    },
  }],
  combinations: [{
    cards: [
      {
        id: 'REV_509',
        name: 'Увеличительная глефа',
        cost: 3,
        type: 'WEAPON',
        rarity: 'RARE',
        deckWinRate: 58.7,
        twelveWinRunQuality: 89.4,
        runs: 47,
      },
      {
        id: 'REV_511',
        name: 'Клещ-библиофил',
        cost: 2,
        type: 'MINION',
        rarity: 'COMMON',
        deckWinRate: 57.3,
        twelveWinRunQuality: 88.6,
        runs: 65,
      },
    ],
    observedRuns: 20,
    expectedRuns: 9.3,
    supportPercent: 4,
    lift: 1.94,
    adjustedLift: 1.94,
    expectedRunQuality: 89.4,
    actualRunQuality: 90.6,
    interactionDeltaPoints: 1.2,
    adjustedInteractionDeltaPoints: 1.2,
    interactionEvidence: {
      cardARuns: 47,
      cardBRuns: 65,
      pairRuns: 20,
      cardAQuality: 88.9,
      cardBQuality: 88.7,
      classBaselineQuality: 88.2,
    },
    interactionSignal: 'positive',
    classification: 'confirmed',
    controlledInteractionDeltaPoints: 1.1,
    matchedControl: {
      pairRuns: 20,
      controlRuns: 40,
      pairRunQuality: 90.4,
      controlRunQuality: 89.3,
      deltaPoints: 1.1,
      averageSimilarity: 0.66,
      distinctDays: 7,
      distinctPlayers: 20,
      maxPlayerShare: 0.05,
    },
    historicalWeight: 0,
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
      twelveWinRunQuality: 89.1,
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

const baseCombination = payload.combinations[0];
const payloadWithCategories: ArenaSynergyPayload = {
  ...payload,
  combinations: [
    baseCombination,
    {
      ...baseCombination,
      cards: [
        { ...baseCombination.cards[0], id: 'TLC_100', name: 'Носок Скользкое Копье' },
        { ...baseCombination.cards[1], id: 'TLC_101', name: 'Реликвия истребления' },
      ],
      observedRuns: 13,
      classification: 'promising',
      controlledInteractionDeltaPoints: 2.2,
      confidence: 'medium',
      score: 49,
      matchedControl: {
        ...baseCombination.matchedControl!,
        pairRuns: 13,
        controlRuns: 26,
        deltaPoints: 2.2,
        averageSimilarity: 0.63,
        distinctDays: 6,
        distinctPlayers: 13,
        maxPlayerShare: 1 / 13,
      },
    },
    {
      ...baseCombination,
      cards: [
        { ...baseCombination.cards[0], id: 'TLC_200', name: 'Две хорошие карты' },
        { ...baseCombination.cards[1], id: 'TLC_201', name: 'Без доказанной синергии' },
      ],
      classification: 'popular',
      controlledInteractionDeltaPoints: 0,
      adjustedInteractionDeltaPoints: 0,
      interactionSignal: 'neutral',
      confidence: 'exploratory',
      score: 31,
      matchedControl: {
        ...baseCombination.matchedControl!,
        pairRunQuality: 89.4,
        controlRunQuality: 89.4,
        deltaPoints: 0,
      },
    },
  ],
};

const draftCards = Array.from(new Map([
  ...payloadWithCategories.combinations.flatMap(combination => combination.cards),
  ...payloadWithCategories.redraft.map(row => row.card),
].map(card => [card.id, card])).values());

const draftPayload: ArenaSynergyPayload = {
  ...payloadWithCategories,
  selectedClass: 'MAGE',
  draftAdvisor: {
    status: 'shadow',
    deckSize: 30,
    minimumRuns: 13,
    cards: draftCards,
    targetCurve: [
      {
        id: 'LOW',
        label: '0–2',
        minimumCost: 0,
        maximumCost: 2,
        targetShare: 0.4,
        targetCount: 12,
      },
      {
        id: 'MID',
        label: '3–4',
        minimumCost: 3,
        maximumCost: 4,
        targetShare: 0.33,
        targetCount: 10,
      },
      {
        id: 'HIGH',
        label: '5–6',
        minimumCost: 5,
        maximumCost: 6,
        targetShare: 0.17,
        targetCount: 5,
      },
      {
        id: 'TOP',
        label: '7+',
        minimumCost: 7,
        maximumCost: null,
        targetShare: 0.1,
        targetCount: 3,
      },
    ],
    pairCoverage: payloadWithCategories.combinations.length,
    limitations: [
      'Рейтинг не прогнозирует число побед.',
      'Популярные пары без отдельного эффекта не дают бонус.',
    ],
  },
};

function withoutMatchedControls(combination: ArenaCombination): ArenaCombination {
  const legacy = { ...combination };
  delete legacy.classification;
  delete legacy.controlledInteractionDeltaPoints;
  delete legacy.matchedControl;
  return legacy;
}

const meta = {
  title: 'Admin/Arena Synergies',
  render: args => <ArenaSynergyPanel {...args} />,
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
    payload: payloadWithCategories,
    loading: false,
    error: null,
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getAllByText('Подтверждена')).toHaveLength(2);
    await expect(canvas.getAllByText('Перспективная')).toHaveLength(2);
    await expect(canvas.getAllByText('Просто популярная')).toHaveLength(2);
    await expect(canvas.getAllByText(/40 похожих/)).toHaveLength(2);

    await userEvent.selectOptions(canvas.getByLabelText('Класс'), 'MAGE');
    await expect(args.onClassChange).toHaveBeenCalledWith('MAGE');

    await userEvent.click(canvas.getByRole('tab', { name: 'Redraft' }));
    await expect(canvas.getByRole('tab', { name: 'Redraft' })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByText('Злобный пусточешуйник')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Обновить данные' }));
    await expect(args.onReload).toHaveBeenCalled();

    await userEvent.click(canvas.getByRole('tab', { name: 'Сочетания' }));
    await expect(canvas.getByRole('tab', { name: 'Сочетания' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(canvas.getByRole('tab', { name: 'Помощник драфта' }));
    await expect(canvas.getByText(/Выберите конкретный класс/)).toBeVisible();
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

export const LastKnownGood: Story = {
  args: {
    payload: {
      ...payload,
      summary: {
        ...payload.summary,
        warnings: [
          'Новый источник недоступен или не прошёл проверки качества: показан последний надёжный расчёт.',
        ],
      },
      reliability: {
        ...payload.reliability,
        sampleMode: 'last-known-good',
        servedFrom: 'last-known-good',
        currentWeight: 0,
        historicalWeight: 1,
      },
      combinations: payload.combinations.map(withoutMatchedControls),
    },
    loading: false,
    error: null,
  },
};

export const DraftAdvisor: Story = {
  args: {
    payload: draftPayload,
    loading: false,
    error: null,
    selectedClass: 'MAGE',
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('tab', { name: 'Помощник драфта' }));
    await expect(canvas.getByText('Черновик v1')).toBeVisible();

    await userEvent.selectOptions(
      canvas.getByLabelText('Карта для добавления'),
      'REV_509',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Добавить' }));
    await expect(canvas.getByRole('button', {
      name: 'Убрать Увеличительная глефа из колоды',
    })).toBeVisible();

    await userEvent.selectOptions(canvas.getByLabelText('Вариант 1'), 'REV_511');
    await userEvent.selectOptions(canvas.getByLabelText('Вариант 2'), 'TLC_100');
    await userEvent.selectOptions(canvas.getByLabelText('Вариант 3'), 'JAIL_733');

    await expect(canvas.getAllByRole('meter')).toHaveLength(9);
    await expect(canvas.getAllByText(/уверенность/i)).toHaveLength(3);
  },
};
