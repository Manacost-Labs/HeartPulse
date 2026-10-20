import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import {
  BattlegroundHeroDetailSkeleton,
  BattlegroundHeroListSkeleton,
  BattlegroundLoadError,
} from './BattlegroundsSkeletons';
import { BattlegroundTierListSkeleton } from './BattlegroundTierListSkeleton';

const power = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="776"%3E%3Crect width="512" height="776" fill="%2375405a"/%3E%3C/svg%3E';
const teaser = {
  dbfId: 61488, name: 'Алекстраза', image: '/bg-legacy/heroes_bg/Alexstrasza.png',
  heroPower: { name: 'Королева драконов', text: 'После улучшения таверны до 5 уровня вы раскапываете двух драконов.', image: power },
};

const meta = {
  title: 'Battlegrounds/Loading skeletons',
  component: BattlegroundHeroDetailSkeleton,
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <main className="arena-app-shell arena-app-battlegrounds" style={{ padding: 16 }}><Story /></main>],
} satisfies Meta<typeof BattlegroundHeroDetailSkeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const HeroDetail: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем страницу героя');
    await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

/** A subscriber opened a hero page: the server teaser stays, dimmed, while statistics load. */
export const HeroDetailFromTeaser: Story = {
  args: { teaser },
  // The busy teaser is dimmed on purpose while statistics load; contrast is checked everywhere else.
  parameters: { a11y: { config: { rules: [{ id: 'color-contrast', selector: '*:not([aria-busy="true"] *)' }] } } },
  play: async ({ canvas }) => {
    const heading = canvas.getByRole('heading', { level: 1, name: 'Алекстраза' });
    await expect(heading.closest('[aria-busy="true"]')).toHaveClass('data-surface');
    await expect(canvas.getByRole('status').closest('[aria-busy="true"]')).toBeNull();
  },
};

export const HeroList: Story = {
  render: () => <BattlegroundHeroListSkeleton />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем героев');
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
  },
};

export const TierListMinions: Story = {
  render: () => <section className="bg-tier-index-panel rounded-lg border p-3 sm:p-4"><BattlegroundTierListSkeleton list="minions" /></section>,
  play: async ({ canvas }) => { await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем тир-лист'); },
};

export const TierListStrategies: Story = {
  render: () => <section className="bg-tier-index-panel rounded-lg border p-3 sm:p-4"><BattlegroundTierListSkeleton list="strategies" /></section>,
};

const retry = fn();
export const LoadError: Story = {
  render: () => <BattlegroundLoadError message="Сервер не ответил за 20 секунд. Проверьте соединение и повторите." onRetry={retry} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('Не удалось загрузить данные');
    await userEvent.click(canvas.getByRole('button', { name: 'Повторить' }));
    await expect(retry).toHaveBeenCalled();
  },
};
