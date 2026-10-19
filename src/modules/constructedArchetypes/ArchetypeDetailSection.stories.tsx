import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { ArchetypeDetailSection } from './ArchetypeDetailSection';

const meta = {
  title: 'Archetypes/Independent detail section', component: ArchetypeDetailSection,
  args: { title: 'История архетипа', loading: false, error: '', onRetry: fn(),
    children: <div className="archetype-methodology"><h2>История архетипа</h2><p>Доступны 24 среза.</p></div> },
  decorators: [Story => <main className="archetypes-page" style={{ width: 720, maxWidth: '100%', padding: 24 }}><Story /></main>],
} satisfies Meta<typeof ArchetypeDetailSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Loading: Story = { args: { loading: true } };
export const FirstBuildLoading: Story = { args: { title: 'Сборки архетипа', loading: true, reserveViewport: true } };
export const Failed: Story = {
  args: { error: 'История временно недоступна. Сборки доступны выше.' },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Повторить загрузку' }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};
