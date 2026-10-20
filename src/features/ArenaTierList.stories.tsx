import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { TierList } from './DeferredRoutes';
import { useArenaTierList } from '../modules/arenaTierList/public';
import type { TierCard, TierlistData, TierlistSource } from '../modules/arenaTierList/public';

const deathwingRender = new URL('./fixtures/deathwing-card.webp', import.meta.url).href;
const frameRenders = {
  spell: new URL('./fixtures/fireball-render.webp', import.meta.url).href,
  minion: new URL('./fixtures/skeleton-crew-render.webp', import.meta.url).href,
  location: new URL('./fixtures/horizons-edge-render.webp', import.meta.url).href,
  legendary: new URL('./fixtures/leeroy-render.webp', import.meta.url).href,
};
const FRAME_ROTATION = [
  { rarity: 'common', type: 'SPELL', image: frameRenders.spell },
  { rarity: 'rare', type: 'MINION', image: frameRenders.minion },
  { rarity: 'rare', type: 'LOCATION', image: frameRenders.location },
  { rarity: 'epic', type: 'MINION', image: frameRenders.minion },
  { rarity: 'legendary', type: 'MINION', image: frameRenders.legendary },
  { rarity: 'legendary', type: 'LOCATION', image: frameRenders.location },
] as const;
/** Two tiers whose rows mix every frame and rarity, in each class section. */
function rarityFrameData(): TierlistData {
  const tierCards = (tier: string, count: number) => Array.from({ length: count }, (_, index) => {
    const frame = FRAME_ROTATION[index % FRAME_ROTATION.length];
    return { cardId: `${tier}_frame_${index}`, name: `${tier}: ${frame.type} ${index}`, score: 80 - index,
      rarity: frame.rarity, classKey: 'any' };
  });
  const tiers = [{ tier: 'S', count: 6 }, { tier: 'A', count: 9 }];
  return { ...data, cards: Object.fromEntries(tiers.flatMap(({ tier, count }) => Array.from({ length: count }, (_, index) => {
    const frame = FRAME_ROTATION[index % FRAME_ROTATION.length];
    return [`${tier}_frame_${index}`, { cost: index, imageHa: '', imageRu: frame.image, type: frame.type }];
  }))), sections: data.sections.map(section => ({ ...section, totalCards: 15, tiers: tiers.map(({ tier, count }) => ({
    tier, label: tier, description: '', cards: tierCards(tier, count),
  })) })) };
}

const cards: TierCard[] = [
  { cardId: 'zero', name: 'Карта за ноль маны', score: 90, rarity: 'common', classKey: 'mage' },
  { cardId: 'five', name: 'Карта за пять маны', score: 80, rarity: 'rare', classKey: 'mage' },
  { cardId: 'ten', name: 'Карта за десять маны', score: 75, rarity: 'legendary', classKey: 'mage' },
  { cardId: 'twelve', name: 'Карта за двенадцать маны', score: 70, rarity: 'epic', classKey: 'mage' },
];
const data: TierlistData = {
  updatedAt: '2026-10-12T07:00:00Z', source: 'hsreplay.net',
  sections: ['death-knight', 'demon-hunter', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior', 'any'].map((id, index) => ({
    id, name: ['Рыцарь смерти', 'Охотник на демонов', 'Друид', 'Охотник', 'Маг', 'Паладин', 'Жрец', 'Разбойник', 'Шаман', 'Чернокнижник', 'Воин', 'Нейтральные'][index],
    color: '#745133', textDark: true, totalCards: cards.length,
    tiers: [
      { tier: 'S', label: 'Отлично', description: 'Авто-пик — доминирующие карты текущего метагейма.', cards: cards.slice(0, 1) },
      { tier: 'A', label: 'Хорошо', description: 'Отличные карты, очень сильны в большинстве ситуаций.', cards: cards.slice(1) },
    ],
  })),
  cards: Object.fromEntries(cards.map((card, index) => [card.cardId, {
    cost: [0, 5, 10, 12][index], imageHa: '', imageRu: null, type: 'MINION',
  }])),
};
function PageExample({ deathwing = false, switching = false, manyCards = false, rarityFrames = false }: { deathwing?: boolean; switching?: boolean; manyCards?: boolean; rarityFrames?: boolean }) {
  const [source, setSource] = useState<TierlistSource>('hsreplay');
  const exampleData = deathwing ? { ...data, cards: { CATA_190h: {
    cost: 10, imageHa: deathwingRender,
    imageRu: 'https://d15f34w2p8l1cc.cloudfront.net/hearthstone/8b156ed44c95c0a2c6f542d239aa4f87afe8b3bb600b277c8ab245aa51a5c0fe.png', type: 'hero',
  } }, sections: data.sections.map(section => ({ ...section, totalCards: 1, tiers: [{
    tier: 'S', label: 'Отлично', description: '', cards: [{ ...cards[2], cardId: 'CATA_190h',
      name: 'Смертокрыл Разрушитель миров', classKey: 'any' }],
  }] })) } : manyCards ? { ...data, sections: data.sections.map(section => ({ ...section,
    totalCards: 200, tiers: [{ tier: 'S', label: 'Отлично', description: '',
      cards: Array.from({ length: 200 }, (_, index) => ({ ...cards[0], cardId: `fixture_${index}`, name: `Карта ${index}` })) }],
  })) } : rarityFrames ? rarityFrameData() : data;
  return <div className="arena-app-shell arena-app-game-data arena-app-tierlist" style={{ padding: 16 }}>
    <TierList data={exampleData} loading={false} error={null} companionIds={new Set<string>()}
      tierlistSource={source} onTierlistSourceChange={setSource} switchingTierlistSource={switching}
      onNavigate={fn()} authUser={null} subscriptionStatus={null} subscriptionLoading={false}
      onRefreshSubscription={async () => null} accessGranted />
  </div>;
}
const meta = { title: 'Arena/Tier list page', component: PageExample } satisfies Meta<typeof PageExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Gallery: Story = {};
export const Filtering: Story = {
  play: async ({ canvas, canvasElement }) => {
    const results = () => canvasElement.querySelectorAll('.tierlist-card-grid button').length;
    await expect(canvas.queryByText(/Авто-пик —/)).not.toBeInTheDocument();
    await expect(canvas.queryByText(/12\.10\.2026/)).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Маг' }));
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Мана' }), '10');
    await waitFor(() => expect(results()).toBe(2));
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Редкость' }), 'legendary');
    await waitFor(() => expect(results()).toBe(1));
    await userEvent.type(canvas.getByRole('searchbox'), 'нет такой карты');
    await expect(await canvas.findByText('Карты не найдены')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Сбросить' }));
    await waitFor(() => expect(results()).toBe(4));
    await expect(canvas.getByRole('button', { name: 'Маг' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Мана' }), '0');
    await waitFor(() => expect(results()).toBe(1));
    await userEvent.click(canvas.getByRole('button', { name: 'Сбросить' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Таблица' }));
    await expect(canvas.getByRole('button', { name: 'Таблица' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'HearthArena' }));
    await expect(canvas.queryByRole('button', { name: 'Таблица' })).not.toBeInTheDocument();
    await waitFor(() => expect(results()).toBe(4));
  },
};

export const DeathwingCard: Story = {
  args: { deathwing: true },
  play: async ({ canvas }) => {
    const image = canvas.getByRole('img', { name: 'Смертокрыл Разрушитель миров' });
    await expect(image).toHaveAttribute('src', deathwingRender);
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть карту Смертокрыл Разрушитель миров' }));
    await expect(document.querySelector('.card-modal-lightbox img')).toHaveAttribute('src', deathwingRender);
    await userEvent.keyboard('{Escape}');
  },
};
/** Locations, dragon-framed legendaries and every rarity glow in two tiers. */
export const RarityFrames: Story = { args: { rarityFrames: true } };
export const SwitchingSources: Story = {
  args: { switching: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'HearthArena' })).toBeEnabled();
    await userEvent.click(canvas.getByRole('button', { name: 'HearthArena' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Firestone' }));
    await expect(canvas.getByRole('button', { name: 'Firestone' })).toHaveAttribute('aria-pressed', 'true');
  },
};
export const LargeGallery: Story = {
  args: { manyCards: true },
  play: async ({ canvas, canvasElement }) => {
    const results = () => canvasElement.querySelectorAll('.tierlist-card-grid button').length;
    const initial = window.matchMedia('(max-width: 639px)').matches ? 36 : 48;
    await expect(results()).toBe(initial);
    await userEvent.click(canvas.getByRole('button', { name: /Показать/ }));
    await waitFor(() => expect(results()).toBe(initial * 2));
  },
};

function SourceRequestExample() {
  const { source, state, changeSource, retry } = useArenaTierList('story-account', true);
  return <div>
    {(['hsreplay', 'heartharena', 'firestone'] as const).map(provider => <button key={provider}
      onClick={() => changeSource(provider)}>{provider}</button>)}
    <button onClick={retry}>Перепроверить доступ</button>
    <output aria-label="Состояние источника">{source}:{state.status}:{state.data?.source ?? 'none'}</output>
  </div>;
}
let denyStoryAccess = false;
let failStorySource: string | null = null;
export const SourceRequestLifecycle: Story = {
  render: () => <SourceRequestExample />,
  beforeEach: () => {
    const original = window.fetch;
    denyStoryAccess = false;
    failStorySource = null;
    window.fetch = async (input, options) => {
      const url = String(input);
      if (!url.startsWith('/api/tierlist?')) return original(input, options);
      const provider = new URL(url, window.location.origin).searchParams.get('source');
      await new Promise(resolve => setTimeout(resolve, provider === 'heartharena' ? 80 : 10));
      if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (provider === failStorySource) throw new Error('Offline fixture');
      return denyStoryAccess ? new Response(null, { status: 403 }) : Response.json({ ...data,
        source: provider === 'heartharena' ? 'heartharena.com' : provider === 'firestone' ? 'firestoneapp.com' : 'hsreplay.net',
      });
    };
    return () => { window.fetch = original; };
  },
  play: async ({ canvas }) => {
    const state = canvas.getByLabelText('Состояние источника');
    await waitFor(() => expect(state).toHaveTextContent('hsreplay:ready:hsreplay.net'));
    await userEvent.click(canvas.getByRole('button', { name: 'heartharena' }));
    await userEvent.click(canvas.getByRole('button', { name: 'firestone' }));
    await waitFor(() => expect(state).toHaveTextContent('firestone:ready:firestoneapp.com'));
    await userEvent.click(canvas.getByRole('button', { name: 'hsreplay' }));
    await waitFor(() => expect(state).toHaveTextContent('hsreplay:ready:hsreplay.net'));
    failStorySource = 'heartharena';
    await userEvent.click(canvas.getByRole('button', { name: 'heartharena' }));
    await waitFor(() => expect(state).toHaveTextContent('heartharena:error:none'));
    await userEvent.click(canvas.getByRole('button', { name: 'hsreplay' }));
    await waitFor(() => expect(state).toHaveTextContent('hsreplay:ready:hsreplay.net'));
    denyStoryAccess = true;
    await userEvent.click(canvas.getByRole('button', { name: 'Перепроверить доступ' }));
    await waitFor(() => expect(state).toHaveTextContent('hsreplay:denied:none'));
  },
};
