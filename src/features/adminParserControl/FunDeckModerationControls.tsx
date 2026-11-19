import React, { useState } from 'react';
import { EyeOff, Pin, Undo2 } from 'lucide-react';
import { fetchWithDeadline } from '../../shared/http/fetchWithDeadline';
import { authJsonHeaders, errorText, formatDate, readResponseJson } from '../adminConsole/adminSectionKit';

export type FunDeckModeration = 'hide' | 'pin' | null;

export type ModeratedDeck = {
  title: string;
  deckCode: string;
  format: string;
  className: string;
  kind?: 'brew' | 'off_meta';
  moderation?: FunDeckModeration;
};

export type HiddenFunDeck = {
  format: string;
  deckCode: string;
  deck: ModeratedDeck | null;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string;
};

type ModerationAction = 'hide' | 'pin' | 'clear';

async function sendModeration(deck: Pick<ModeratedDeck, 'format' | 'deckCode'>, action: ModerationAction): Promise<void> {
  const response = await fetchWithDeadline('/api/admin/fun-decks/moderation', {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify({ format: deck.format.toLowerCase(), deckCode: deck.deckCode, action }),
  });
  if (!response.ok) {
    const body = await readResponseJson(response);
    throw new Error(typeof body.error === 'string' ? body.error : 'Не удалось сохранить решение по колоде');
  }
}

/** Runs one decision, then lets the card reload; the server's reason shows as text. */
function useModeration(onChanged: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (deck: Pick<ModeratedDeck, 'format' | 'deckCode'>, action: ModerationAction) => {
    setBusy(true);
    setError(null);
    try {
      await sendModeration(deck, action);
      onChanged();
    } catch (caught) {
      setError(errorText(caught, 'Не удалось сохранить решение по колоде'));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/** The deck's kind and decision as badges. */
export function FunDeckStatusBadges({ deck }: { deck: Pick<ModeratedDeck, 'kind' | 'moderation'> }) {
  return (
    <span className="admin-fun-decks__badges">
      <span>{deck.kind === 'off_meta' ? 'Офф-мета' : 'Бру'}</span>
      {deck.moderation === 'hide' && <span className="is-hidden">Скрыта</span>}
      {deck.moderation === 'pin' && <span className="is-pinned">Закреплена</span>}
    </span>
  );
}

/** Hide, pin or return one deck. */
export function FunDeckModerationControls({ deck, onChanged }: { deck: ModeratedDeck; onChanged: () => void }) {
  const { busy, error, run } = useModeration(onChanged);
  return (
    <div className="admin-fun-decks__moderation">
      {deck.moderation !== 'hide' && (
        <button type="button" className="contest-secondary-button" disabled={busy} onClick={() => void run(deck, 'hide')}>
          <EyeOff size={15} /> Скрыть
        </button>
      )}
      {deck.moderation !== 'pin' && (
        <button type="button" className="contest-secondary-button" disabled={busy} onClick={() => void run(deck, 'pin')}>
          <Pin size={15} /> Закрепить
        </button>
      )}
      {deck.moderation && (
        <button type="button" className="contest-secondary-button" disabled={busy} onClick={() => void run(deck, 'clear')}>
          <Undo2 size={15} /> Вернуть
        </button>
      )}
      {error && <p className="admin-parser-empty" role="alert">{error}</p>}
    </div>
  );
}

/** The hidden decks, from their snapshots, each with a way back. */
export function HiddenFunDecks({ hidden, onChanged }: { hidden: readonly HiddenFunDeck[]; onChanged: () => void }) {
  const { busy, error, run } = useModeration(onChanged);
  if (!hidden.length) return null;
  return (
    <div className="admin-fun-decks__hidden" aria-label="Скрытые колоды">
      <h3>Скрытые ({hidden.length})</h3>
      {error && <p className="admin-parser-empty" role="alert">{error}</p>}
      <ul>
        {hidden.map(item => (
          <li key={`${item.format}:${item.deckCode}`}>
            <span>
              <strong>{item.deck?.title ?? item.deckCode.slice(0, 24)}</strong>
              {' '}· {item.deck?.className ?? '—'} · {item.format}
              {item.note ? ` · ${item.note}` : ''}
              {' '}· {item.updatedBy ?? '—'}, {formatDate(item.updatedAt)}
            </span>
            <button type="button" className="contest-secondary-button" disabled={busy} onClick={() => void run(item, 'clear')}>
              <Undo2 size={15} /> Вернуть
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
