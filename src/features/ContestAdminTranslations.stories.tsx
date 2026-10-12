import type { Meta, StoryObj } from '@storybook/react-vite';
import { ContestAdminTranslations } from './ContestAdminTranslations';
import { ContestAdminMechanicTranslations } from './ContestAdminMechanicTranslations';
import './contests.css';
import '../modules/adminWorkspace/public.css';

const meta = {
  title: 'Admin/Translation Tables', component: ContestAdminTranslations,
  parameters: { layout: 'fullscreen' },
  args: { onMessage: () => undefined },
  decorators: [Story => <main className="admin-workspace-page admin-tailadmin-shell" style={{ padding: 'clamp(12px, 2vw, 24px)' }}><Story /></main>],
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input), location.origin).pathname;
      if (!path.startsWith('/api/admin/')) return original(input, init);
      const item = path.includes('mechanic')
        ? { key: 'TAUNT', nameEn: 'Taunt', nameRu: 'Провокация', source: 'manual', cardCount: 48, updatedAt: null, kind: 'mechanic', example: null }
        : { id: 1, blizzcoreId: null, nameEn: 'Dragon Warrior', nameRu: 'Дракон Воин', source: 'manual', createdAt: '', updatedAt: '', syncedAt: null, updatedBy: null };
      return new Response(JSON.stringify(path.endsWith('/untranslated') ? { items: [], totalObserved: 1, translated: 1, missing: 0 } : { items: [item], total: 1, page: 1, pageSize: 40, pages: 1, stats: { total: 1, manual: 1, default: 0, blizzcore: 0, missing: 0, mechanics: 1, tags: 0, lastSyncedAt: null } }), { headers: { 'Content-Type': 'application/json' } });
    };
    return () => { globalThis.fetch = original; };
  },
} satisfies Meta<typeof ContestAdminTranslations>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Archetypes: Story = {};
export const Mechanics: Story = { render: () => <ContestAdminMechanicTranslations onMessage={() => undefined} /> };
