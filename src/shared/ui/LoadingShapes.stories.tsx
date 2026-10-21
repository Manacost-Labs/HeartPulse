import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { LoadingSurface } from './LoadingSurface';
import { LoadingCardTile, LoadingChart, LoadingDeckRender, LoadingHeader, LoadingKpiStrip, LoadingTableRows, LoadingText, LoadingValue } from './LoadingShapes';
import './LoadingSurface.css';
import './PublicPageBanner.css';

// The shared placeholder set. On a page each shape sits inside the loaded
// view's own classes; here plain containers stand in for them.

const meta = {
  title: 'Shared/LoadingShapes',
  component: LoadingSurface,
  args: { label: 'Загружаем страницу', quiet: true, layout: 'rows' },
  decorators: [Story => <div className="route-parchment-page" style={{ width: 760, maxWidth: '100%', padding: 24, boxSizing: 'border-box' }}><Story /></div>],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof LoadingSurface>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Set: Story = {
  render: args => <LoadingSurface {...args}>
    <LoadingHeader eyebrow="Подписка" title="Ваш план" description="Что оплачено, до какого числа и что входит." />
    <section className="traditional-mode-banner" style={{ minHeight: 0, padding: 16 }}>
      <LoadingKpiStrip className="traditional-mode-banner__summary" labels={['Архетипов', 'Игр в выборке']} wide />
    </section>
    <p style={{ margin: 0 }}><LoadingText>Строка текста, которая переносится там же, где настоящий текст</LoadingText> <LoadingValue /></p>
    <div style={{ display: 'grid', gap: 8 }}><LoadingTableRows count={3} /></div>
    <LoadingChart height={160} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
      {Array.from({ length: 4 }, (_, index) => <LoadingCardTile key={index} />)}
    </div>
    {/* DeckRenderPreview.css (the deck domain) gives the stage its square; stood in for here. */}
    <style>{'.loading-shapes-story-deck .deck-render-preview__loading { display: block; aspect-ratio: 1 / 1; }'}</style>
    <div className="loading-shapes-story-deck" style={{ width: 240 }}><LoadingDeckRender /></div>
  </LoadingSurface>,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
    await expect(canvas.queryByRole('heading')).toBeNull();
    await expect(canvasElement.querySelector('a, button')).toBeNull();
  },
};

export const Phone: Story = { ...Set, parameters: { viewport: { defaultViewport: 'mobile1' } } };
