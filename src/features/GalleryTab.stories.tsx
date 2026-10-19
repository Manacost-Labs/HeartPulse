import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import GalleryTab from './GalleryTab';

const image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="720" height="518"%3E%3Crect width="720" height="518" fill="%23784d30"/%3E%3C/svg%3E';
const items = Array.from({ length: 3 }, (_, index) => ({ id: `art-${index}`, title: 'Арт нового сезона',
  description: 'Иллюстрация для коллекции Hearthstone.', tag: 'Арена', width: 1920, height: 1080, bytes: 1048576,
  thumbUrl: image, previewUrl: image, imageUrl: image, downloadUrl: image, createdAt: '2026-10-19T12:00:00Z' }));
const meta = {
  title: 'Gallery/Measured loading geometry', component: GalleryTab,
  args: { loading: false, data: { items, updatedAt: null }, onNavigate: fn() },
  parameters: { layout: 'fullscreen', fullPage: true },
  decorators: [Story => <div className="arena-app-gallery" style={{ maxWidth: 1092, marginInline: 'auto', paddingInline: 'clamp(.8rem, 2vw, 1.5rem)' }}><Story /></div>],
} satisfies Meta<typeof GalleryTab>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = { play: async ({ canvas }) => { await expect(canvas.getAllByRole('article')).toHaveLength(3); } };
export const LongText: Story = { args: { data: { updatedAt: null, items: items.map(item => ({ ...item,
  title: 'Большая иллюстрация нового сезона Hearthstone для коллекции артов',
  description: 'Подробная иллюстрация с персонажами и событиями нового сезона Hearthstone, доступная для просмотра и скачивания в исходном качестве.' })) } } };
export const Loading: Story = { args: { loading: true }, play: async ({ canvas }) => {
  await expect(canvas.getByRole('status')).toHaveTextContent('Загружаем галерею');
  await expect(canvas.queryByRole('article')).not.toBeInTheDocument();
} };
export const Empty: Story = { args: { data: { items: [], updatedAt: null } } };
