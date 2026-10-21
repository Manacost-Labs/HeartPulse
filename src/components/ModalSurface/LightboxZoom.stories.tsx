import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import LightboxZoomFixture from './LightboxZoomFixture';

// The shared-element zoom of a lightbox: the pressed thumbnail flies into the
// lightbox and back. `.lightbox-flight` is the flying copy, present only while
// it travels; the lightbox's own picture is hidden until it lands.

const meta = {
  title: 'Components/Lightbox zoom',
  component: LightboxZoomFixture,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LightboxZoomFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

const animates = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

export const OpenAndClose: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть картинку' }));
    const dialog = await waitFor(() => document.querySelector('.lightbox-zoom-story') as HTMLElement);
    await expect(dialog).toBeTruthy();
    if (animates()) await expect(document.querySelector('.lightbox-flight')).not.toBeNull();
    await waitFor(() => expect(document.querySelector('.lightbox-flight')).toBeNull());
    await userEvent.click(document.querySelector('[data-modal-close]') as HTMLElement);
    await waitFor(() => expect(document.querySelector('.lightbox-zoom-story')).toBeNull());
    await expect(canvas.getByRole('button', { name: 'Открыть картинку' })).toHaveFocus();
  },
};

export const Phone: Story = { ...OpenAndClose, parameters: { viewport: { defaultViewport: 'mobile1' } } };

