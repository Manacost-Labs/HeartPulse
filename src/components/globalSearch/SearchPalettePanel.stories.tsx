import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import '../GlobalUtilityHeader.css';
import { SearchPalettePanel } from './SearchPalettePanel';
import { paletteGroups, type PaletteEntry, type SearchArchetype, type SearchArticle, type SearchCard } from './searchPaletteModel';

const recent: PaletteEntry[] = [
  { kind: 'page', id: 'page:tierlist', label: 'Тир-лист', meta: 'Арена', path: '/tierlist/' },
  { kind: 'archetype', id: 'archetype:standard:summoner-mage', label: 'Манашторм Маг', meta: 'Стандарт', path: '/standard/archetypes/standard/summoner-mage/', classKey: 'mage' },
];
const archetypes: SearchArchetype[] = [
  { slug: 'control-warrior', archetypeLabel: 'Контроль Воин', archetype: 'Control Warrior', classKey: 'warrior', format: 'standard' },
  { slug: 'control-priest', archetypeLabel: 'Контроль Жрец', archetype: 'Control Priest', classKey: 'priest', format: 'wild' },
];
const cards: SearchCard[] = [{
  id: 'CARD_1', name: 'Контрольная карта', nameEn: 'Control card', text: '', image: '', mana: 3, className: 'neutral',
  cardType: 'Заклинание', formats: ['standard', 'wild'], path: '/standard/cards/standard/CARD_1',
}];
const articles: SearchArticle[] = [{
  id: 'a1', title: 'Контрольный мета-отчёт', excerpt: '', tag: 'Мета-отчёт', mode: 'standard', date: '2026-10-18',
  url: 'https://example.com/a1/', image: '', vip: true,
}];

function PalettePreview({ query, locked, onRun }: { query: string; locked: boolean; onRun: (entry: PaletteEntry) => void }) {
  const groups = paletteGroups({ query, admin: false, recent, archetypes, cards, articles });
  const [activeIndex, setActiveIndex] = useState(0);
  return <div className="global-utility-header" style={{ minHeight: 680 }}>
    <div className="global-utility-header__inner"><div className="global-search" style={{ maxWidth: 720 }}>
      <input className="global-search__input" readOnly value={query} aria-label="Поиск" />
      <SearchPalettePanel panelId="story-palette" groups={groups} activeIndex={activeIndex} onHighlight={setActiveIndex} onRun={onRun}
        query={query} loading={false} error="" openingArticleId="" locks={{ article: () => locked, cardStatistics: locked }} />
    </div></div>
  </div>;
}

const meta = {
  title: 'App shell/Search palette',
  component: PalettePreview,
  parameters: { layout: 'fullscreen' },
  args: { query: '', locked: false, onRun: fn() },
} satisfies Meta<typeof PalettePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecentAndSections: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('group', { name: 'Недавние' })).toBeVisible();
    await expect(canvas.getByRole('group', { name: 'Разделы' })).toBeVisible();
    await expect(canvas.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  },
};

export const QueryResults: Story = {
  args: { query: 'контроль' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('group', { name: 'Архетипы' })).toBeVisible();
    const link = canvas.getByRole('option', { name: /Контроль Воин/ });
    await expect(link).toHaveAttribute('href', '/standard/archetypes/standard/control-warrior/');
    await userEvent.click(link);
    await expect(args.onRun).toHaveBeenCalledWith(expect.objectContaining({ id: 'archetype:standard:control-warrior' }));
  },
};

export const LockedForGuest: Story = {
  args: { query: 'контроль', locked: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Нужна подписка')).toBeVisible();
    await expect(within(canvasElement).getByText('Статистика')).toBeVisible();
  },
};
