import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import CardPreviewTooltip, { type CardPreviewTarget } from './CardPreviewTooltip';
import CardPreviewSheet from './CardPreviewSheet';

type Args = { cardId: string; name: string };

/**
 * The full-card hover preview and its phone sheet with the real image URLs of
 * a card. The pictures come from the card-image route and the proxy, so a
 * story without the API shows the placeholder and then the error text;
 * `tests/card-preview-image-loading-browser.test.mjs` answers those requests.
 */
const meta = {
  title: 'Features/Card preview image',
  args: { cardId: 'BE_790', name: "Зер'онту" },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

function HoverPreview({ cardId, name }: Args) {
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  return (
    <div style={{ minHeight: 640, paddingTop: 160 }}>
      <button
        type="button"
        style={{ width: 224, height: 45 }}
        onMouseEnter={event => setPreview({ id: cardId, name, rect: event.currentTarget.getBoundingClientRect() })}
        onMouseLeave={() => setPreview(null)}
      >
        {name}
      </button>
      {preview && <CardPreviewTooltip preview={preview} />}
    </div>
  );
}

export const Hover: Story = { render: args => <HoverPreview {...args} /> };

function PhoneSheet({ cardId, name }: Args) {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <button type="button" onClick={() => setOpen(true)}>{name}</button>
      {open && <CardPreviewSheet card={{ id: cardId, name }} onClose={() => setOpen(false)} />}
    </main>
  );
}

export const Sheet: Story = { render: args => <PhoneSheet {...args} /> };
