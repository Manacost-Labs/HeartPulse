import type { Meta, StoryObj } from '@storybook/react-vite';
import DeckManaCurve from './DeckManaCurve';
const meta = { title: 'Decks/Mana Curve', component: DeckManaCurve, args: { cards: [0, 2, 4, 6, 8, 4, 2, 4].map((count, cost) => ({ count, cost })) } } satisfies Meta<typeof DeckManaCurve>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Balanced: Story = {};
export const Empty: Story = { args: { cards: [] } };
