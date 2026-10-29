import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import MediaLightboxFixture from './MediaLightboxFixture';

// The shared picture viewer: a grid of thumbnails, the one that is pressed
// zooms into the lightbox and the neighbours page in beside it.
// `tests/media-lightbox-browser.test.mjs` drives the gestures (touch, mouse,
// keys, reduced motion) on these stories and on the gallery page.

const meta = {
  title: 'Components/Media lightbox',
  component: MediaLightboxFixture,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof MediaLightboxFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

const dialog = () => within(document.body).getByRole('dialog');

export const PagesThroughThePictures: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть Арт 2' }));
    await waitFor(() => expect(within(dialog()).getByText('2 из 6')).toBeVisible());
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Следующая картинка' }));
    await waitFor(() => expect(within(dialog()).getByText('3 из 6')).toBeVisible());
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(within(dialog()).getByText('2 из 6')).toBeVisible());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    await expect(canvas.getByRole('button', { name: 'Открыть Арт 2' })).toHaveFocus();
  },
};

export const Phone: Story = { ...PagesThroughThePictures, parameters: { viewport: { defaultViewport: 'mobile1' } } };

export const OnePicture: Story = {
  args: { count: 1 },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть Арт 1' }));
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: 'Закрыть' })).toBeVisible());
    await expect(within(dialog()).queryByRole('button', { name: 'Следующая картинка' })).toBeNull();
  },
};

export const TwoPictures: Story = { args: { count: 2 } };

// A page taller than the screen: opening and closing must not move it.
export const OnAScrolledPage: Story = { args: { scrolledPage: true } };
