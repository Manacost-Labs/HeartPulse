import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor } from 'storybook/test';
import { ArchetypeDetailSection } from '../modules/constructedArchetypes/public';
import ConstructedArchetypes from './ConstructedArchetypes';
import { ArchetypeAccessPendingSkeleton, ArchetypeAnalysisLoading, ArchetypeAnalysisReserve, ArchetypeBuildsSkeleton, ArchetypeHistorySkeleton } from './ConstructedArchetypeDetailSkeletons';
import { ConstructedArchetypesFixture, installConstructedArchetypeFixtures } from '../../tests/fixtures/constructed-archetypes-harness';

// Paired states for tests/skeleton-geometry-browser.test.mjs: the loaded
// subscriber page and each section placeholder in the same page container.
// Compare `.archetype-builds`, `.archetype-history` and
// `.constructed-analysis-stack` between Ready and the matching Loading story.

const SQUARE_DECK = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048"%3E%3Crect width="2048" height="2048" fill="%23ead3a0"/%3E%3C/svg%3E';

/** The archetype fixture, with deck renders answered at once by a square image as the renderer produces. */
function installSquareDeckRenders() {
  const restore = installConstructedArchetypeFixtures();
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => String(input).includes('/api/deck/render')
    ? new Response(JSON.stringify({ ok: true, ready: true, imageUrl: SQUARE_DECK, previewImageUrl: SQUARE_DECK }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })
    : fixtureFetch(input, init)) as typeof fetch;
  return restore;
}

function LoadingSection({ title, skeleton, reserveViewport = false }: { title: string; skeleton: ReactNode; reserveViewport?: boolean }) {
  return <main className="archetypes-page archetype-detail-page">
    <ArchetypeDetailSection title={title} loading error="" onRetry={fn()} reserveViewport={reserveViewport} skeleton={skeleton} />
  </main>;
}

const meta = {
  title: 'Archetype detail/Measured loading geometry',
  component: ConstructedArchetypesFixture,
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div style={{ maxWidth: 1092, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
  beforeEach: installSquareDeckRenders,
} satisfies Meta<typeof ConstructedArchetypesFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  args: { initialPath: '/standard/archetypes/wild/thief-priest' },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.constructed-matchup-ledger li')).not.toBeNull(), { timeout: 5_000 });
  },
};

export const BuildsLoading: Story = {
  render: () => <LoadingSection reserveViewport title="Сборки архетипа" skeleton={<ArchetypeBuildsSkeleton deckCount={14} />} />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем сборки архетипа');
    await expect(canvasElement.querySelector('[aria-busy="true"]')).toBeNull();
    await expect(canvas.queryByRole('heading')).toBeNull();
    await expect(canvasElement.querySelector('a, button')).toBeNull();
  },
};

export const HistoryLoading: Story = {
  render: () => <LoadingSection title="История архетипа" skeleton={<ArchetypeHistorySkeleton />} />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем историю архетипа');
    await expect(canvasElement.querySelector('[aria-busy="true"]')).toBeNull();
    await expect(canvas.queryByRole('heading')).toBeNull();
  },
};

/** The fitted placeholder comes with the lazy analysis chunk, as on the page. */
export const AnalysisLoading: Story = {
  render: () => <LoadingSection title="Матчапы и муллиган" skeleton={<ArchetypeAnalysisLoading />} />,
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.constructed-matchup-ledger li')).not.toBeNull(), { timeout: 5_000 });
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем матчапы и муллиган');
    await expect(canvasElement.querySelector('[aria-busy="true"]')).toBeNull();
    await expect(canvas.queryByRole('heading')).toBeNull();
    await expect(canvasElement.querySelector('a, button')).toBeNull();
  },
};

/** Before the analysis chunk arrives: one status and a first-screen reserve. */
export const AnalysisChunkLoading: Story = {
  render: () => <LoadingSection title="Матчапы и муллиган" skeleton={<ArchetypeAnalysisReserve />} />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем матчапы и муллиган');
    await expect(canvasElement.querySelector('[aria-busy="true"]')).toBeNull();
  },
};

/** The guest's answer: the teaser with its featured build, then the inline gate. */
function installGuestTeaser() {
  const restore = installSquareDeckRenders();
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fixtureFetch(input, init);
    if (!String(input).includes('/api/constructed-archetypes/teaser/')) return response;
    const payload = await response.json();
    return new Response(JSON.stringify({ ...payload, featuredBuild: { games: 8578, winrate: 64.2, updatedAt: payload.updatedAt } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return () => { globalThis.fetch = fixtureFetch; restore(); };
}

export const GuestReady: Story = {
  beforeEach: installGuestTeaser,
  render: () => <ConstructedArchetypes currentPath="/standard/archetypes/wild/thief-priest" navigatePath={fn()} hasFullAccess={false} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.archetype-build-preview dd')).not.toBeNull(), { timeout: 5_000 });
    await expect(canvasElement.querySelector('.arena-inline-paywall')).not.toBeNull();
  },
};

/** While access is checked a guest sees the preview and the inline gate as placeholders, in place. */
export const GuestAccessPending: Story = {
  render: () => <LoadingSection reserveViewport title="Сборки архетипа" skeleton={<ArchetypeAccessPendingSkeleton deckCount={14} featured />} />,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Проверяем доступ к сборкам архетипа');
    await expect(canvas.queryByRole('heading')).toBeNull();
    await expect(canvasElement.querySelector('a, button')).toBeNull();
    // The builds gallery is for a remembered viewer only (the head script's mark).
    await expect(getComputedStyle(canvasElement.querySelector('.archetype-member-skeleton') as Element).display).toBe('none');
  },
};
