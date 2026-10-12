import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { ConstructedCardTile } from './ConstructedCardTile';
import './CatalogCompactTable.css';

const meta = {
  title: 'Cards/Compact catalog table',
  component: ConstructedCardTile,
  args: { name: 'Древнее слово: воплощение', cost: 5, rarity: 'RARE' },
  decorators: [(Story, { args }) => <div className="constructed-cards">
    <table className="constructed-cards__table is-compact">
      <tbody><tr><th scope="row"><a href="#card" title={args.name}><Story /></a></th>
        <td data-label="Класс"><span><img className="constructed-cards__class-icon" src="/class_icon/ui/priest-64.webp" alt="" />Жрец</span></td>
        <td data-label="Мана">{args.cost ?? '—'}</td></tr></tbody>
    </table>
  </div>],
} satisfies Meta<typeof ConstructedCardTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LongName: Story = {
  play: async ({ canvasElement, canvas }) => {
    const tile = canvasElement.querySelector('.constructed-catalog-tile');
    await expect(tile?.getBoundingClientRect().width).toBe(224);
    await expect(tile?.getBoundingClientRect().height).toBeCloseTo(44.8, 1);
    await expect(canvas.getByText('Древнее слово: воплощение')).toBeVisible();
  },
};

export const FreeCard: Story = { args: { name: 'Вспышка', cost: 0 } };
export const UnavailableArtwork: Story = {
  args: { name: 'Дест’агат', cost: 4, rarity: 'LEGENDARY', artwork: '/api/public-resource/db/uploads/missing-art.webp' },
};
