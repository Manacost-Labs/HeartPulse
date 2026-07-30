import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { rankArenaDraftChoices } from '../../shared/arenaDraftAdvisor';
import type {
  ArenaCombination,
  ArenaDraftAdviceRequest,
  ArenaDraftAdviceResponse,
  ArenaSynergyCard,
  ArenaSynergyPayload,
} from '../../shared/arenaSynergyContract';
import {
  ArenaDraftAssistantWorkbench,
} from './ContestAdminArenaDraftAssistant';
import {
  createEmptyDraftState,
  type ArenaDraftAssistantState,
} from './arenaDraftAssistantModel';
import './contests.css';

const cards: ArenaSynergyCard[] = [
  { id: 'CS2_029', name: 'Огненный шар', cost: 4, type: 'SPELL', rarity: 'BASIC', deckWinRate: 60.2, twelveWinRunQuality: 91.2, runs: 84 },
  { id: 'CS2_024', name: 'Ледяная стрела', cost: 2, type: 'SPELL', rarity: 'BASIC', deckWinRate: 59.1, twelveWinRunQuality: 90.4, runs: 92 },
  { id: 'CS2_033', name: 'Водный элементаль', cost: 4, type: 'MINION', rarity: 'BASIC', deckWinRate: 58.2, twelveWinRunQuality: 89.8, runs: 75 },
  { id: 'CS2_032', name: 'Волна огня', cost: 7, type: 'SPELL', rarity: 'BASIC', deckWinRate: 57.4, twelveWinRunQuality: 89.1, runs: 63 },
  { id: 'EX1_559', name: 'Архимаг Антонидас', cost: 7, type: 'MINION', rarity: 'LEGENDARY', deckWinRate: 62.4, twelveWinRunQuality: 92.8, runs: 46 },
  { id: 'EX1_608', name: 'Ученица чародея', cost: 2, type: 'MINION', rarity: 'COMMON', deckWinRate: 60.8, twelveWinRunQuality: 91.7, runs: 71 },
  { id: 'EX1_287', name: 'Контрзаклинание', cost: 3, type: 'SPELL', rarity: 'RARE', deckWinRate: 57.8, twelveWinRunQuality: 89.6, runs: 58 },
  { id: 'EX1_294', name: 'Зеркальная сущность', cost: 3, type: 'SPELL', rarity: 'COMMON', deckWinRate: 56.9, twelveWinRunQuality: 88.9, runs: 55 },
  { id: 'STORY_LEGEND_2', name: 'Хранительница портала', cost: 5, type: 'MINION', rarity: 'LEGENDARY', deckWinRate: 61.5, twelveWinRunQuality: 92.1, runs: 41 },
  { id: 'STORY_LEGEND_3', name: 'Повелитель рун', cost: 6, type: 'MINION', rarity: 'LEGENDARY', deckWinRate: 59.8, twelveWinRunQuality: 90.9, runs: 36 },
];

function combination(
  first: ArenaSynergyCard,
  second: ArenaSynergyCard,
  delta: number,
  classification: 'confirmed' | 'promising' = 'confirmed',
): ArenaCombination {
  return {
    cards: [first, second],
    observedRuns: classification === 'confirmed' ? 24 : 15,
    expectedRuns: 10.4,
    supportPercent: 8.2,
    lift: 1.78,
    adjustedLift: 1.72,
    expectedRunQuality: 89.3,
    actualRunQuality: 89.3 + delta,
    interactionDeltaPoints: delta,
    adjustedInteractionDeltaPoints: delta,
    interactionEvidence: {
      cardARuns: first.runs,
      cardBRuns: second.runs,
      pairRuns: 24,
      cardAQuality: first.twelveWinRunQuality ?? 89,
      cardBQuality: second.twelveWinRunQuality ?? 89,
      classBaselineQuality: 88.7,
    },
    interactionSignal: 'positive',
    classification,
    controlledInteractionDeltaPoints: delta,
    matchedControl: {
      pairRuns: 24,
      controlRuns: 48,
      pairRunQuality: 91.2,
      controlRunQuality: 91.2 - delta,
      deltaPoints: delta,
      averageSimilarity: 0.7,
      distinctDays: 7,
      distinctPlayers: 22,
      maxPlayerShare: 0.08,
    },
    historicalWeight: 0,
    score: 84,
    confidence: classification === 'confirmed' ? 'high' : 'medium',
    forcedPackageShare: 0,
  };
}

const payload: ArenaSynergyPayload = {
  schemaVersion: 2,
  generatedAt: '2026-07-30T21:40:00.000Z',
  selectedClass: 'MAGE',
  source: {
    winningDecksFetchedAt: '2026-07-30T21:35:00.000Z',
    cardStatsFetchedAt: '2026-07-30T21:36:00.000Z',
  },
  cohort: {
    id: '36.0:mage:storybook',
    patchVersion: '36.0',
    patchPublishedAt: '2026-07-20T00:00:00.000Z',
    poolFingerprint: 'storybook',
    from: '2026-07-20T00:00:00.000Z',
    to: '2026-07-30T21:35:00.000Z',
  },
  summary: {
    runsAvailable: 500,
    runsAnalyzed: 500,
    redraftRuns: 468,
    recordCounts: { '12-0': 85, '12-1': 176, '12-2': 239 },
    warnings: [],
  },
  availableClasses: [
    { id: 'ALL', label: 'Все классы', runs: 500 },
    { id: 'MAGE', label: 'Маг', runs: 92 },
    { id: 'PALADIN', label: 'Паладин', runs: 76 },
  ],
  methodology: {
    sampleLimit: 500,
    minimumPairRuns: 12,
    minimumLift: 1.25,
    packageFilterShare: 0.8,
    classStratified: true,
    outcomeMetric: 'Качество 12W-забега',
    note: 'Storybook fixture',
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
      unknownCardReferences: 0,
      totalCardReferences: 15_000,
      maxClassShare: 0.24,
      maxPlayerShare: 0.04,
      sourceAgeHours: 0.2,
      volumeRatioToPrevious: 1,
    },
    checks: [],
  },
  reliability: {
    sampleMode: 'stable',
    servedFrom: 'live',
    currentWeight: 1,
    historicalWeight: 0,
    stableAtRuns: 40,
    previousCohortId: null,
    limitations: [],
  },
  draftAdvisor: {
    status: 'shadow',
    deckSize: 30,
    minimumRuns: 20,
    cards,
    copyProfiles: [],
    targetCurve: [
      { id: 'LOW', label: '0–2', minimumCost: 0, maximumCost: 2, targetShare: 0.4, targetCount: 12 },
      { id: 'MID', label: '3–4', minimumCost: 3, maximumCost: 4, targetShare: 0.33, targetCount: 10 },
      { id: 'HIGH', label: '5–6', minimumCost: 5, maximumCost: 6, targetShare: 0.17, targetCount: 5 },
      { id: 'TOP', label: '7+', minimumCost: 7, maximumCost: null, targetShare: 0.1, targetCount: 3 },
    ],
    pairCoverage: 42,
    limitations: [
      'Модель обучена только на финальных 12-победных колодах.',
      'Текст карты и архетип плана на игру пока не оцениваются отдельно.',
    ],
  },
  history: [],
  redraft: [],
  combinations: [
    combination(cards[4], cards[5], 3.4),
    combination(cards[4], cards[0], 2.6),
    combination(cards[2], cards[1], 1.3, 'promising'),
  ],
};

const initialDraft: ArenaDraftAssistantState = {
  version: 1,
  classId: 'MAGE',
  deckCardIds: [
    'CS2_024',
    'CS2_024',
    'CS2_029',
    'CS2_033',
    'EX1_608',
    'EX1_287',
    'EX1_294',
    'CS2_032',
  ],
  candidateCardIds: ['CS2_033', 'EX1_559', 'CS2_029'],
  selectedCardId: null,
};

async function storyAdvice(
  request: ArenaDraftAdviceRequest,
  signal?: AbortSignal,
): Promise<ArenaDraftAdviceResponse> {
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 80);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
  const { model, ...advice } = rankArenaDraftChoices({
    context: payload.draftAdvisor!,
    combinations: payload.combinations,
    deckCardIds: request.deckCardIds,
    candidateCardIds: request.candidateCardIds,
  });
  return {
    schemaVersion: 1,
    generatedAt: payload.generatedAt,
    selectedClass: 'MAGE',
    model,
    cohort: payload.cohort,
    sample: {
      runsAnalyzed: payload.summary.runsAnalyzed,
      dataQualityStatus: payload.dataQuality.status,
      sampleMode: payload.reliability.sampleMode,
      servedFrom: payload.reliability.servedFrom,
    },
    advice,
  };
}

const productionCardImage = (cardId: string) => (
  `https://arena.hs-manacost.ru/api/card-image/${encodeURIComponent(cardId)}/full.webp`
);
const productionCardThumb = (cardId: string) => (
  `https://arena.hs-manacost.ru/api/card-image/${encodeURIComponent(cardId)}/thumb.webp`
);

const meta = {
  title: 'Arena/Draft Assistant',
  component: ArenaDraftAssistantWorkbench,
  decorators: [
    Story => (
      <div className="draft-assistant-story-shell">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    payload,
    initialDraft,
    requestAdvice: storyAdvice,
    resolveCardImage: productionCardImage,
    resolveCardThumb: productionCardThumb,
    onClassChange: () => {},
    onRefresh: () => {},
  },
} satisfies Meta<typeof ArenaDraftAssistantWorkbench>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyRecommendation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/Лучший выбор:/)).toBeVisible();
    await expect(canvas.getByRole('button', { name: /Добавить выбранную в колоду/ })).toBeEnabled();
    await expect(canvas.getByText('Выбрана для добавления')).toBeVisible();
  },
};

export const AutomaticOpeningOffer: Story = {
  args: {
    initialDraft: createEmptyDraftState('MAGE'),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Архимаг Антонидас')).toBeVisible();
    await expect(canvas.getByText('Хранительница портала')).toBeVisible();
    await expect(canvas.getByText('Повелитель рун')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Сравнить легендарные группы' })).toBeEnabled();
  },
};
