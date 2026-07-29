import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import BattlegroundCardVariantToggle, {
  type BattlegroundCardVariant,
} from './BattlegroundCardVariantToggle';

const meta = {
  title: 'Battlegrounds/Card variant toggle',
  component: BattlegroundCardVariantToggle,
  args: {
    value: 'normal',
    normalStats: { attack: 2, health: 2 },
    goldenStats: { attack: 4, health: 4 },
    onChange: fn(),
  },
  decorators: [
    Story => (
      <div className="w-[min(100%,320px)] rounded-xl bg-[#ead09b] p-4">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof BattlegroundCardVariantToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledVariantToggle({ initialValue }: { initialValue: BattlegroundCardVariant }) {
  const [value, setValue] = useState(initialValue);
  return (
    <BattlegroundCardVariantToggle
      value={value}
      normalStats={{ attack: 2, health: 2 }}
      goldenStats={{ attack: 4, health: 4 }}
      onChange={setValue}
    />
  );
}

export const NormalSelected: Story = {
  render: () => <ControlledVariantToggle initialValue="normal" />,
  play: async ({ canvas }) => {
    const normalButton = canvas.getByRole('button', { name: /Обычная 2 атаки, 2 здоровья/i });
    const goldenButton = canvas.getByRole('button', { name: /Золотая 4 атаки, 4 здоровья/i });

    await expect(normalButton).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(goldenButton);
    await expect(goldenButton).toHaveAttribute('aria-pressed', 'true');
    await expect(normalButton).toHaveAttribute('aria-pressed', 'false');
  },
};

export const GoldenSelected: Story = {
  render: () => <ControlledVariantToggle initialValue="golden" />,
};

