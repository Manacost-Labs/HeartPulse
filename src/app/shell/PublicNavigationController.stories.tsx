import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { PublicNavigationController } from './PublicNavigationController';
import { PublicNavigationContext } from './PublicNavigationContext';
import { PublicPageShell } from './PublicPageShell';
import { tabFromPath } from '../routing/navigationRoutes';

const access = { user: null, checking: false, admin: false, contestAdmin: false, subscription: null };
const reportUpdatedAt = () => {};
function PersistentMenuPreview({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [pathname, setPathname] = useState('/faq/');
  const visit = (path: string) => { onNavigate(path); setPathname(path); };
  return <PublicNavigationContext.Provider value={reportUpdatedAt}>
    <PublicNavigationController activeTab={tabFromPath(pathname)} pathname={pathname} access={access} navigate={visit} updatedAtLabel="Нет данных" />
    <PublicPageShell activeTab={tabFromPath(pathname)} pathname={pathname} access={access} navigate={visit} editorial>
      <h1>{pathname === '/faq/' ? 'Помощь' : 'Другая страница'}</h1><p>Меню остаётся на месте при смене содержимого.</p>
    </PublicPageShell>
  </PublicNavigationContext.Provider>;
}
const meta = { title: 'App shell/Persistent navigation', component: PublicNavigationController,
  parameters: { layout: 'fullscreen', fullPage: true },
  args: { activeTab: 'faq', pathname: '/faq/', access, navigate: fn(), updatedAtLabel: 'Нет данных' },
  render: args => <PersistentMenuPreview onNavigate={args.navigate} />,
} satisfies Meta<typeof PublicNavigationController>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Desktop: Story = {
  play: async ({ canvasElement, args }) => {
    const sidebar = canvasElement.querySelector<HTMLElement>('.arena-sidebar');
    if (!sidebar) throw new Error('Persistent sidebar is missing');
    const panel = sidebar.querySelector<HTMLDetailsElement>('details.hp-mode');
    if (!panel) throw new Error('Mode switch is missing');
    await userEvent.click(panel.querySelector('summary') as HTMLElement);
    await expect(panel.open).toBe(true);
    await userEvent.click(panel.querySelector('[data-mode-card][data-mode="community"]') as HTMLElement);
    await expect(args.navigate).toHaveBeenCalledWith('/articles');
    await expect(panel.open).toBe(false);
    await expect(canvasElement.querySelector('.arena-sidebar')).toBe(sidebar);
    await expect(within(canvasElement).getByRole('heading', { name: 'Другая страница' })).toBeVisible();
  },
};
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть меню' }));
    const drawer = canvasElement.querySelector<HTMLElement>('#arena-mobile-menu');
    const panel = drawer?.querySelector<HTMLDetailsElement>('details.hp-mode');
    if (!drawer || !panel) throw new Error('Mode switch is missing in the drawer');
    await userEvent.click(panel.querySelector('summary') as HTMLElement);
    await expect(panel.open).toBe(true);
    await userEvent.click(panel.querySelector('[data-mode-card][data-mode="arena"]') as HTMLElement);
    await expect(canvas.getByRole('button', { name: 'Открыть меню' })).toHaveAttribute('aria-expanded', 'false');
    await expect(args.navigate).toHaveBeenCalledWith('/classes');
    await expect(canvas.getByRole('heading', { name: 'Другая страница' })).toBeVisible();
  },
};
export const ScrolledMobileDrawer: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: args => <div style={{ minHeight: 1800 }}><PersistentMenuPreview onNavigate={args.navigate} /></div>,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = canvasElement.ownerDocument.defaultView;
    const header = canvasElement.querySelector('.arena-mobile-topbar');
    if (!page || !header) throw new Error('Mobile preview frame is missing');
    page.scrollTo(0, 600);
    await waitFor(() => expect(page.scrollY).toBe(600));
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть меню' }));
    await waitFor(() => expect(page.document.body.style.position).toBe('fixed'));
    await expect(Math.round(header.getBoundingClientRect().top)).toBe(0);
    await userEvent.click(within(header as HTMLElement).getByRole('button', { name: 'Закрыть меню' }));
    await waitFor(() => expect(page.scrollY).toBe(600));
    await expect(args.navigate).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть меню' }));
  },
};
