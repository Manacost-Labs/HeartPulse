import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { RadarCandidate, RadarReport } from '../model/types';
import { RadarSkeleton, RadarUnavailable } from './RadarSkeleton';
import { RadarDisclaimer, RadarView } from './RadarView';

const trend = (rows: Array<[string, number, number]>) => rows.map(([label, winrate, popularity]) => ({ period: label, label, winrate, popularity, games: null }));

// Числа и тексты взяты из примера hs-data-api (25.10.2026), посты урезаны.
const ritual: RadarCandidate = {
  id: 'card:BE_085', kind: 'card',
  entity: { id: 'BE_085', dbfId: 129793, name: 'Ритуал призыва', nameEn: 'Ritual of Summoning', classKey: 'warlock', href: '/standard/cards/standard/BE_085/' },
  confidence: 75, previousConfidence: 68,
  headline: 'Ритуал призыва — самый частый и самый обсуждаемый элемент Зоолока',
  verdict: 'На Легенде у карты 55,9% винрейта при 18,8% популярности за 7 дней, а за последние сутки доля колод выросла до 27,2%. Карта питает Зоолок и остальные ритуальные колоды Чернокнижника.',
  reasons: ['Винрейт на Легенде 55,9%, популярность растёт', 'Зоолок — самый сильный популярный архетип'],
  suggestedChange: 'Стоимость 2 → 3 или статы призываемых существ 3/5 → 3/4',
  stats: {
    source: 'hsreplay', rankLabel: 'Легенда', periodLabel: 'Неделя', winrate: 55.9, popularity: 18.82, games: 64_641,
    trend: trend([['Сутки', 56.47, 27.17], ['3 дня', 55.85, 25.67], ['Неделя', 55.9, 18.82], ['2 недели', 55.92, 13.81]]),
  },
  social: {
    mentions: 7, reddit: 6, x: 1, sentiment: 'negative', stance: 'wants_nerf',
    summary: 'Популярный тред «Nerf Ritual of Summoning» набрал 352 очка и 253 комментария.',
    posts: [
      { source: 'reddit', kind: 'post', url: 'https://reddit.com/r/hearthstone/comments/1xdju41/nerf_ritual_of_summoning/', author: 'Sea_Particular_244',
        score: 352, comments: 253, title: 'Nerf Ritual of Summoning.', text: 'They are not insta-nerfing Rituals because they\'re part of the new expansion.',
        community: 'r/hearthstone', publishedAt: '2026-10-23T17:06:53.000Z', official: false },
      { source: 'x', kind: 'tweet', url: 'https://x.com/hearthstone', author: 'PlayHearthstone', score: 120, comments: null, title: null,
        text: 'We are watching the meta closely.', community: null, publishedAt: '2026-10-24T09:00:00.000Z', official: true },
    ],
  },
  precedents: [{
    id: '36.4.2:JAIL_202', patch: '36.4.2', date: '2026-09-04T00:48:51.000Z', name: 'Паучок', classKey: 'druid', direction: 'nerf',
    changes: ['Здоровье: 3 → 2'], summary: null, setAgeDays: null, before: null, after: null,
    similarity: ['дешёвое существо-призыв, усиливаемое баффами'], cited: true,
    cardHref: '/standard/cards/wild/JAIL_202/', patchHref: '/standard/patches/?version=36.4.2',
  }],
  firstSeenAt: '2026-10-25T10:12:15.000Z',
};
const zoolock: RadarCandidate = {
  ...ritual, id: 'archetype:standard:Zoolock', kind: 'archetype', confidence: 42, previousConfidence: null, suggestedChange: null, headline: null,
  entity: { id: 'zoolock', dbfId: null, name: 'Зоолок', nameEn: 'Zoolock', classKey: 'warlock', href: '/standard/archetypes/standard/zoolock/' },
  verdict: 'Сильная, но уже не растущая колода: отдельное изменение может и не понадобиться.', reasons: [],
  stats: { source: 'hsguru', rankLabel: 'Все ранги', periodLabel: 'Баны', winrate: 63, popularity: 11.1, games: 48_210, trend: [] },
  social: { mentions: 0, reddit: 0, x: 0, sentiment: 'no_data', stance: 'no_data', summary: null, posts: [] },
  precedents: [],
};
const druid: RadarCandidate = {
  ...ritual, id: 'class:standard:DRUID', kind: 'class', confidence: 48, previousConfidence: null,
  entity: { id: 'DRUID', dbfId: null, name: 'Друид', nameEn: 'Druid', classKey: 'druid', href: null },
  headline: 'Друид провалился после выхода дополнения',
  verdict: 'Класс держит 46,3% винрейта при 1,5% популярности: точечные баффы новых карт вероятны.',
  reasons: ['Худший винрейт среди классов'], suggestedChange: 'Расцветание: стоимость 2 → 1',
  stats: { source: 'hsguru', rankLabel: 'Все ранги', periodLabel: 'Баны', winrate: 46.28, popularity: 1.5, games: 20_104, trend: [] },
  social: { ...ritual.social, mentions: 4, reddit: 4, x: 0, sentiment: 'mixed', stance: 'wants_buff', summary: 'Игроки просят вернуть друиду ранний темп.' },
};

const report: RadarReport = {
  schemaVersion: 1, generatedAt: '2026-10-25T10:12:15.000Z', model: 'claude-sonnet-5-5', format: 'standard',
  patch: { version: '37.0.0', href: '/standard/patches/?version=37.0.0' },
  window: { from: '2026-10-18T00:00:00.000Z', to: '2026-10-25T10:10:48.000Z' },
  sources: [
    { id: 'hsguru', label: 'HSGuru — архетипы и классы', items: null },
    { id: 'hsreplay', label: 'HSReplay — карты', items: null },
    { id: 'reddit', label: 'Reddit', items: 640 },
    { id: 'x', label: 'X', items: 122 },
  ],
  summary: 'Главная проблема текущего баланса — Чернокнижник: сообщество массово требует нерфа ритуалов, а друид после выхода дополнения провалился.',
  nerfs: [ritual, zoolock], buffs: [druid], history: null, demo: false,
};

const meta = {
  title: 'Standard/Radar',
  component: RadarView,
  args: { report },
  decorators: [Story => <div className="radar-page" style={{ padding: 16 }}><RadarDisclaimer /><Story /></div>],
} satisfies Meta<typeof RadarView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Forecast: Story = {
  parameters: { docs: { description: { story: 'Сводка, переключатель «нерфы ↔ баффы», фильтры и карточки кандидатов со шкалой уверенности, статистикой и постами.' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('article')).toHaveLength(2);
    await userEvent.click(canvas.getByRole('tab', { name: /Радар баффов/ }));
    await waitFor(() => expect(canvas.getAllByRole('article')).toHaveLength(1));
    await userEvent.click(canvas.getByRole('tab', { name: /Радар нерфов/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Архетипы' }));
    await waitFor(() => expect(canvas.getByRole('heading', { level: 3, name: 'Зоолок' })).toBeVisible());
    await expect(canvas.queryByRole('heading', { level: 3, name: 'Ритуал призыва' })).toBeNull();
  },
};

export const FiltersMatchNothing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'от 75' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Классы' }));
    await userEvent.click(canvas.getByRole('tab', { name: /Радар баффов/ }));
    await expect(canvas.getByText('Под выбранные фильтры кандидатов нет.')).toBeVisible();
  },
};

// История патчей приходит из hs-data-api; формулировки и числа здесь — пример вёрстки.
export const WithHistory: Story = {
  args: { report: { ...report, history: {
    summary: 'Пример сводки: Blizzard чаще ослабляет одну ключевую карту колоды, чем весь архетип.',
    balancePatches: 24, from: '2024-03-19T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z',
    patterns: [
      { title: 'Новые карты набора редко меняют в первые две недели', text: null, count: null },
      { title: 'Ослабление чаще идёт через стоимость ключевой карты', text: 'Архетип целиком почти не трогают: меняют одну-две карты, на которых он держится.', count: 14 },
    ],
  } } },
};

export const EmptySection: Story = { args: { report: { ...report, buffs: [] } } };

export const Demo: Story = { args: { report: { ...report, demo: true } } };

export const Loading: Story = { render: () => <RadarSkeleton /> };

export const Unavailable: Story = { args: { report }, render: () => <RadarUnavailable onRetry={fn()} /> };
