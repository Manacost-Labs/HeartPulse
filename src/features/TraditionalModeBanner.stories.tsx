import type { Meta, StoryObj } from '@storybook/react-vite';
import { HeaderFixture, headers } from '../../tests/fixtures/page-headers';

const meta = {
  title: 'Page headers/Consistency',
  component: HeaderFixture,
  parameters: { layout: 'fullscreen' },
  argTypes: { index: { control: 'select', options: headers.map((_, index) => index) } },
  args: { index: 0 },
} satisfies Meta<typeof HeaderFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MetaOverview: Story = {
  parameters: {
    docs: { description: { story: 'HSGuru artwork fades into the burgundy background without a visible image edge, including on narrow screens.' } },
  },
};
export const Cards: Story = { args: { index: 5 } };
export const ArenaLongTitle: Story = { args: { index: 7 } };
