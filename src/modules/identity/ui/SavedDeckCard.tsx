import { useState, type FormEvent } from 'react';
import { Check, Copy, ImageOff, Loader2, Pencil, Trash2 } from 'lucide-react';
import { MAX_DECK_COMMENT_LENGTH, type SavedDeck } from '../model/savedDeck';

const FORMAT_LABELS: Record<SavedDeck['format'], string> = { standard: 'Стандарт', wild: 'Вольный' };

export type SavedDeckCardProps = {
  deck: SavedDeck;
  onUpdateComment: (id: string, comment: string) => Promise<void>;
  onRetry: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
};

function DeckImage({ deck, onRetry }: Pick<SavedDeckCardProps, 'deck' | 'onRetry'>) {
  const [retrying, setRetrying] = useState(false);
  // The picture exists but did not load (network, proxy): say so instead of a broken image.
  const [broken, setBroken] = useState(false);
  if (deck.status === 'ready' && deck.previewImageUrl && broken) {
    return (
      <div className="saved-deck__image saved-deck__image--state">
        <ImageOff size={22} aria-hidden="true" />
        <span>Картинка не загрузилась</span>
        <button type="button" className="account-button account-button--secondary account-button--small" onClick={() => setBroken(false)}>
          Загрузить снова
        </button>
      </div>
    );
  }
  if (deck.status === 'ready' && deck.previewImageUrl) {
    return (
      <a className="saved-deck__image" href={deck.imageUrl ?? deck.previewImageUrl} target="_blank" rel="noreferrer" aria-label={`Открыть картинку колоды «${deck.name}»`}>
        <img src={deck.previewImageUrl} alt="" loading="lazy" decoding="async" width={720} height={720} onError={() => setBroken(true)} />
      </a>
    );
  }
  if (deck.status === 'pending') {
    return (
      <div className="saved-deck__image saved-deck__image--state" role="status">
        <Loader2 size={22} className="saved-deck__spinner" aria-hidden="true" />
        <span>Собираем картинку…</span>
      </div>
    );
  }
  return (
    <div className="saved-deck__image saved-deck__image--state">
      <ImageOff size={22} aria-hidden="true" />
      <span>Картинка не собралась</span>
      <button type="button" className="account-button account-button--secondary account-button--small" disabled={retrying}
        onClick={() => { setRetrying(true); void onRetry(deck.id).catch(() => undefined).finally(() => setRetrying(false)); }}>
        {retrying ? 'Повторяем…' : 'Повторить'}
      </button>
    </div>
  );
}

/** One saved deck: its image, name, format and comment, with «Скопировать код» first. */
export default function SavedDeckCard({ deck, onUpdateComment, onRetry, onRemove }: SavedDeckCardProps) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(deck.comment);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const copy = () => {
    if (!navigator.clipboard) {
      setError('Браузер не дал скопировать. Код колоды: ' + deck.deckCode);
      return;
    }
    void navigator.clipboard.writeText(deck.deckCode).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    }, () => setError('Не удалось скопировать: выделите код вручную.'));
  };
  const act = (action: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    setError('');
    void action()
      .then(() => after?.())
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Не получилось'))
      .finally(() => setBusy(false));
  };
  const saveComment = (event: FormEvent) => {
    event.preventDefault();
    act(() => onUpdateComment(deck.id, draft.trim()), () => setEditing(false));
  };
  const CopyIcon = copied ? Check : Copy;

  return (
    <li className="saved-deck">
      <DeckImage deck={deck} onRetry={onRetry} />
      <div className="saved-deck__body">
        <div className="saved-deck__title">
          <h3>{deck.name}</h3>
          <span className="saved-deck__format">{FORMAT_LABELS[deck.format]}</span>
        </div>
        {editing ? (
          <form className="saved-deck__edit" onSubmit={saveComment}>
            <label className="saved-deck__visually-hidden" htmlFor={`saved-deck-comment-${deck.id}`}>Комментарий к колоде</label>
            <textarea id={`saved-deck-comment-${deck.id}`} value={draft} rows={4} maxLength={MAX_DECK_COMMENT_LENGTH}
              onChange={event => setDraft(event.target.value)} autoFocus />
            <div className="saved-deck__row">
              <button type="submit" className="account-button account-button--small" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
              <button type="button" className="account-button account-button--secondary account-button--small"
                onClick={() => { setDraft(deck.comment); setEditing(false); }}>Отмена</button>
            </div>
          </form>
        ) : deck.comment ? (
          <p className="saved-deck__comment">{deck.comment}</p>
        ) : null}
        <button type="button" className="account-button saved-deck__copy" onClick={copy}
          aria-label={copied ? `Код колоды «${deck.name}» скопирован` : `Скопировать код колоды «${deck.name}»`}>
          <CopyIcon size={16} aria-hidden="true" />{copied ? 'Код скопирован' : 'Скопировать код'}
        </button>
        {confirming ? (
          <div className="saved-deck__row" role="group" aria-label="Удалить колоду?">
            <span className="saved-deck__confirm">Удалить колоду?</span>
            <button type="button" className="account-button account-button--small" disabled={busy} onClick={() => act(() => onRemove(deck.id))}>Удалить</button>
            <button type="button" className="account-button account-button--secondary account-button--small" onClick={() => setConfirming(false)}>Отмена</button>
          </div>
        ) : !editing ? (
          <div className="saved-deck__row saved-deck__row--quiet">
            <button type="button" className="saved-deck__link" onClick={() => { setDraft(deck.comment); setEditing(true); }}>
              <Pencil size={14} aria-hidden="true" />Комментарий
            </button>
            <button type="button" className="saved-deck__link" onClick={() => setConfirming(true)}>
              <Trash2 size={14} aria-hidden="true" />Удалить
            </button>
          </div>
        ) : null}
        {error ? <p className="saved-deck__error" role="alert">{error}</p> : null}
      </div>
    </li>
  );
}
