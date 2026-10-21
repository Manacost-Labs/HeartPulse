import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, waitFor } from 'storybook/test';
import { LoadingBlock, LoadingSurface } from './LoadingSurface';
import './LoadingSurface.css';

const meta = {
  title: 'Shared/LoadingSurface',
  component: LoadingSurface,
  decorators: [
    Story => (
      <div className="route-parchment-page" style={{ width: 720, maxWidth: '100%', padding: 24, boxSizing: 'border-box' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Загружаем мету',
    detail: 'Получаем актуальный срез архетипов и статистики.',
  },
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LoadingSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A section without a content shape of its own: caption and three lines. */
export const Panel: Story = {
  play: async ({ canvas }) => {
    const status = canvas.getByRole('status');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(status).toHaveTextContent('Загружаем мету');
  },
};

/** A list: rows of the list's height, with the caption for screen readers only. */
export const QuietRows: Story = {
  args: { label: 'Загружаем архетипы', detail: undefined, quiet: true, layout: 'rows', count: 4 },
};

/** A grid shaped by the content's own grid class and tiles. */
export const ContentGrid: Story = {
  args: {
    label: 'Загружаем косметику',
    detail: undefined,
    quiet: true,
    layout: 'grid',
    blocksClassName: 'loading-surface-story-grid',
    children: Array.from({ length: 6 }, (_, index) => <LoadingBlock key={index} className="loading-surface-story-tile" />),
  },
  decorators: [
    Story => (
      <>
        <style>{`.loading-surface-story-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.loading-surface-story-tile { aspect-ratio: 2 / 3; }`}</style>
        <Story />
      </>
    ),
  ],
};

/** One placeholder taking over from another: the second appears at once, without a second reveal. */
function Handover() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step > 0) return;
    const timer = setTimeout(() => setStep(1), 400);
    return () => clearTimeout(timer);
  }, [step]);
  return step === 0
    ? <LoadingSurface key="check" label="Проверяем доступ" quiet layout="rows" count={2} />
    : <LoadingSurface key="page" label="Загружаем страницу" quiet layout="rows" count={4} />;
}

export const HandoverContinues: Story = {
  render: () => <Handover />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Проверяем доступ');
    await expect(canvas.getByRole('status')).not.toHaveAttribute('data-reveal');
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Загружаем страницу'));
    await expect(canvas.getByRole('status')).toHaveAttribute('data-reveal', 'continued');
  },
};
