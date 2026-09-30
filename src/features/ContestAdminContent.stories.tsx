import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ArticleReads } from './adminArticleReadsModel';
import type { AdminContentClient } from './adminContentClient';
import type { Article, GalleryItem } from './adminContentListModel';
import { ContestAdminArticles } from './ContestAdminArticles';
import { ContestAdminGallery } from './ContestAdminGallery';
import './contests.css';
import '../modules/adminWorkspace/public.css';

// Invented workshop data; not real publications.
const cover = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 160 100%22%3E%3Crect width=%22160%22 height=%22100%22 fill=%22%23c9a45c%22/%3E%3Ccircle cx=%2280%22 cy=%2250%22 r=%2228%22 fill=%22%23785018%22/%3E%3C/svg%3E';
const article = (id: string, values: Partial<Article> = {}): Article => ({
  id, title: `Мета-отчёт Стандарта №${id}`, date: '2026-09-29', tag: 'Мета-отчет', mode: 'standard', excerpt: 'Какие колоды держат лестницу на этой неделе.',
  image: cover, url: 'https://kolodahearthstone.com/vip/meta/', likes: 0, dislikes: 0, ...values,
});
const articles: Article[] = [
  article('41', { likes: 12, dislikes: 1 }),
  article('40', { title: 'Тир-лист героев Полей Сражений', tag: 'Поля Сражений', mode: 'battlegrounds', date: '2026-09-28', excerpt: '' }),
  article('39', { title: 'Арена: как драфтить после патча', tag: 'Арена', mode: 'arena', date: '2026-09-19', likes: 4 }),
  article('38', { title: 'Вольный формат: сильнейшие архетипы', tag: 'Гайд', mode: 'wild', date: '2026-09-13', excerpt: '', image: '' }),
  article('37', { title: 'Новости проекта', tag: '', mode: 'general', date: '2026-08-02', url: '#' }),
];
const art = (id: string, values: Partial<GalleryItem> = {}): GalleryItem => ({
  id, title: `Легенда Арены ${id}`, description: 'Обложка для статьи об Арене.', tag: 'Обложка', source: 'Blizzard', width: 1920, height: 1080, bytes: 412_000, format: 'webp',
  previewUrl: cover, thumbUrl: cover, imageUrl: cover, downloadUrl: cover, createdAt: '2026-09-12T10:00:00.000Z', ...values,
});
const gallery: GalleryItem[] = [art('1'), art('2', { title: 'Паладин — фан-арт', description: '', tag: 'Fan art', source: '', bytes: 2_400_000, format: 'png' })];

const reads: ArticleReads = {
  days: 30, since: '2026-06-01T10:00:00.000Z', totals: { opens: 58, readers: 31 },
  articles: [
    { articleId: '41', opens: 34, readers: 22, opensTotal: 34, readersTotal: 22, lastOpenedAt: '2026-09-30T09:12:00.000Z' },
    { articleId: '39', opens: 21, readers: 12, opensTotal: 46, readersTotal: 25, lastOpenedAt: '2026-09-29T18:40:00.000Z' },
    { articleId: '40', opens: 3, readers: 3, opensTotal: 3, readersTotal: 3, lastOpenedAt: '2026-09-28T20:05:00.000Z' },
    { articleId: '38', opens: 0, readers: 0, opensTotal: 7, readersTotal: 4, lastOpenedAt: '2026-08-02T11:00:00.000Z' },
  ],
};
const wait = () => new Promise(resolve => { window.setTimeout(resolve, 300); });
const client = (emptyLists = false): AdminContentClient => ({
  articles: async () => (emptyLists ? [] : articles),
  articleReads: async () => (emptyLists ? { ...reads, since: null, totals: { opens: 0, readers: 0 }, articles: [] } : reads),
  saveArticle: async draft => { await wait(); return { article: { id: 'new', ...draft } }; },
  deleteArticle: wait,
  gallery: async () => (emptyLists ? [] : gallery),
  uploadGalleryItem: async () => { await wait(); return { item: gallery[0] }; },
  deleteGalleryItem: wait,
});
const filled = client();
const empty = client(true);

const frame = (Story: () => React.ReactNode) => (
  <main className="admin-workspace-page admin-tailadmin-shell" style={{ minHeight: '100vh', padding: 24 }}>
    <Story />
  </main>
);

const meta = { title: 'Admin/Content lists', decorators: [frame], parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Articles: Story = { render: () => <ContestAdminArticles onMessage={() => undefined} client={filled} /> };
export const ArticlesEmpty: Story = { render: () => <ContestAdminArticles onMessage={() => undefined} client={empty} /> };
export const Gallery: Story = { render: () => <ContestAdminGallery onMessage={() => undefined} client={filled} /> };
