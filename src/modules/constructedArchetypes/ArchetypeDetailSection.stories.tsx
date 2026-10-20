import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { LoadingBlock, LoadingSurface } from '../../shared/ui/LoadingSurface';
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
/** The generic stand-in: one status, and the section is not busy, so the status is announced. */
export const Loading: Story = {
  args: { loading: true },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем: история архетипа');
    await expect(canvasElement.querySelector('[aria-busy="true"]')).toBeNull();
  },
};
/** The owner's fitted placeholder replaces the generic panel and owns the only status. */
export const FittedSkeleton: Story = {
  args: { title: 'Сборки архетипа', loading: true, reserveViewport: true,
    skeleton: <LoadingSurface label="Загружаем сборки архетипа" quiet layout="rows"><LoadingBlock /></LoadingSurface> },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем сборки архетипа');
    await expect(canvasElement.querySelector('[aria-busy="true"]')).toBeNull();
  },
};
export const Failed: Story = {
  args: { error: 'История временно недоступна. Сборки доступны выше.' },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Повторить загрузку' }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};
