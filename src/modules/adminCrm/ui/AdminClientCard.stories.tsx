import type { Meta, StoryObj } from '@storybook/react-vite';
import { AdminClientCard, type AdminClientCardProps } from './AdminClientCard';
import type { AdminCrmPerson } from '../api/adminCrmClient';

// Example data for the workshop only; names and numbers are invented.
const person: AdminCrmPerson = {
  person: {
    id: 'user_story_7731', name: 'igrok_7731', email: 'igrok7731@example.test', role: 'user', country: 'RU',
    createdAt: '2025-03-12T10:00:00.000Z', updatedAt: '2026-09-14T08:00:00.000Z', blockedAt: null, newsletterOptIn: true,
    contacts: { telegram: '@igrok_7731', vk: '', email: '' },
  },
  identities: [
    { provider: 'telegram', username: 'igrok_7731', createdAt: '2025-03-12T10:00:00.000Z', verifiedAt: '2025-03-12T10:00:00.000Z' },
    { provider: 'boosty-email', username: '', createdAt: '2025-03-14T09:00:00.000Z', verifiedAt: null },
  ],
  access: {
    hasAccess: true, source: 'boosty', message: 'Подписка Boosty «Легенда» активна.', checkedAt: '2026-09-29T11:00:00.000Z', manual: null,
  },
  accessHistory: [
    { at: '2026-09-14T08:00:00.000Z', source: 'boosty', hasAccess: true },
    { at: '2026-09-10T08:00:00.000Z', source: 'boosty', hasAccess: false },
    { at: '2025-03-14T09:00:00.000Z', source: 'boosty', hasAccess: true },
  ],
  referral: { label: 'YouTube сентябрь', slug: 'youtube-sep', campaign: 'осень-2026', clickedAt: '2025-03-12T09:55:00.000Z' },
  contests: [{ contestId: 'arena-marathon', title: 'Арена-марафон', status: 'approved', createdAt: '2026-09-02T12:00:00.000Z' }],
  mailing: { consentStatus: 'subscribed', consentedAt: '2025-03-12T10:00:00.000Z', unsubscribedAt: null, delivered: 14, failed: 1, lastDeliveredAt: '2026-09-20T10:00:00.000Z' },
  notes: [{ id: 1, body: 'Просил продлить доступ до конца турнира, договорились на 30 дней.', authorId: 'admin', authorName: 'Администратор', createdAt: '2026-09-15T12:00:00.000Z' }],
  tags: ['vip', 'стример'],
  audit: [{ id: 3, action: 'user.tags.updated', actorId: 'admin', actorName: 'Администратор', details: { from: ['vip'], to: ['vip', 'стример'] }, createdAt: '2026-09-15T12:01:00.000Z' }],
};

const clientFor = (card: AdminCrmPerson | Error | null): NonNullable<AdminClientCardProps['client']> => ({
  person: () => (card instanceof Error ? Promise.reject(card) : card ? Promise.resolve(card) : new Promise(() => undefined)),
  addNote: async (_userId, body) => ({ id: Date.now(), body, authorId: 'admin', authorName: 'Администратор', createdAt: new Date().toISOString() }),
  deleteNote: async () => ({ ok: true as const }),
  setTags: async (_userId, tags) => tags,
});

const meta = {
  title: 'Admin/CRM/Client card',
  component: AdminClientCard,
  parameters: { layout: 'fullscreen' },
  args: { userId: person.person.id, client: clientFor(person), onClose: () => undefined, onManageAccess: () => undefined },
} satisfies Meta<typeof AdminClientCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Subscriber: Story = {};
export const ManualAccessExpiring: Story = {
  args: {
    client: clientFor({
      ...person,
      access: {
        ...person.access,
        hasAccess: true,
        source: 'manual-access',
        message: '',
        manual: {
          active: true, grantedBy: 'Администратор', grantedAt: '2026-09-01T10:00:00.000Z',
          expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), revokedBy: null, revokedAt: null, note: 'приз конкурса',
        },
      },
    }),
  },
};
export const LostAccessNoNotes: Story = {
  args: {
    client: clientFor({ ...person, access: { ...person.access, hasAccess: false, source: 'none', message: '' }, notes: [], tags: [], mailing: null }),
  },
};
export const Loading: Story = { args: { client: clientFor(null) } };
export const LoadError: Story = { args: { client: clientFor(new Error('Пользователь не найден')) } };
