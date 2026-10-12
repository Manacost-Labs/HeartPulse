import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent } from 'storybook/test';
import { RouteTransition } from './RouteTransition';

const meta = {
  title: 'Shared/RouteTransition',
  component: RouteTransition,
  args: { routeKey: '/faq/', children: <article data-route-content><h1>Помощь</h1><p>Первое открытие страницы без анимации.</p></article> },
} satisfies Meta<typeof RouteTransition>;
export default meta;
type Story = StoryObj<typeof meta>;

function routeContent(canvasElement: HTMLElement) {
  const content = canvasElement.querySelector('[data-route-content]');
  if (!content) throw new Error('Missing marked route content');
  return content;
}

function Preview({ sameRoute = false }: { sameRoute?: boolean }) {
  const [page, setPage] = useState(0);
  return <>
    <button onClick={() => setPage(value => value + 1)}>Открыть следующую страницу</button>
    <RouteTransition routeKey={sameRoute ? '/guides/' : `/guides/${page}/`}>
      <article data-route-content><h1>Гайды — страница {page + 1}</h1><p>Меню остаётся на месте, контент мягко проявляется.</p></article>
    </RouteTransition>
  </>;
}

export const Initial: Story = {
  play: async ({ canvasElement }) => {
    await expect(routeContent(canvasElement).getAnimations()).toHaveLength(0);
  },
};
export const Navigation: Story = {
  render: () => <Preview />,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть следующую страницу' }));
    await expect(canvas.getByRole('heading', { name: 'Гайды — страница 2' })).toBeVisible();
    const content = routeContent(canvasElement);
    await expect(content.getAnimations()).toHaveLength(matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1);
    await Promise.all(content.getAnimations().map(animation => animation.finished));
    await expect(getComputedStyle(content).opacity).toBe('1');
  },
};
export const RapidReplacement: Story = {
  render: () => <Preview />,
  play: async ({ canvas, canvasElement }) => {
    const button = canvas.getByRole('button', { name: 'Открыть следующую страницу' });
    await userEvent.click(button);
    await userEvent.click(button);
    await expect(canvas.getByRole('heading', { name: 'Гайды — страница 3' })).toBeVisible();
    await expect(routeContent(canvasElement).getAnimations().length).toBeLessThanOrEqual(1);
  },
};
export const SameRoute: Story = {
  render: () => <Preview sameRoute />,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть следующую страницу' }));
    await expect(canvas.getByRole('heading', { name: 'Гайды — страница 2' })).toBeVisible();
    await expect(routeContent(canvasElement).getAnimations()).toHaveLength(0);
  },
};
