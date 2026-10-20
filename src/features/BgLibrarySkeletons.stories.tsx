import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { BgLibraryDetailSkeleton, BgLibraryListSkeleton } from './BgLibrarySkeletons';

const cardArt = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="512" height="775"%3E%3Crect width="512" height="775" fill="%23b98536"/%3E%3C/svg%3E';
const teaser = { dbfId: 131718, name: 'Счастье', typeName: 'Существо', text: 'В конце вашего хода другие ваши существа получают +1/+1.', image: cardArt };

const meta = {
  title: 'Battlegrounds/Library loading skeletons',
  component: BgLibraryDetailSkeleton,
  args: { kicker: 'Существа · Активный пул', stats: true },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <main className="arena-app-shell arena-app-battlegrounds" style={{ padding: 16 }}><Story /></main>],
} satisfies Meta<typeof BgLibraryDetailSkeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CardDetail: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем страницу карты');
    await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();
  },
};

/** A subscriber opened a card page: the server teaser stays, dimmed, while statistics load. */
export const CardDetailFromTeaser: Story = {
  args: { teaser },
  // The busy teaser is dimmed on purpose while statistics load; contrast is checked everywhere else.
  parameters: { a11y: { config: { rules: [{ id: 'color-contrast', selector: '*:not([aria-busy="true"] *)' }] } } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Счастье' }).closest('[aria-busy="true"]')).toHaveClass('data-surface');
    await expect(canvas.getByText(teaser.text)).toBeVisible();
  },
};

/** An archived or auxiliary card has no statistics panels. */
export const ArchivedCardDetail: Story = { args: { kicker: 'Существа · Архив', stats: false } };

export const CatalogSection: Story = {
  render: () => <div className="bg-library-page"><section className="bg-library-results overflow-visible p-1 sm:p-2"><BgLibraryListSkeleton /></section></div>,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем карты');
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
  },
};
