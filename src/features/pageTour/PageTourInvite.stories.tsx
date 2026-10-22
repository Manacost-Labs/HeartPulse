import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import PageTourInvite from './PageTourInvite';

const storageKey = 'manacost:page-tour:storybook-invite:v1';

function Page() {
  return (
    <main id="main-content" style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px 320px', fontFamily: 'var(--font-body)' }}>
      <h1>Мета Стандарта</h1>
      <p>Страница остаётся доступной: предложение тура не затемняет её и не забирает фокус.</p>
      <button type="button">Кнопка страницы</button>
    </main>
  );
}

const meta = {
  title: 'Features/PageTour/Invite',
  component: PageTourInvite,
  args: { storageKey, onAccept: fn(), onDismiss: fn() },
  render: args => <><Page /><PageTourInvite {...args} /></>,
  beforeEach: () => {
    window.localStorage.removeItem(storageKey);
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PageTourInvite>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Offer: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const offer = await body.findByRole('complementary', { name: 'Впервые на этой странице?' });
    // It fades in, so it becomes visible a moment after mounting.
    await waitFor(() => expect(offer).toBeVisible());
    await expect(canvasElement.ownerDocument.activeElement).not.toBe(within(offer).getByRole('button', { name: 'Показать' }));
    await expect(body.getByRole('button', { name: 'Кнопка страницы' })).toBeEnabled();
  },
};

export const Accept: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('button', { name: 'Показать' }));
    await waitFor(() => expect(args.onAccept).toHaveBeenCalledOnce());
    await expect(window.localStorage.getItem(storageKey)).toBeNull();
  },
};

export const NotNow: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('button', { name: 'Не сейчас' }));
    await waitFor(() => expect(args.onDismiss).toHaveBeenCalledOnce());
    await expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')).toEqual({ status: 'dismissed' });
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
