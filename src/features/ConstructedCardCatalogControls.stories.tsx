import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import ConstructedCardCatalogSearch from './ConstructedCardCatalogSearch';
import ConstructedCardDownloadButton from './ConstructedCardDownloadButton';
import './ConstructedCardCatalogControls.css';
import './StandardCards.css';

const meta = {
  title: 'Constructed cards/Catalog controls',
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className="constructed-cards" style={{ width: 'min(92vw, 560px)', padding: 24 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function SearchFixture() {
  const [query, setQuery] = useState('зиллиакс');
  return (
    <ConstructedCardCatalogSearch
      query={query}
      total={query ? 3 : 1152}
      pending={false}
      onChange={setQuery}
      onClear={() => setQuery('')}
    />
  );
}

export const SearchWithResults: Story = {
  render: () => <SearchFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Очистить поиск' }));
    await expect(canvas.getByRole('searchbox', { name: 'Поиск карт' })).toHaveValue('');
    await expect(canvas.getByText('1 152 карт')).toBeVisible();
  },
};

export const SearchPending: Story = {
  render: () => (
    <ConstructedCardCatalogSearch
      query="андуин"
      total={12}
      pending
      onChange={() => undefined}
      onClear={() => undefined}
    />
  ),
};

export const CompactDownload: Story = {
  render: () => (
    <div style={{ minHeight: 180, display: 'grid', placeItems: 'center' }}>
      <ConstructedCardDownloadButton
        cardId="TOY_330"
        cardName="Зиллиакс Делокс 3000"
        href="/api/card-image/105909/full.webp"
      />
    </div>
  ),
};
