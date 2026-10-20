import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { ApplicationConnectView } from './ApplicationConnectView';
import { ApplicationConnectSkeleton } from './ApplicationConnectSkeleton';

// `/connect/` in the page frame of PublicPageShell: the real first state of
// the view and its skeleton, for the geometry test.
const meta = {
  title: 'Application connect/Measured loading geometry',
  component: ApplicationConnectView,
  args: {
    state: 'entry',
    userCode: 'ABCD-2345',
    user: null,
    authorization: null,
    errorMessage: '',
    onCodeChange: fn(),
    onInspect: fn(),
    onApprove: fn(),
    onDeny: fn(),
  },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div className="arena-app-profile">
    <div className="arena-content w-full max-w-6xl mx-auto p-3 sm:p-6 md:p-10"><Story /></div>
  </div>],
} satisfies Meta<typeof ApplicationConnectView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A guest arriving from the app with a code: the code entry step. */
export const Ready: Story = {
  play: async ({ canvas }) => { await expect(canvas.getByLabelText('Код устройства')).toHaveValue('ABCD-2345'); },
};

/** While the connect code loads: the real page title, one status outside any busy region. */
export const Loading: Story = {
  render: () => <ApplicationConnectSkeleton />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем подключение');
    await expect(canvas.getAllByRole('heading')).toHaveLength(1);
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
    await expect(canvas.getByRole('status').closest('[aria-busy="true"]')).toBeNull();
  },
};
