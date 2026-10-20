import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isZilliaxArt, isZilliaxModule, type CardConfiguration } from '../model/configuration';
import { deckCount, type BuilderCard, type BuilderEntry } from '../model/selection';
import type { useDeckBuilder } from '../useDeckBuilder';
import { GALLERY_IMAGE_PLACEHOLDER, useGalleryImages } from './useGalleryImages';

import { X } from 'lucide-react';

type Editor = ReturnType<typeof useDeckBuilder>;
type Props = { editor: Editor; owner: BuilderEntry; filters: ReactNode };

type Choices = { editor: Editor; owner: BuilderEntry; configuration: CardConfiguration; change: (card: BuilderCard, delta: 1 | -1) => void };

function ConfigurationSlots({ owner, slots, slotCount, change }: Pick<Choices, 'owner' | 'change'> & { slots: BuilderCard[]; slotCount: number }) {
  return <div className="hp-builder-config-slots" data-slots={slotCount} role="group" aria-label={owner.id === 'ETC_080' ? 'Выбранные карты группы' : 'Выбранные модули'}>
      {Array.from({ length: slotCount }, (_, index) => {
        const card = slots[index];
        return <div key={index} className={`hp-builder-config-slot${card ? ' is-filled' : ''}`}>
          {card ? <><img src={card.image} alt="" width={360} height={497} /><span>{card.name}</span>
            <button type="button" aria-label={`${owner.id === 'ETC_080' ? 'Убрать из группы' : 'Убрать модуль'}: ${card.name}`} onClick={() => change(card, -1)}><X size={16} /></button></>
            : <span>{owner.id === 'ETC_080' ? 'Карта' : 'Модуль'} {index + 1}<small>Выберите ниже</small></span>}
        </div>;
      })}
    </div>;
}

function ZilliaxChoices({ editor, owner, configuration, change }: Choices) {
  const board = owner.sideboard ?? [];
  const gallery = useGalleryImages(configuration.modules);
  const modules = board.filter(isZilliaxModule);
  const selectedArt = board.find(isZilliaxArt);
  return <div ref={gallery}>
        <h3>Выберите 2 разных модуля · {modules.length}/2</h3>
        <p className="hp-builder-config-result" role="status">{modules.reduce((sum, card) => sum + card.cost, 0)} маны
          {' · '}{modules.reduce((sum, card) => sum + (card.attack ?? 0), 0)} атаки
          {' · '}{modules.reduce((sum, card) => sum + (card.health ?? 0), 0)} здоровья</p>
        <div className="hp-builder-card-grid">{configuration.modules.map(card => {
          const selected = board.some(item => item.dbfId === card.dbfId);
          return <button key={card.dbfId} type="button" className={`hp-builder-card${selected ? ' is-selected' : ''}`}
            aria-label={`Модуль: ${card.name}`} aria-pressed={selected} title={card.text}
            disabled={!selected && !editor.canAddToConfiguration(card, owner.dbfId, configuration)}
            onClick={() => change(card, selected ? -1 : 1)}>
            <img src={GALLERY_IMAGE_PLACEHOLDER} data-gallery-src={card.image} alt="" width={360} height={497} decoding="async" />
            <span className="hp-builder-card-action">{selected ? '✓ Выбран' : 'Выбрать модуль'}</span>
          </button>;
        })}</div>
        <div className="hp-builder-art-options" role="group" aria-label="Облики Зиллиакса">{configuration.art.map((card, index) =>
          <button type="button" key={card.dbfId} aria-label={`Облик Зиллиакса: ${index + 1}`} aria-pressed={selectedArt?.dbfId === card.dbfId}
            onClick={() => change(card, 1)}><img src={GALLERY_IMAGE_PLACEHOLDER} data-gallery-src={card.image} alt="" width={360} height={497} decoding="async" /><span>Облик {index + 1}</span></button>)}</div>
</div>;
}

function EtcChoices({ editor, owner, configuration, change, filters }: Choices & { filters: ReactNode }) {
  const board = owner.sideboard ?? [];
  const gallery = useGalleryImages(editor.catalog.cards);
  return <>
        <h3>Выберите 3 карты · {deckCount(board)}/3</h3>
        <p>Лимиты копий общие с основной колодой. Недоступные для E.T.C. карты выбрать нельзя.</p>
        {filters}
        <div aria-busy={editor.loading && editor.catalog.cards.length > 0} ref={gallery}>
        {editor.loading && !editor.catalog.cards.length ? <p role="status">Загружаем карты</p> : editor.error ? <div role="alert"><p>{editor.error}</p><button type="button" onClick={editor.retry}>Повторить загрузку</button></div>
          : !editor.catalog.cards.length ? <p className="hp-builder-message">Карты не найдены. Измените поиск или фильтры.</p>
          : <div className="hp-builder-card-grid">{editor.catalog.cards.map(card => {
            const copies = board.find(item => item.dbfId === card.dbfId)?.count ?? 0;
            return <button key={card.dbfId} type="button" className={`hp-builder-card${copies ? ' is-selected' : ''}`}
              aria-label={`Добавить в E.T.C.: ${card.name}${copies ? `, в группе ${copies}` : ''}`}
              disabled={editor.loading || !editor.canAddToConfiguration(card, owner.dbfId, configuration)} onClick={() => change(card, 1)}>
              <img src={GALLERY_IMAGE_PLACEHOLDER} data-gallery-src={card.image} alt="" width={360} height={497} loading="lazy" decoding="async" />
              <span className="hp-builder-card-action">{copies ? `В группе: ${copies}` : 'В группу E.T.C.'}</span>
            </button>;
          })}</div>}
        {!editor.loading && editor.catalog.totalPages > 1 ? <nav className="hp-builder-pagination" aria-label="Страницы группы E.T.C.">
          <button type="button" disabled={editor.filters.page <= 1} onClick={() => editor.filter('page', editor.filters.page - 1)}>Назад</button>
          <span>{editor.filters.page} / {editor.catalog.totalPages}</span>
          <button type="button" disabled={editor.filters.page >= editor.catalog.totalPages} onClick={() => editor.filter('page', editor.filters.page + 1)}>Далее</button>
        </nav> : null}
        </div>
</>;
}

export function CardConfigurationEditor({ editor, owner, filters }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);
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
  const change = (card: BuilderCard, delta: 1 | -1) => { if (configuration) editor.changeConfiguration(card, delta, configuration); };
  const modules = board.filter(isZilliaxModule);
  const slots = owner.id === 'ETC_080' ? board.flatMap(card => Array.from({ length: card.count }, () => card)) : modules;
  const slotCount = owner.id === 'ETC_080' ? 3 : 2;
  return <dialog ref={dialog} className="hp-builder-configuration" aria-labelledby="hp-builder-configuration-title"
    onCancel={editor.closeConfiguration}>
    <div className="hp-builder-configuration-shell">
    <div className="hp-builder-configuration-heading"><h2 id="hp-builder-configuration-title">{owner.id === 'ETC_080' ? 'Группа E.T.C.' : 'Собрать Зиллиакса'}</h2>
      <button type="button" autoFocus aria-label="Вернуться к основной колоде" onClick={editor.closeConfiguration}><X size={20} /></button></div>
    <div className="hp-builder-configuration-body">
    <p>Эти карты входят в код колоды, но не занимают основные слоты.</p>
    <ConfigurationSlots owner={owner} slots={slots} slotCount={slotCount} change={change} />
    {error ? <div className="hp-builder-message" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Повторить загрузку настроек</button></div>
      : !configuration ? <p role="status">Загружаем настройки карты</p>
      : configuration.kind === 'zilliax' ? <ZilliaxChoices editor={editor} owner={owner} configuration={configuration} change={change} /> : <EtcChoices editor={editor} owner={owner} configuration={configuration} change={change} filters={filters} />}
    </div>
    <footer className="hp-builder-configuration-footer"><span role="status">{slots.length === slotCount ? 'Выбор сохранён в колоде' : `Выбрано ${slots.length} из ${slotCount}`}</span>
      <button type="button" onClick={editor.closeConfiguration}>Готово</button></footer>
    </div>
  </dialog>;
}
