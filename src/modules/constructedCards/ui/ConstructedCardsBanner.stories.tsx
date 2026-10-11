import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConstructedCardsBanner } from './ConstructedCardsBanner';
import './ConstructedCardsBanner.css';

const meta = {
  title: 'Cards/Catalog banner',
  component: ConstructedCardsBanner,
  args: { rankLabel: 'Алмаз', periodLabel: 'Текущий патч', hasStatsAccess: false, refreshing: false },
} satisfies Meta<typeof ConstructedCardsBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Guest: Story = {};
export const Subscriber: Story = { args: { hasStatsAccess: true } };
export const Refreshing: Story = { args: { hasStatsAccess: true, refreshing: true } };
