import type { Meta, StoryObj } from '@storybook/react-vite';
import ViciousSyndicateGold from './ViciousSyndicateGold';
import { summary, builds } from '../../tests/fixtures/viciousGoldPayload.mjs';

const meta = {
  title: 'Meta/Vicious Gold Analytics', component: ViciousSyndicateGold,
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input), location.origin).pathname;
      if (path.startsWith('/api/vicious-syndicate-gold')) return new Response(JSON.stringify(path.endsWith('/builds') ? builds : summary), { headers: { 'Content-Type': 'application/json' } });
      return original(input, init);
    };
    return () => { globalThis.fetch = original; };
  },
} satisfies Meta<typeof ViciousSyndicateGold>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClassDistribution: Story = {};
