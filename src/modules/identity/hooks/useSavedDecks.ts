import { useCallback, useEffect, useState } from 'react';
import {
  addSavedDeck,
  deleteSavedDeck,
  fetchSavedDecks,
  retrySavedDeckImage,
  updateSavedDeckComment,
} from '../api/savedDecksApi';
import type { SavedDeck } from '../model/savedDeck';

const POLL_MS = 3_000;
/** Five minutes, as long as the server waits before it reports a render as failed. */
const MAX_POLLS = 100;

export type SavedDecksControl = {
  /** Null while loading or when the list could not be loaded (`failed`). */
  decks: SavedDeck[] | null;
  failed: boolean;
  add: (deckCode: string, comment: string) => Promise<void>;
  updateComment: (id: string, comment: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

/**
 * The account's saved decks. While an image is being rendered the list is
 * reloaded every few seconds, so a new deck turns into its picture by itself.
 * Actions reject with the server's message for the form to show.
 */
export function useSavedDecks(): SavedDecksControl {
  const [decks, setDecks] = useState<SavedDeck[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [polls, setPolls] = useState(0);
  const pending = Boolean(decks?.some(deck => deck.status === 'pending'));

  useEffect(() => {
    const controller = new AbortController();
    void fetchSavedDecks(controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setDecks(value);
      setFailed(value === null);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!pending || polls >= MAX_POLLS) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchSavedDecks(controller.signal).then(value => {
        if (controller.signal.aborted) return;
        // A failed reload counts as a poll too, so the next one is still scheduled.
        if (value) setDecks(value);
        setPolls(count => count + 1);
      });
    }, POLL_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [pending, polls]);

  const replace = (deck: SavedDeck) => setDecks(list => (list ?? []).map(item => (item.id === deck.id ? deck : item)));

  const add = useCallback(async (deckCode: string, comment: string) => {
    const deck = await addSavedDeck(deckCode, comment);
    setPolls(0);
    setDecks(list => [deck, ...(list ?? [])]);
  }, []);
  const updateComment = useCallback(async (id: string, comment: string) => replace(await updateSavedDeckComment(id, comment)), []);
  const retry = useCallback(async (id: string) => {
    const deck = await retrySavedDeckImage(id);
    setPolls(0);
    replace(deck);
  }, []);
  const remove = useCallback(async (id: string) => {
    await deleteSavedDeck(id);
    setDecks(list => (list ?? []).filter(deck => deck.id !== id));
  }, []);

  return { decks, failed, add, updateComment, retry, remove };
}
