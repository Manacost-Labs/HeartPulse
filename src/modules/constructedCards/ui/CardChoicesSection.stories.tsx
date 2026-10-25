import type { Meta, StoryObj } from '@storybook/react-vite';
import { CardChoicesSection } from './CardChoicesSection';
import legend from './cardChoicesSnapshot.json';
import bronze from './cardChoicesBronzeSnapshot.json';

// Real answers of 25.10.2026 for Иллидариведение (CORE_YOP_001): /api/card-choices at Legend and Bronze–Gold.
const meta = {
  title: 'Card detail/What players pick',
  component: CardChoicesSection,
  parameters: { layout: 'fullscreen' },
  args: { format: 'standard', cardId: 'CORE_YOP_001', kind: 'discover' },
  decorators: [Story => <div className="constructed-cards constructed-card-detail" style={{ maxWidth: 1320, marginInline: 'auto', padding: 16 }}><Story /></div>],
  beforeEach: ({ parameters }) => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (!url.pathname.startsWith('/api/card-choices/')) return original(input, init);
      if (parameters.hold) return new Promise<Response>(() => {});
      const body = url.searchParams.get('rank') === 'bronze_gold' ? bronze : legend;
      const answer = parameters.empty ? { ...body, state: 'no_data', options: [] } : body;
      return new Response(JSON.stringify(answer), { headers: { 'Content-Type': 'application/json' } });
    };
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof CardChoicesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Legend: Story = {};
export const Loading: Story = { parameters: { hold: true } };
export const NotEnoughData: Story = { parameters: { empty: true } };
