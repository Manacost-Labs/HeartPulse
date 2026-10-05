import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
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
    const canvas = within(sidebar as HTMLElement);
    await userEvent.click(canvas.getByRole('button', { name: /Разное/ }));
    await userEvent.click(canvas.getByRole('link', { name: 'Архив гайдов' }));
    await expect(canvasElement.querySelector('.arena-sidebar')).toBe(sidebar);
    await expect(canvas.getByRole('button', { name: /Разное/ })).toHaveAttribute('aria-expanded', 'true');
    await expect(args.navigate).toHaveBeenCalledWith('/guides-archive');
    await expect(within(canvasElement).getByRole('heading', { name: 'Другая страница' })).toBeVisible();
  },
};
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть меню' }));
    const destination = canvasElement.querySelector<HTMLAnchorElement>('#arena-mobile-menu a[href="/tierlist/"]');
    if (!destination) throw new Error('Arena tier-list link is missing');
    await userEvent.click(destination);
    await expect(canvas.getByRole('button', { name: 'Открыть меню' })).toHaveAttribute('aria-expanded', 'false');
    await expect(args.navigate).toHaveBeenCalledWith('/tierlist');
    await expect(canvas.getByRole('heading', { name: 'Другая страница' })).toBeVisible();
  },
};
