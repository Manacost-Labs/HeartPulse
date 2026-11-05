import { useState, type FormEvent } from 'react';
import { LibraryBig, Plus } from 'lucide-react';
import { useSavedDecks, type SavedDecksControl } from '../hooks/useSavedDecks';
import { MAX_DECK_COMMENT_LENGTH } from '../model/savedDeck';
import AccountSectionHead from './AccountSectionHead';
import SavedDeckCard from './SavedDeckCard';
import './AccountDecks.css';

function AddDeckForm({ onAdd, onCancel }: { onAdd: SavedDecksControl['add']; onCancel?: () => void }) {
  const [deckCode, setDeckCode] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    void onAdd(deckCode, comment.trim())
      .then(() => { setDeckCode(''); setComment(''); onCancel?.(); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Не удалось сохранить колоду'))
      .finally(() => setSaving(false));
  };
  return (
    <form className="saved-decks__form" onSubmit={submit} aria-labelledby="saved-decks-form-title">
      <h3 id="saved-decks-form-title">Добавить колоду</h3>
      <div className="saved-decks__field">
        <label htmlFor="saved-deck-code">Код колоды</label>
        <textarea id="saved-deck-code" value={deckCode} onChange={event => setDeckCode(event.target.value)} rows={3} required
          spellCheck={false} autoComplete="off" aria-describedby="saved-deck-code-hint" placeholder="AAECAZ8F… или весь текст колоды из игры" />
        <p id="saved-deck-code-hint" className="account-muted">
          В игре откройте колоду и нажмите «Копировать». Нет кода под рукой? Соберите колоду
          в <a href="/standard/deck-builder/">конструкторе</a> или возьмите из <a href="/standard/meta/">меты</a>.
        </p>
      </div>
      <div className="saved-decks__field">
        <label htmlFor="saved-deck-comment">Комментарий <span className="account-muted">— необязательно</span></label>
        <textarea id="saved-deck-comment" value={comment} onChange={event => setComment(event.target.value)} rows={3}
          maxLength={MAX_DECK_COMMENT_LENGTH} aria-describedby="saved-deck-comment-count" placeholder="Муллиган, сложные матчапы, что заменить…" />
        <p id="saved-deck-comment-count" className="saved-decks__count account-muted">{comment.length} / {MAX_DECK_COMMENT_LENGTH}</p>
      </div>
      {error ? <p className="saved-decks__error" role="alert">{error}</p> : null}
      <div className="saved-decks__actions">
        <button type="submit" className="account-button" disabled={saving || !deckCode.trim()}>{saving ? 'Сохраняем…' : 'Сохранить колоду'}</button>
        {onCancel ? <button type="button" className="account-button account-button--secondary" onClick={onCancel}>Отмена</button> : null}
      </div>
    </form>
  );
}

/**
 * «Мои колоды»: add a deck by its code with a comment; the server keeps it and
 * renders its image, and the decks show as a gallery with «Скопировать код
 * колоды». Only the owner sees them.
 */
export default function AccountDecks() {
  const control = useSavedDecks();
  const [adding, setAdding] = useState(false);
  const decks = control.decks;
  const empty = decks !== null && decks.length === 0;
  const formOpen = adding || empty;

  return (
    <section id="account-decks" className="account-section account-decks" aria-labelledby="account-decks-title">
      <AccountSectionHead
        id="account-decks-title"
        icon={<LibraryBig size={15} aria-hidden="true" />}
        eyebrow="Колоды"
        title="Мои колоды"
        description="Вставьте код колоды — мы сохраним её с картинкой, а код всегда будет под рукой."
        aside={decks && decks.length > 0 && !adding ? (
          <button type="button" className="account-button account-button--small" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden="true" />Добавить колоду
          </button>
        ) : undefined}
      />
      {decks === null ? (
        <p className="account-muted" role={control.failed ? 'alert' : 'status'}>
          {control.failed ? 'Не удалось загрузить колоды. Обновите страницу.' : 'Загружаем колоды…'}
        </p>
      ) : null}
      {formOpen && decks !== null ? <AddDeckForm onAdd={control.add} onCancel={empty ? undefined : () => setAdding(false)} /> : null}
      {decks && decks.length > 0 ? (
        <ul className="saved-decks__gallery" aria-label="Сохранённые колоды">
          {decks.map(deck => (
            <SavedDeckCard key={deck.id} deck={deck} onUpdateComment={control.updateComment} onRetry={control.retry} onRemove={control.remove} />
          ))}
        </ul>
      ) : null}
      <p className="account-muted saved-decks__note">
        Колоды, которыми вы играли с приложением Hearthpulse, с винрейтом — во вкладке <a href="#stats">«Моя статистика»</a>.
      </p>
    </section>
  );
}
