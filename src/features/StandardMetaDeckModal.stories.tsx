import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { DeckModal } from './StandardMetaDeckModal';
import type { HsReplayDeckCard } from './HsReplayDeckList';

const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const deckCards: HsReplayDeckCard[] = Array.from({ length: 15 }, (_, index) => ({
  id: `META_TEST_${index + 1}`, dbfId: 92_000 + index, name: `Тестовая карта ${index + 1}`, cost: index % 10,
  rarity: index % 7 === 0 ? 'LEGENDARY' : 'COMMON', elite: index % 7 === 0, count: index % 7 === 0 ? 1 : 2, image: pixel,
}));
const item = { archetype: 'Imbue Shaman', archetypeLabel: 'Шаман на усилениях', classKey: 'shaman' as const };
const recommendation = {
  archetype: item.archetype, archetypeLabel: item.archetypeLabel, deckCode: 'AAECAaoIBMeta'.repeat(6), streamer: 'Тестер',
  sampleGames: 1240, winrate: 54.2, classKey: 'shaman' as const, deckCards,
};
const state = { item, recommendation, preview: null, loadingRecommendation: false, loadingPreview: false, error: '', previewError: '' };

const meta = {
  title: 'Constructed/Meta deck modal', component: DeckModal,
  args: { state, onClose: fn(), onRenderPreview: fn() },
  parameters: { layout: 'fullscreen', fullPage: true },
} satisfies Meta<typeof DeckModal>;
export default meta;
type Story = StoryObj<typeof meta>;
const dialog = () => within(document.body).getByRole('dialog');

export const Ready: Story = { play: async () => {
  // The dialog fades in; wait for its entrance before checking visibility.
  await waitFor(() => expect(within(dialog()).getByRole('button', { name: 'Скопировать код колоды' })).toBeVisible());
} };
export const LoadingRecommendation: Story = {
  args: { state: { ...state, recommendation: null, loadingRecommendation: true } },
  play: async () => {
    const modal = within(dialog());
    await expect(modal.getAllByRole('status')).toHaveLength(1);
    await expect(modal.getByRole('status')).toHaveTextContent('Загружаем сборку');
    await expect(modal.queryByRole('button', { name: 'Скопировать код колоды' })).not.toBeInTheDocument();
  },
};
export const LoadingPreview: Story = {
  args: { state: { ...state, loadingPreview: true } },
  play: async () => {
    const modal = within(dialog());
    await userEvent.click(modal.getByRole('button', { name: 'Изображение' }));
    await expect(modal.getByRole('status')).toHaveTextContent('Загружаем изображение колоды');
  },
};
export const PreviewReady: Story = {
  args: { state: { ...state, preview: { hash: 'fixture', state: 'ready', ready: true, imageUrl: '/arena-logo-icon.webp', error: null } } },
  play: async () => {
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Изображение' }));
    await waitFor(() => expect(within(dialog()).getByRole('link', { name: 'Открыть изображение колоды в полном размере' })).toBeVisible());
  },
};
