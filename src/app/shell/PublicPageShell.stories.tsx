import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PublicPageShell } from './PublicPageShell';
import FAQPage from '../../features/FAQPage';

const navigate = fn();
const meta = {
  title: 'App shell/Public page', component: PublicPageShell,
  parameters: { layout: 'fullscreen', fullPage: true },
  args: { activeTab: 'standard-cards', pathname: '/standard/cards/', wide: true, navigate,
    access: { user: null, checking: true, admin: false, contestAdmin: false, subscription: null },
    children: <><h1>Карты</h1><p>Библиотека карт Hearthstone.</p></> },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const toggle = canvasElement.querySelector<HTMLButtonElement>('button[aria-controls="arena-mobile-menu"]');
    if (toggle?.offsetParent) await userEvent.click(toggle);
    await userEvent.click(canvas.getByRole('link', { name: 'Мета' }));
    await expect(args.navigate).toHaveBeenCalledWith('/standard/meta');
  },
} satisfies Meta<typeof PublicPageShell>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CardSection: Story = {};
export const Help: Story = { args: { activeTab: 'faq', pathname: '/faq/', editorial: true, wide: false,
  access: { user: null, checking: false, admin: false, contestAdmin: false, subscription: null },
  children: <FAQPage navigatePath={navigate} /> } };
