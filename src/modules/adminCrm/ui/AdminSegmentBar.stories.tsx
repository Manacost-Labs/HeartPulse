import type { Meta, StoryObj } from '@storybook/react-vite';
import { AdminSegmentBar } from './AdminSegmentBar';

// Example counts for the workshop only.
const data = {
  segments: [
    { id: 'all' as const, label: 'Все', count: 8412 },
    { id: 'paying' as const, label: 'Платят сейчас', count: 1284 },
    { id: 'manual' as const, label: 'Ручной доступ', count: 41 },
    { id: 'expiring' as const, label: 'Истекает ≤ 7 дней', count: 14 },
    { id: 'lapsed' as const, label: 'Потеряли доступ', count: 63 },
    { id: 'new' as const, label: 'Новые за 7 дней', count: 212 },
    { id: 'blocked' as const, label: 'Заблокированы', count: 9 },
    { id: 'admins' as const, label: 'Администраторы', count: 3 },
  ],
  tags: [{ tag: 'vip', count: 18 }, { tag: 'стример', count: 6 }],
};

const meta = {
  title: 'Admin/CRM/Segment bar',
  component: AdminSegmentBar,
  parameters: { layout: 'padded' },
  args: { data, segment: 'all', tag: '', onChange: () => undefined },
} satisfies Meta<typeof AdminSegmentBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllPeople: Story = {};
export const Expiring: Story = { args: { segment: 'expiring' } };
export const TagSelected: Story = { args: { tag: 'vip' } };
export const CountsUnavailable: Story = { args: { data: null } };
