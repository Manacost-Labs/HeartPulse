import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import '../../vendor/valyro-ui/styles/index.css';
import '../../vendor/valyro-ui/styles/themes/manacost.css';
import { ThemeScope } from '../../vendor/valyro-ui/theme/ThemeScope';
import '../../modules/adminWorkspace/public.css';
import { AdminTableSkeleton } from './AdminTableSkeleton';

const meta = {
  title: 'Admin/Table Skeleton',
  component: AdminTableSkeleton,
  args: { label: 'Загружаем список людей', rows: 6, rowHeight: 80 },
  decorators: [Story => (
    <ThemeScope theme="manacost" mode="light">
      <main className="admin-workspace-page admin-tailadmin-shell" style={{ padding: 24 }}><Story /></main>
    </ThemeScope>
  )],
} satisfies Meta<typeof AdminTableSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PeopleList: Story = {
  play: async ({ canvas }) => {
    const status = canvas.getByRole('status');
    await expect(status).toHaveAttribute('aria-busy', 'true');
    await expect(status).toHaveTextContent('Загружаем список людей');
  },
};

export const Phone: Story = {
  args: { label: 'Загружаем подписчиков Boosty', rowHeight: 64 },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
