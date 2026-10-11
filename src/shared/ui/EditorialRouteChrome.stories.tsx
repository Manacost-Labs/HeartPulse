import type { Meta, StoryObj } from '@storybook/react-vite';
import { SectionBanner } from './EditorialRouteChrome';

const meta = {
  title: 'Shared/PageBanner',
  component: SectionBanner,
  args: { title: 'Герои Полей сражений' },
} satisfies Meta<typeof SectionBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = {};
export const LongTitle: Story = {
  args: { title: 'Конструктор тир-листов Полей сражений Hearthstone' },
};
