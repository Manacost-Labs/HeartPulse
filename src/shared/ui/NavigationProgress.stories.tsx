import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { NavigationProgress } from './NavigationProgress';

const meta = {
  title: 'Shared/NavigationProgress',
  component: NavigationProgress,
  parameters: { layout: 'fullscreen' },
  decorators: [Story => <div className="route-parchment-page" style={{ minHeight: '100vh', padding: 24 }}>
    <h1>Переход между страницами</h1><p>Содержимое остаётся доступным во время загрузки.</p><Story />
  </div>],
  args: { pending: false },
} satisfies Meta<typeof NavigationProgress>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  play: async ({ canvas }) => { await expect(canvas.getByRole('status')).toBeEmptyDOMElement(); },
};
export const Pending: Story = {
  args: { pending: true },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Открываем страницу…'));
  },
};
export const Completion: Story = {
  render: function CompletionPreview() {
    const [pending, setPending] = useState(true);
    return <><NavigationProgress pending={pending} /><button onClick={() => setPending(false)}>Завершить переход</button></>;
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Открываем страницу…'));
    await userEvent.click(canvas.getByRole('button', { name: 'Завершить переход' }));
    await expect(canvas.getByRole('status')).toBeEmptyDOMElement();
  },
};
