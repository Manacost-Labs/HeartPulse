import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { SavedDeck } from '../model/savedDeck';
import AccountDecks from './AccountDecks';
import './AccountDashboard.css';
import './AccountPlanSection.css';
import './AccountTabs.css';

const CODE = 'AAECAZ8FBomwBNy5BJvDBM3SBNXSBIGhBQyU1ATI1AT/3wQAAA==';
// Images come through the site's proxy; in Storybook they are not served, so the
// gallery shows its frames (a review run may route them to real renders).
const image = (name: string) => `/api/public-resource/deckview/static/generated/story/${name}.webp`;

const gallery: SavedDeck[] = [
  { id: 'd1', deckCode: CODE, name: 'Жрец на баффах в руке', format: 'standard', status: 'ready',
    comment: 'Держать в муллигане Ритуал жизни.\nПротив агро — менять Вечного на второй Барьер.',
    imageUrl: image('priest'), previewImageUrl: image('priest-preview'), createdAt: '2026-11-05T10:00:00.000Z' },
  { id: 'd2', deckCode: `${CODE}x`, name: 'Пиратский воин', format: 'wild', status: 'ready', comment: '',
    imageUrl: image('warrior'), previewImageUrl: image('warrior-preview'), createdAt: '2026-11-04T10:00:00.000Z' },
  { id: 'd3', deckCode: `${CODE}y`, name: 'Колода', format: 'standard', status: 'pending', comment: 'Попробовать на ладдере',
    imageUrl: null, previewImageUrl: null, createdAt: '2026-11-05T11:00:00.000Z' },
  { id: 'd4', deckCode: `${CODE}z`, name: 'Маг на секретах', format: 'standard', status: 'failed', comment: '',
    imageUrl: null, previewImageUrl: null, createdAt: '2026-11-03T10:00:00.000Z' },
];

function mockDecks(initial: SavedDeck[]) {
  let decks = [...initial];
  const original = window.fetch;
  window.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes('/api/account/decks')) return original(input, init);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET') return Response.json({ decks, limit: 100 });
    if (method === 'POST' && url.endsWith('/api/account/decks')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { deckCode?: string; comment?: string };
      if (!String(body.deckCode).startsWith('AAE')) return Response.json({ error: 'Это не код колоды Hearthstone. Проверьте, что скопировали его целиком.' }, { status: 400 });
      const deck: SavedDeck = { id: `new-${decks.length}`, deckCode: String(body.deckCode), name: 'Колода', format: 'standard',
        status: 'pending', comment: body.comment ?? '', imageUrl: null, previewImageUrl: null, createdAt: new Date().toISOString() };
      decks = [deck, ...decks];
      return Response.json({ deck }, { status: 201 });
    }
    if (method === 'DELETE') {
      decks = decks.filter(deck => !url.endsWith(`/${deck.id}`));
      return Response.json({ success: true });
    }
    return Response.json({ deck: decks[0] });
  };
  return () => { window.fetch = original; };
}

const meta = {
  title: 'Identity/Account Decks',
  component: AccountDecks,
  parameters: { layout: 'padded' },
  decorators: [Story => <div className="account-dashboard"><Story /></div>],
} satisfies Meta<typeof AccountDecks>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Ready decks with their images, one being rendered and one whose image failed. */
export const Gallery: Story = {
  beforeEach: () => mockDecks(gallery),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { level: 3, name: 'Жрец на баффах в руке' })).toBeVisible();
    await expect(canvas.getAllByRole('button', { name: /^Скопировать код колоды «/ })).toHaveLength(4);
    await expect(canvas.getByText('Собираем картинку…')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Повторить' })).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'Добавить колоду' })).toBeNull();
  },
};

/** No decks yet: the form is open at once; a wrong code shows the server's reason. */
export const FirstDeck: Story = {
  beforeEach: () => mockDecks([]),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const code = await canvas.findByLabelText('Код колоды');
    await userEvent.type(code, 'не колода');
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить колоду' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Это не код колоды');
    await userEvent.clear(code);
    await userEvent.type(code, CODE);
    await userEvent.type(canvas.getByLabelText(/Комментарий/), 'Для турнира');
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить колоду' }));
    await waitFor(() => expect(canvas.getByText('Собираем картинку…')).toBeVisible());
    await expect(canvas.getByText('Для турнира')).toBeVisible();
  },
};
