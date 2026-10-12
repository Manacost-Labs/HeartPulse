import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConstructedCardTile } from './ConstructedCardTile';
import './CatalogPresentation.css';

const meta = {
  title: 'Cards/Catalog tile', component: ConstructedCardTile,
  args: { name: 'Владыка Темной империи', cost: 7 },
  decorators: [Story => <div style={{ width: 320 }}><Story /></div>],
} satisfies Meta<typeof ConstructedCardTile>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MissingTile: Story = {};
export const BrokenTile: Story = { args: { tile: '/api/public-resource/db/uploads/missing-tile.png' } };
export const RarityGlow: Story = {
  render: args => <div style={{ display: 'grid', gap: 20 }}>
    {['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'FREE'].map(rarity =>
      <a key={rarity} href={`#${rarity.toLowerCase()}`} aria-label={`Карта: ${rarity}`}>
        <ConstructedCardTile {...args} name={rarity} rarity={rarity} />
      </a>)}
  </div>,
};
