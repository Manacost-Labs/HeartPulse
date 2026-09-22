import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ConstructedCardIdentity } from './ConstructedCardIdentity';

const meta = {
  title: 'Cards/Public identity',
  component: ConstructedCardIdentity,
  decorators: [Story => <main className="constructed-cards constructed-card-detail"><Story /></main>],
  args: {
    name: 'Огненный дракон', englishName: 'Fire Dragon', classIconUrl: '/class_icon/ui/mage-64.webp',
    rulesText: 'Боевой клич: возьмите карту.', flavorText: 'Даже драконам нужен отдых.',
    facts: [{ label: 'Мана', value: 7 }, { label: 'Класс', value: 'Маг' },
      { label: 'ID карты', value: 'blizzard:12345' }],
  },
} satisfies Meta<typeof ConstructedCardIdentity>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PublicCard: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('heading', { level: 1, name: 'Огненный дракон' })).toBeVisible();
    await expect(within(canvasElement).getByText('blizzard:12345')).toBeVisible();
  },
};
export const MissingOptionalText: Story = { args: { englishName: null, flavorText: '', rulesText: '' } };
