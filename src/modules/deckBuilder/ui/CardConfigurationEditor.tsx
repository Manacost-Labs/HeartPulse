import { useEffect, useState, type ReactNode } from 'react';
import { isZilliaxArt, isZilliaxModule, type CardConfiguration } from '../model/configuration';
import { deckCount, type BuilderCard, type BuilderEntry } from '../model/selection';
import type { useDeckBuilder } from '../useDeckBuilder';

type Editor = ReturnType<typeof useDeckBuilder>;
type Props = { editor: Editor; owner: BuilderEntry; filters: ReactNode };

export function CardConfigurationEditor({ editor, owner, filters }: Props) {
  const [configuration, setConfiguration] = useState<CardConfiguration | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const load = editor.loadConfiguration;
  const { id, dbfId } = owner;
  useEffect(() => {
    const controller = new AbortController();
    setConfiguration(null);
    setError('');
    void load({ id, dbfId }, AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]))
      .then(value => { if (!controller.signal.aborted) setConfiguration(value); })
      .catch(() => { if (!controller.signal.aborted) setError('Не удалось загрузить настройки карты. Попробуйте ещё раз.'); });
    return () => controller.abort();
  }, [load, id, dbfId, retry]);
  const board = owner.sideboard ?? [];
  const selectedArt = board.find(isZilliaxArt);
  const change = (card: BuilderCard, delta: 1 | -1) => { if (configuration) editor.changeConfiguration(card, delta, configuration); };
  return <section className="hp-builder-gallery hp-builder-configuration" aria-labelledby="hp-builder-configuration-title">
    <div className="hp-builder-configuration-heading"><h2 id="hp-builder-configuration-title">{owner.id === 'ETC_080' ? 'Группа E.T.C.' : 'Собрать Зиллиакса'}</h2>
      <button type="button" onClick={editor.closeConfiguration}>Вернуться к основной колоде</button></div>
    <p>Эти карты входят в код колоды, но не занимают основные слоты.</p>
    {error ? <div className="hp-builder-message" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Повторить загрузку настроек</button></div>
      : !configuration ? <p role="status">Загружаем настройки карты…</p>
      : configuration.kind === 'zilliax' ? <>
        <h3>Выберите 2 разных модуля · {board.filter(isZilliaxModule).length}/2</h3>
        <p className="hp-builder-config-result" role="status">{board.filter(isZilliaxModule).reduce((sum, card) => sum + card.cost, 0)} маны
          {' · '}{board.filter(isZilliaxModule).reduce((sum, card) => sum + (card.attack ?? 0), 0)} атаки
          {' · '}{board.filter(isZilliaxModule).reduce((sum, card) => sum + (card.health ?? 0), 0)} здоровья</p>
        <div className="hp-builder-card-grid">{configuration.modules.map(card => {
          const selected = board.some(item => item.dbfId === card.dbfId);
          return <button key={card.dbfId} type="button" className={`hp-builder-card${selected ? ' is-selected' : ''}`}
            aria-label={`Модуль: ${card.name}`} aria-pressed={selected} title={card.text}
            disabled={!selected && !editor.canAddToConfiguration(card, owner.dbfId, configuration)}
            onClick={() => change(card, selected ? -1 : 1)}>
            <img src={card.image} alt="" width={360} height={497} loading="lazy" />
            <span className="hp-builder-card-action">{selected ? '✓ Выбран' : 'Выбрать модуль'}</span>
          </button>;
        })}</div>
        <label className="hp-builder-art-choice">Вариант арта<select value={selectedArt?.dbfId ?? ''}
          onChange={event => { const art = configuration.art.find(card => card.dbfId === Number(event.target.value)); if (art) change(art, 1); }}>
          <option value="" disabled>Выберите облик</option>{configuration.art.map((card, index) => <option key={card.dbfId} value={card.dbfId}>Вариант {index + 1}</option>)}
        </select></label>
        {selectedArt ? <img className="hp-builder-art-preview" src={selectedArt.image} alt="Выбранный облик Зиллиакса" width={360} height={497} /> : null}
      </> : <>
        <h3>Выберите 3 карты · {deckCount(board)}/3</h3>
        <p>Лимиты копий общие с основной колодой. Недоступные для E.T.C. карты выбрать нельзя.</p>
        <ul className="hp-builder-band">{board.map(card => <li key={card.dbfId}><span>{card.name} ×{card.count}</span>
          <button type="button" aria-label={`Убрать из группы: ${card.name}`} onClick={() => change(card, -1)}>Убрать</button></li>)}</ul>
        {filters}
        {editor.loading ? <p role="status">Загружаем карты…</p> : editor.error ? <div role="alert"><p>{editor.error}</p><button type="button" onClick={editor.retry}>Повторить загрузку</button></div>
          : <div className="hp-builder-card-grid">{editor.catalog.cards.map(card => {
            const copies = board.find(item => item.dbfId === card.dbfId)?.count ?? 0;
            return <button key={card.dbfId} type="button" className={`hp-builder-card${copies ? ' is-selected' : ''}`}
              aria-label={`Добавить в E.T.C.: ${card.name}${copies ? `, в группе ${copies}` : ''}`}
              disabled={!editor.canAddToConfiguration(card, owner.dbfId, configuration)} onClick={() => change(card, 1)}>
              <img src={card.image} alt="" width={360} height={497} loading="lazy" />
              <span className="hp-builder-card-action">{copies ? `В группе: ${copies}` : 'В группу E.T.C.'}</span>
            </button>;
          })}</div>}
        {!editor.loading && editor.catalog.totalPages > 1 ? <nav className="hp-builder-pagination" aria-label="Страницы группы E.T.C.">
          <button type="button" disabled={editor.filters.page <= 1} onClick={() => editor.filter('page', editor.filters.page - 1)}>Назад</button>
          <span>{editor.filters.page} / {editor.catalog.totalPages}</span>
          <button type="button" disabled={editor.filters.page >= editor.catalog.totalPages} onClick={() => editor.filter('page', editor.filters.page + 1)}>Далее</button>
        </nav> : null}
      </>}
  </section>;
}
