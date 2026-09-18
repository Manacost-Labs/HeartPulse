import type { Meta, StoryObj } from '@storybook/react-vite';

import { SectionBanner } from './EditorialRouteChrome';
import '../route-parchment.css';

const meta = {
  title: 'Editorial/SectionBanner',
  component: SectionBanner,
  decorators: [Story => <div className="arena-app-editorial"><Story /></div>],
  args: {
    title: 'Статьи',
    subtitle: 'Гайды, новости и разборы для Hearthstone.',
  },
} satisfies Meta<typeof SectionBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongCopy: Story = {
  args: {
    title: 'Разбор обновления и актуальной меты',
    subtitle: 'Подробные материалы, колоды и советы, которые остаются читаемыми на широком экране и телефоне.',
  },
};
