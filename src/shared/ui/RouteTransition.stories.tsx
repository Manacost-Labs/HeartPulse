import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { LoadingBlock } from './LoadingSurface';
import './LoadingSurface.css';
import { RouteTransition } from './RouteTransition';
import { expectRouteEntrance } from './routeEntrance';

const meta = {
  title: 'Shared/RouteTransition',
  component: RouteTransition,
  args: { routeKey: '/faq/', children: <article data-route-content><h1>Помощь</h1><p>Первое открытие страницы без анимации.</p></article> },
} satisfies Meta<typeof RouteTransition>;
export default meta;
type Story = StoryObj<typeof meta>;

const animates = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Script entrances only; the skeleton's own CSS pulse is not one. */
function entrances(canvasElement: HTMLElement) {
  return (canvasElement.querySelector('[data-route-content]')?.getAnimations({ subtree: true }) ?? [])
    .filter(animation => !(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition));
}

function Preview({ sameRoute = false }: { sameRoute?: boolean }) {
  const [page, setPage] = useState(0);
  const routeKey = sameRoute ? '/guides/' : `/guides/${page}/`;
  return <>
    <button onClick={() => {
      if (!sameRoute) expectRouteEntrance(`/guides/${page + 1}/`);
      setPage(value => value + 1);
    }}>Открыть следующую страницу</button>
    <RouteTransition routeKey={routeKey}>
      <article data-route-content><h1>Гайды — страница {page + 1}</h1><p>Меню остаётся на месте, контент мягко проявляется.</p></article>
    </RouteTransition>
  </>;
}

/** The destination commits with a skeleton; its content arrives a moment later. */
function ArrivalPreview({ firstLoad = false }: { firstLoad?: boolean }) {
  const [page, setPage] = useState(0);
  const [ready, setReady] = useState(!firstLoad);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, [ready]);
  return <>
    <button onClick={() => { expectRouteEntrance(`/tierlist/${page + 1}/`); setReady(false); setPage(value => value + 1); }}>
      Открыть тир-лист
    </button>
    <RouteTransition routeKey={`/tierlist/${page}/`}>
      <article data-route-content>
        <h1>Тир-лист {page + 1}</h1>
        {ready ? <ol aria-label="Классы"><li>Маг</li><li>Жрец</li></ol>
          : <div data-loading-surface="rows"><LoadingBlock className="loading-block--row" /><LoadingBlock className="loading-block--row" /></div>}
      </article>
    </RouteTransition>
  </>;
}

export const Initial: Story = {
  play: async ({ canvasElement }) => { await expect(entrances(canvasElement)).toHaveLength(0); },
};
export const Navigation: Story = {
  render: () => <Preview />,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть следующую страницу' }));
    // The entrance starts transparent; the page is visible once it has played.
    await expect(canvas.getByRole('heading', { name: 'Гайды — страница 2' })).toBeInTheDocument();
    await expect(entrances(canvasElement).length).toBe(animates() ? 2 : 0);
    await Promise.all(entrances(canvasElement).map(animation => animation.finished));
    await expect(canvas.getByRole('heading', { name: 'Гайды — страница 2' })).toBeVisible();
  },
};
export const RapidReplacement: Story = {
  render: () => <Preview />,
  play: async ({ canvas, canvasElement }) => {
    const button = canvas.getByRole('button', { name: 'Открыть следующую страницу' });
    await userEvent.click(button);
    await userEvent.click(button);
    await expect(canvas.getByRole('heading', { name: 'Гайды — страница 3' })).toBeInTheDocument();
    await expect(entrances(canvasElement).length).toBeLessThanOrEqual(2);
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Гайды — страница 3' })).toBeVisible());
  },
};
export const SameRoute: Story = {
  render: () => <Preview sameRoute />,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть следующую страницу' }));
    await expect(canvas.getByRole('heading', { name: 'Гайды — страница 2' })).toBeVisible();
    await expect(entrances(canvasElement)).toHaveLength(0);
  },
};
export const SkeletonThenContent: Story = {
  render: () => <ArrivalPreview />,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Открыть тир-лист' }));
    // The skeleton appears at once, without an entrance of its own.
    await expect(canvas.getByRole('heading', { name: 'Тир-лист 2' })).toBeVisible();
    await expect(entrances(canvasElement)).toHaveLength(0);
    await expect(await canvas.findByRole('list', { name: 'Классы' })).toBeInTheDocument();
    if (animates()) {
      await expect(entrances(canvasElement).map(animation => (animation.effect as KeyframeEffect).target?.tagName)).toEqual(['OL']);
    }
    await waitFor(() => expect(canvas.getByRole('list', { name: 'Классы' })).toBeVisible());
  },
};

/** The first document with a skeleton: its server content stays still, the arriving list fades and rises in. */
export const FirstDocumentArrival: Story = {
  render: () => <ArrivalPreview firstLoad />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('heading', { name: 'Тир-лист 1' })).toBeVisible();
    await expect(entrances(canvasElement)).toHaveLength(0);
    await expect(await canvas.findByRole('list', { name: 'Классы' })).toBeInTheDocument();
    if (animates()) {
      const [arrival] = entrances(canvasElement);
      await expect((arrival.effect as KeyframeEffect).target?.tagName).toBe('OL');
      await expect(String((arrival.effect as KeyframeEffect).getKeyframes()[0].transform)).toMatch(/^translateY\(/);
    }
    await waitFor(() => expect(canvas.getByRole('list', { name: 'Классы' })).toBeVisible());
  },
};
