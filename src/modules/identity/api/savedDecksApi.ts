import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import { authErrorFromPayload } from '../model/authUser';
import { savedDeckFromPayload, savedDecksFromPayload, type SavedDeck } from '../model/savedDeck';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' };
const DECKS_URL = '/api/account/decks';

async function deckRequest(url: string, init: RequestInit, failure: string): Promise<unknown> {
  const response = await fetchWithDeadline(url, { ...init, deadlineMs: 15_000 });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(authErrorFromPayload(payload) || failure);
  return payload;
}

/** The account's decks, newest first; null when they could not be loaded. */
export async function fetchSavedDecks(signal?: AbortSignal): Promise<SavedDeck[] | null> {
  try {
    const response = await fetchWithDeadline(DECKS_URL, { signal, headers: { Accept: 'application/json' } });
    return response.ok ? savedDecksFromPayload(await response.json().catch(() => null)) : null;
  } catch {
    return null;
  }
}

function deckOf(payload: unknown, failure: string): SavedDeck {
  const deck = savedDeckFromPayload((payload as { deck?: unknown } | null)?.deck);
  if (!deck) throw new Error(failure);
  return deck;
}

export async function addSavedDeck(deckCode: string, comment: string): Promise<SavedDeck> {
  const failure = 'Не удалось сохранить колоду';
  return deckOf(await deckRequest(DECKS_URL, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ deckCode, comment }) }, failure), failure);
}

export async function updateSavedDeckComment(id: string, comment: string): Promise<SavedDeck> {
  const failure = 'Не удалось сохранить комментарий';
  return deckOf(await deckRequest(`${DECKS_URL}/${encodeURIComponent(id)}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ comment }) }, failure), failure);
}

export async function retrySavedDeckImage(id: string): Promise<SavedDeck> {
  const failure = 'Не удалось собрать картинку';
  return deckOf(await deckRequest(`${DECKS_URL}/${encodeURIComponent(id)}/render`, { method: 'POST', headers: JSON_HEADERS }, failure), failure);
}

export async function deleteSavedDeck(id: string): Promise<void> {
  await deckRequest(`${DECKS_URL}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: JSON_HEADERS }, 'Не удалось удалить колоду');
}
