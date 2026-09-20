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

export const MetaOverview: Story = {};
export const Cards: Story = { args: { index: 5 } };
export const ArenaLongTitle: Story = { args: { index: 7 } };
