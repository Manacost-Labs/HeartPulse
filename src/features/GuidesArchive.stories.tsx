import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import GuidesArchive from './GuidesArchive';
import { GuidesArchiveSkeleton } from './GuidesArchiveSkeleton';

const meta = {
  title: 'Guides/Measured loading geometry', component: GuidesArchive,
  args: { currentPath: '/guides-archive', navigatePath: fn() },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div className="arena-app-guides-archive" style={{ maxWidth: 1092, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
  beforeEach: ({ parameters }) => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input).startsWith('/api/guides-archive/')) {
        if (parameters.holdDetail) return new Promise<Response>(() => {});
        return new Response(JSON.stringify({ id: 1, slug: 'sizing-guide', title: 'Гайд по новому сезону Hearthstone',
          description: 'Подробный разбор колод и стратегий нового сезона.', image: null, publishedAt: '2026-10-19', menuName: 'Стандарт', kind: 'Гайд',
          contentHtml: '<h2>Как играть</h2><p>Выбирайте карты с учётом кривой маны и стратегии вашей колоды.</p>'.repeat(5) }));
      }
      if (!String(input).startsWith('/api/guides-archive?')) return original(input, init);
      const short = parameters.shortText;
      return new Response(JSON.stringify({ page: 1, total: 3, totalPages: 1, filters: { kinds: [], menus: [] },
        items: Array.from({ length: 3 }, (_, index) => ({ id: index, slug: `guide-${index}`,
          title: short ? 'Гайд' : 'Большой гайд по колодам нового сезона Hearthstone',
          description: short ? 'Описание.' : 'Как выбирать карты, строить колоду и побеждать в новом сезоне.',
          image: null, publishedAt: '2026-10-19', menuName: 'Стандартный режим', kind: 'Гайд', kindSlug: 'guide', oldUrl: null, menuCode: null })) }));
    };
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof GuidesArchive>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = { play: async ({ canvas }) => { await expect(await canvas.findAllByRole('link')).toHaveLength(3); } };
export const ShortText: Story = { ...Ready, parameters: { shortText: true } };
export const Detail: Story = { args: { currentPath: '/guides-archive/sizing-guide' } };
export const DetailLoading: Story = { ...Detail, parameters: { holdDetail: true } };
export const Loading: Story = {
  render: () => <section className="guide-archive-page"><GuidesArchiveSkeleton /></section>,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем архив');
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
  },
};
