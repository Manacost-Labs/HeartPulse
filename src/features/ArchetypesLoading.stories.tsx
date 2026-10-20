import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import ArchetypesPage from './Archetypes';

// The administrator archetype list and detail while their requests are pending.
const meta = {
  title: 'Administrator archetypes/Loading',
  component: ArchetypesPage,
  parameters: { layout: 'fullscreen' },
  args: { isAdmin: true },
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = (input, init) => String(input).includes('/api/admin/archetypes')
      ? new Promise<Response>(() => {})
      : original(input, init);
    return () => { globalThis.fetch = original; };
  },
} satisfies Meta<typeof ArchetypesPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Catalog: Story = {
  args: { currentPath: '/archetypes/' },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем архетипы');
  },
};

export const Detail: Story = {
  args: { currentPath: '/archetypes/42/' },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем статистику архетипа');
  },
};
