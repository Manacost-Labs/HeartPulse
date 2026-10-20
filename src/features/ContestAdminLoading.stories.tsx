import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { ContestAdminPanel } from './Contests';

/** The administrator workspace while access is checked: the shared loading panel, one status. */
const meta = {
  title: 'Admin/Access loading', component: ContestAdminPanel,
  args: { authUser: null, authChecking: true },
  parameters: { layout: 'fullscreen', fullPage: true },
} satisfies Meta<typeof ContestAdminPanel>;
export default meta;
export const Checking: StoryObj<typeof meta> = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем раздел');
    await expect(canvas.queryByLabelText('Загрузка раздела')).not.toBeInTheDocument();
  },
};
