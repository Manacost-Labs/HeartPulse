import type { Meta, StoryObj } from '@storybook/react-vite';
import { AdminApiKeys } from './AdminApiKeys';
import type { AdminApiKeysClient } from '../api/adminApiKeys';

const activeKey = {
  id: 'api_key_story',
  name: 'Manacost Tracker',
  prefix: 'mca_live_12ab34cd56ef',
  scopes: ['catalog.read', 'images.read', 'statistics.read'],
  createdAt: '2026-07-29T12:00:00.000Z',
  createdBy: 'admin-story',
  lastUsedAt: '2026-07-29T12:30:00.000Z',
  revokedAt: null,
  status: 'ACTIVE' as const,
};

const client: AdminApiKeysClient = {
  list: async () => [activeKey],
  create: async (name, scopes) => ({
    apiKey: ['mca', 'live', 'storyprefix', 'example-secret-visible-once-only'].join('_'),
    key: { ...activeKey, id: 'api_key_created', name, scopes },
  }),
  revoke: async () => {},
};

const meta = {
  title: 'Developer API/Admin API keys',
  component: AdminApiKeys,
  parameters: { layout: 'padded' },
  args: { client },
} satisfies Meta<typeof AdminApiKeys>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithActiveKey: Story = {};
export const Empty: Story = {
  args: { client: { ...client, list: async () => [] } },
};
export const LoadError: Story = {
  args: {
    client: {
      ...client,
      list: async () => { throw new Error('Сервис ключей временно недоступен'); },
    },
  },
};
