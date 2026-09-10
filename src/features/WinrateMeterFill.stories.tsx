import type { Meta, StoryObj } from '@storybook/react-vite';
import '../index.css';
import '../route-parchment.css';
import { WinrateMeterFill } from './WinrateMeterFill';

const meta = {
  title: 'Arena/Winrate meter fill',
  component: WinrateMeterFill,
  args: { color: '#4c78d0', label: '54.2%', scale: 0.82 },
  render: args => (
    <div className="arena-app-winrates" style={{ maxWidth: 520, padding: 24 }}>
      <div className="arena-class-meter relative h-8 overflow-hidden">
        <WinrateMeterFill {...args} />
      </div>
    </div>
  ),
} satisfies Meta<typeof WinrateMeterFill>;

export default meta;

type Story = StoryObj<typeof meta>;

export const StableLabelDuringFill: Story = {};
