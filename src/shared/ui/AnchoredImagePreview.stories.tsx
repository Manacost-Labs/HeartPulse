import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { AnchoredImagePreview } from './AnchoredImagePreview';

const image = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="724"><rect x="12" y="12" width="488" height="700" rx="40" fill="${color}"/><circle cx="256" cy="245" r="160" fill="#e8c678"/><rect x="60" y="455" width="392" height="190" rx="20" fill="#fff3d5"/><text x="256" y="515" text-anchor="middle" fill="#432a16" font-size="30">Полное изображение</text></svg>`)}`;
const FIRST_IMAGE = image('#6e4025');
const SECOND_IMAGE = image('#28657a');
const BROKEN_IMAGE = 'data:image/png;base64,broken';

const meta = {
  title: 'Shared/Anchored image preview',
  component: AnchoredImagePreview,
  args: {
    source: FIRST_IMAGE,
    fallbackSource: FIRST_IMAGE,
    name: 'Древнее слово: воплощение',
    accessibleName: 'Полная карта Древнее слово: воплощение',
    previewId: 'first',
    anchorRect: { left: 80, right: 304, top: 180, bottom: 225, height: 45 } as DOMRect,
  },
  render: args => {
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const [second, setSecond] = useState(false);
    return <div style={{ minHeight: 540, paddingTop: 160 }}>
      <button type="button"
        onMouseEnter={event => setAnchorRect(event.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setAnchorRect(null)}
        onFocus={event => setAnchorRect(event.currentTarget.getBoundingClientRect())}
        onBlur={() => setAnchorRect(null)}
        onClick={() => setSecond(value => !value)}
        style={{ width: 224, height: 45, float: args.previewId === 'right-edge' ? 'right' : undefined }}
      >{second ? 'Другая карта' : args.name}</button>
      {anchorRect && <AnchoredImagePreview {...args}
        key={second ? 'second' : 'first'}
        anchorRect={anchorRect}
        source={second ? SECOND_IMAGE : args.source}
        name={second ? 'Другая карта' : args.name}
        accessibleName={second ? 'Полная карта Другая карта' : args.accessibleName}
        previewId={second ? 'second' : args.previewId}
      />}
    </div>;
  },
} satisfies Meta<typeof AnchoredImagePreview>;
export default meta;
type Story = StoryObj<typeof meta>;

async function until(ready: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (ready()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Preview did not reach the expected state');
}

async function openPreview(canvasElement: HTMLElement) {
  const button = within(canvasElement).getByRole('button');
  await userEvent.hover(button);
  const tooltip = await within(document.body).findByRole('tooltip');
  await Promise.all(tooltip.getAnimations().map(animation => animation.finished));
  await expect(tooltip).toBeVisible();
  return { button, tooltip };
}

export const HoverAndKeyboard: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 700) {
      await userEvent.hover(within(canvasElement).getByRole('button'));
      await expect(within(document.body).queryByRole('tooltip')).toBeNull();
      return;
    }
    const { button, tooltip } = await openPreview(canvasElement);
    await until(() => tooltip.dataset.previewState === 'loaded');
    await expect(tooltip).toHaveAttribute('data-preview-state', 'loaded');
    await userEvent.keyboard('{Escape}');
    await until(() => !within(document.body).queryByRole('tooltip'));
    await expect(within(document.body).queryByRole('tooltip')).not.toBeInTheDocument();
    await userEvent.unhover(button);
    button.focus();
    await within(document.body).findByRole('tooltip');
    window.dispatchEvent(new Event('scroll'));
    await until(() => !within(document.body).queryByRole('tooltip'));
    await expect(within(document.body).queryByRole('tooltip')).not.toBeInTheDocument();
    button.blur();
  },
};

export const RightEdge: Story = {
  args: { previewId: 'right-edge' },
  play: async ({ canvasElement }) => {
    if (innerWidth <= 700) {
      await userEvent.hover(within(canvasElement).getByRole('button'));
      await expect(within(document.body).queryByRole('tooltip')).toBeNull();
      return;
    }
    const { button, tooltip } = await openPreview(canvasElement);
    const rect = tooltip.getBoundingClientRect();
    await expect(rect.right).toBeLessThan(button.getBoundingClientRect().left);
    await expect(rect.top).toBeGreaterThanOrEqual(12);
    await expect(rect.bottom).toBeLessThanOrEqual(innerHeight - 12);
  },
};

export const PreferredImageFallback: Story = {
  args: { source: BROKEN_IMAGE },
  play: async ({ canvasElement }) => {
    if (innerWidth <= 700) {
      await userEvent.hover(within(canvasElement).getByRole('button'));
      await expect(within(document.body).queryByRole('tooltip')).toBeNull();
      return;
    }
    const { tooltip } = await openPreview(canvasElement);
    await until(() => tooltip.dataset.previewState === 'loaded');
    await expect(tooltip).toHaveAttribute('data-preview-state', 'loaded');
    await expect(within(tooltip).getByRole('img')).toHaveAttribute('src', FIRST_IMAGE);
  },
};

export const UnavailableImage: Story = {
  args: { source: BROKEN_IMAGE, fallbackSource: BROKEN_IMAGE },
  play: async ({ canvasElement }) => {
    if (innerWidth <= 700) {
      await userEvent.hover(within(canvasElement).getByRole('button'));
      await expect(within(document.body).queryByRole('tooltip')).toBeNull();
      return;
    }
    const { tooltip } = await openPreview(canvasElement);
    await until(() => tooltip.dataset.previewState === 'error');
    await expect(tooltip).toHaveAttribute('data-preview-state', 'error');
    await expect(within(tooltip).getByText('Изображение временно недоступно')).toBeVisible();
  },
};

export const SwitchImage: Story = {
  play: async ({ canvasElement }) => {
    if (innerWidth <= 700) {
      await userEvent.hover(within(canvasElement).getByRole('button'));
      await expect(within(document.body).queryByRole('tooltip')).toBeNull();
      return;
    }
    const { button, tooltip } = await openPreview(canvasElement);
    await until(() => tooltip.dataset.previewState === 'loaded');
    await expect(tooltip).toHaveAttribute('data-preview-state', 'loaded');
    await userEvent.click(button);
    const next = await within(document.body).findByRole('tooltip', { name: 'Полная карта Другая карта' });
    await until(() => next.dataset.previewState === 'loaded');
    await expect(next).toHaveAttribute('data-preview-state', 'loaded');
    await expect(within(next).getByRole('img')).toHaveAttribute('src', SECOND_IMAGE);
  },
};
