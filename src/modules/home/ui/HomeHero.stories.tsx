import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { HomeHero } from './HomeHero';
import './Home.css';

const meta = {
  title: 'Home/Page header and actions',
  component: HomeHero,
  args: {
    homeSummaryData: {
      topClasses: [
        { id: 'paladin', name: 'Паладин', winrate: 54.6 },
        { id: 'hunter', name: 'Охотник', winrate: 52.6 },
        { id: 'mage', name: 'Маг', winrate: 51.8 },
      ],
      topCards: [],
      topLegendaries: [],
    },
    loadingHomeSummary: false,
    onNavigate: fn(),
  },
  decorators: [Story => <div className="home-workbench"><Story /></div>],
} satisfies Meta<typeof HomeHero>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithClassRatings: Story = {};
export const LoadingRatings: Story = {
  args: { homeSummaryData: null, loadingHomeSummary: true },
};
