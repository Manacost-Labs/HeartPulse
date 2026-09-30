import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ContestAdminUsers, type AdminUserSearchResult } from './ContestAdminUsers';
import './contests.css';
import '../modules/adminWorkspace/public.css';

// Invented workshop people; not real users.
const person = (id: string, values: Partial<AdminUserSearchResult>): AdminUserSearchResult => ({
  id, profileId: id.toUpperCase(), name: id, email: `${id}@example.test`, role: 'user', country: 'RU', telegramUsername: '',
  contactVkUrl: '', contactTelegram: '', contactEmail: '', subscription: { hasAccess: false, source: 'none', checkedAt: '' },
  contestEntriesCount: 0, createdAt: '2025-03-12T10:00:00.000Z', ...values,
});
const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
const users = [
  person('u-10482', { name: 'igrok_7731', telegramUsername: 'igrok_7731', subscription: { hasAccess: true, source: 'boosty', checkedAt: '' }, contestEntriesCount: 2, tags: ['vip', 'стример'] }),
  person('u-2217', { name: 'arena_wizard', role: 'admin', lifetimeAccess: true, manualAccess: { enabled: true, expiresAt: null }, subscription: { hasAccess: true, source: 'manual-access', checkedAt: '' }, contactVkUrl: 'https://vk.com/arena_wizard', tags: ['автор'] }),
  person('u-5120', { name: 'kolodnik_ru', manualAccess: { enabled: true, expiresAt: soon }, subscription: { hasAccess: true, source: 'manual-access', checkedAt: '' }, contestEntriesCount: 5, tags: ['победитель'] }),
  person('u-7730', { name: 'deck_master', contactTelegram: '@deck_master_with_a_very_long_contact_handle_for_wrapping', contactEmail: 'deck.master.with.a.long.address@example.test' }),
  person('u-9001', { name: 'spam_bot_19', blockedAt: '2026-09-28T21:05:00.000Z', country: '' }),
];

const meta = {
  title: 'Admin/People list',
  component: ContestAdminUsers,
  decorators: [Story => (
    <main className="admin-workspace-page admin-tailadmin-shell" style={{ minHeight: '100vh', padding: 24 }}>
      <Story />
    </main>
  )],
  parameters: { layout: 'fullscreen' },
  args: {
    currentUserId: 'u-2217', users, total: 8412, loading: false, query: '', page: 1, pageCount: 421, actionId: '', openMenuId: '',
    menuRef: createRef<HTMLDivElement>(), menuTriggerMap: new Map(),
    onRefresh: () => undefined, onQueryChange: () => undefined, onPageChange: () => undefined, onToggleMenu: () => undefined, onUpdateUser: () => undefined,
    segments: {
      segments: [
        { id: 'all', label: 'Все', count: 8412 }, { id: 'paying', label: 'Платят сейчас', count: 1284 }, { id: 'manual', label: 'Ручной доступ', count: 41 },
        { id: 'expiring', label: 'Истекает ≤ 7 дней', count: 14 }, { id: 'lapsed', label: 'Потеряли доступ', count: 63 }, { id: 'new', label: 'Новые за 7 дней', count: 212 },
        { id: 'blocked', label: 'Заблокированы', count: 9 }, { id: 'admins', label: 'Администраторы', count: 3 },
      ],
      tags: [{ tag: 'vip', count: 18 }, { tag: 'стример', count: 6 }],
    },
    segment: 'all', tag: '', onSegmentChange: () => undefined, onPersonChanged: () => undefined,
  },
} satisfies Meta<typeof ContestAdminUsers>;

export default meta;
type Story = StoryObj<typeof meta>;

export const People: Story = {};
export const MenuOpen: Story = { args: { openMenuId: 'u-10482' } };
export const EmptyFilter: Story = { args: { users: [], total: 0, pageCount: 1, segment: 'expiring' } };
export const Loading: Story = { args: { users: [], total: 0, pageCount: 1, loading: true } };
