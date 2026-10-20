import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import FunDecksPage from './FunDecksPage';

/**
 * Request states of the fun-deck selection: a failed request shows the error
 * with its retry. `Network` sends the real request (a browser test holds it
 * to prove the deadline ends in the same error state).
 */
type Mode = 'fail' | 'network';
const meta = {
  title: 'Constructed/Fun decks states', component: FunDecksPage,
  args: { hasFullAccess: true, initialPreview: null },
  parameters: { layout: 'fullscreen', fullPage: true, mode: 'fail' satisfies Mode },
  decorators: [Story => <div style={{ maxWidth: 1092, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
  beforeEach: ({ parameters }) => {
    const original = window.fetch;
    const mode = parameters.mode as Mode;
    window.fetch = (input, init) => (String(input).startsWith('/api/fun-decks') && mode === 'fail'
      ? Promise.resolve(new Response('{"error":"Подборка обновляется"}', { status: 503 }))
      : original(input, init));
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof FunDecksPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LoadError: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Подборка обновляется');
    await expect(canvas.getByRole('button', { name: 'Повторить' })).toBeEnabled();
  },
};
export const Network: Story = { parameters: { mode: 'network' } };
