import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConstructedCardsBanner } from './ConstructedCardsBanner';
import './ConstructedCardsBanner.css';

const meta = { title: 'Cards/Catalog banner', component: ConstructedCardsBanner } satisfies Meta<typeof ConstructedCardsBanner>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TitleOnly: Story = {};
