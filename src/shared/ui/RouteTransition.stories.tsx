import type { Meta, StoryObj } from '@storybook/react-vite';
import { startTransition, useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { markRouteTransition, RouteContent, RouteTransition } from './RouteTransition';

const meta = {
  title: 'Shared/RouteTransition',
  component: RouteTransition,
  args: { routeKey: '/faq/', children: <RouteContent><article data-route-content><h1>Помощь</h1><p>Первое открытие страницы без анимации.</p></article></RouteContent> },
} satisfies Meta<typeof RouteTransition>;
export default meta;
type Story = StoryObj<typeof meta>;

const animatesRoutes = () => typeof document.startViewTransition === 'function'
  && !matchMedia('(prefers-reduced-motion: reduce)').matches;

function routeAnimations() {
  return document.getAnimations().filter(animation => {
    const pseudo = (animation.effect as KeyframeEffect | null)?.pseudoElement ?? '';
    return pseudo.startsWith('::view-transition-old(route-content)') || pseudo.startsWith('::view-transition-new(route-content)');
  });
}

function Preview({ sameRoute = false }: { sameRoute?: boolean }) {
  const [page, setPage] = useState(0);
  const routeKey = sameRoute ? '/guides/' : `/guides/${page}/`;
  return <>
    <button onClick={() => startTransition(() => { if (!sameRoute) markRouteTransition(); setPage(value => value + 1); })}>
      Открыть следующую страницу
    </button>
    <RouteTransition routeKey={routeKey}>
      <RouteContent key={routeKey}>
        <article data-route-content><h1>Гайды — страница {page + 1}</h1><p>Меню остаётся на месте, контент мягко сменяется.</p></article>
      </RouteContent>
    </RouteTransition>
  </>;
}

export const Initial: Story = {
  play: async () => { await expect(routeAnimations()).toHaveLength(0); },
};
export const Navigation: Story = {
  render: () => <Preview />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть следующую страницу' }));
    await expect(canvas.getByRole('heading', { name: 'Гайды — страница 2' })).toBeVisible();
    if (animatesRoutes()) await waitFor(() => expect(routeAnimations().length).toBeGreaterThan(0));
    await Promise.all(routeAnimations().map(animation => animation.finished));
  },
};
export const RapidReplacement: Story = {
  render: () => <Preview />,
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Открыть следующую страницу' });
    await userEvent.click(button);
    await userEvent.click(button);
    await expect(canvas.getByRole('heading', { name: 'Гайды — страница 3' })).toBeVisible();
  },
};
export const SameRoute: Story = {
  render: () => <Preview sameRoute />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть следующую страницу' }));
    await expect(canvas.getByRole('heading', { name: 'Гайды — страница 2' })).toBeVisible();
    await expect(routeAnimations()).toHaveLength(0);
  },
};
