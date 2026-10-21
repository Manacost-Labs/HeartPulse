import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import PageTour from './PageTour';
import PageTourMedia from './PageTourMedia';
import type { PageTourAccess } from './pageTourDefinitions';
import type { PageTourMediaKind } from './pageTourModel';
import './PageTour.css';

const subscriber: PageTourAccess = { authenticated: true, admin: false, standard: true, arena: false, battlegrounds: false };

function MetaPage() {
  return (
    <main id="main-content" style={{ display: 'grid', gap: 24, maxWidth: 1080, margin: '0 auto', padding: '96px 24px 640px', fontFamily: 'var(--font-body)' }}>
      <section data-tour-id="meta-filters" style={{ padding: 16, border: '1px solid #b8904a', background: '#f4e8cc' }}>
        <strong>Управление срезом</strong>
        <p>Формат · Рейтинг · Период · Минимум игр</p>
      </section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p data-tour-id="meta-results"><strong>24</strong> архетипа в текущем срезе</p>
        <div data-tour-id="meta-view-switcher" style={{ display: 'flex', gap: 8 }}>
          <button type="button">Карточки</button><button type="button">Тиры</button><button type="button">Таблица</button>
        </div>
      </div>
      <section data-tour-id="meta-chart" style={{ padding: 16, border: '1px solid #b8904a' }}>Карта меты <button type="button">Показать</button></section>
      <article style={{ padding: 16, background: '#fff8e4' }}>Дракон-друид · 54,1% <button type="button" data-tour-id="meta-deck-action">Архетип</button></article>
    </main>
  );
}

function MatrixPage() {
  return (
    <main id="main-content" style={{ padding: '96px 24px 640px' }}>
      <div data-tour-id="matchups-rank"><button type="button">Стандарт</button> <button type="button">Вольный</button></div>
      <div data-tour-id="matchups-views" style={{ marginTop: 16 }}><button type="button">Полная матрица</button></div>
      <div data-tour-id="matchups-grid" style={{ height: 1100, marginTop: 16, background: 'repeating-linear-gradient(90deg, #cfe2c0 0 60px, #f0c7bd 60px 120px)' }} />
      <h3 data-tour-id="matchups-summary">Лучшие архетипы</h3>
    </main>
  );
}

const meta = {
  title: 'Features/Page tour',
  component: PageTour,
  parameters: { layout: 'fullscreen' },
  args: { pagePath: '/standard/meta/', access: subscriber, launch: 'manual', onClose: fn() },
  // Saved progress would resume a story on the step the previous run left.
  beforeEach: () => {
    for (const key of Object.keys(window.localStorage)) if (key.startsWith('manacost:page-tour')) window.localStorage.removeItem(key);
  },
  render: args => <><MetaPage /><PageTour {...args} /></>,
} satisfies Meta<typeof PageTour>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The meta walkthrough: progress, arrow keys, Escape and the secondary actions. */
export const MetaWalkthrough: Story = {
  play: async ({ args }) => {
    const body = within(document.body);
    const dialog = await body.findByRole('dialog', {}, { timeout: 5_000 });
    // The card fades in; visibility is checked once its entrance has finished.
    await waitFor(() => expect(within(dialog).getByText('Шаг 1 из 5')).toBeVisible());
    await expect(within(dialog).getByRole('heading', { name: 'Срез данных' })).toBeVisible();
    await expect(within(dialog).getByRole('button', { name: 'Больше не показывать' })).toBeVisible();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(body.getByText('Шаг 2 из 5')).toBeVisible());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
  },
};

/** A target taller than the free screen: the card docks as a bottom sheet and the ring stays above it. */
export const LargeTargetSheet: Story = {
  args: { pagePath: '/standard/matchups/' },
  render: args => <><MatrixPage /><PageTour {...args} /></>,
  play: async () => {
    const body = within(document.body);
    await body.findByRole('dialog', {}, { timeout: 5_000 });
    for (const next of [2, 3]) {
      await userEvent.click(body.getByRole('button', { name: 'Далее' }));
      await waitFor(() => expect(body.getByText(`Шаг ${next} из 4`)).toBeVisible());
    }
    await waitFor(() => expect(body.getByRole('heading', { name: 'Как читать цвет' })).toBeVisible());
    await waitFor(() => expect(document.querySelector('.page-tour__dialog')).toHaveAttribute('data-placement', 'bottom-sheet'));
  },
};

const KINDS: PageTourMediaKind[] = ['filters', 'views', 'interval', 'scatter', 'heat', 'band', 'impact', 'sankey', 'trend'];

/** Every step explainer at its rendered size. */
export const Explainers: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, padding: 24, background: '#f4e8cc' }}>
      {KINDS.map(kind => (
        <figure key={kind} style={{ margin: 0, height: 112, border: '1px solid rgba(107, 76, 42, 0.32)', background: 'rgba(255, 249, 232, 0.7)' }}>
          <PageTourMedia kind={kind} />
        </figure>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('svg.page-tour-media')).toHaveLength(KINDS.length);
  },
};
