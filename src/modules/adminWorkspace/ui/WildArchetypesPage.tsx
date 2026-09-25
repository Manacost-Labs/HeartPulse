'use client';

import { useEffect, useMemo, useState } from 'react';
import { readWildArchetypes, readWildDecks, type WildArchetype, type WildDeck } from '../wildArchetypesModel';
import './WildArchetypesPage.css';

const percent = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;
const number = (value: number | null) => value === null ? '—' : value.toLocaleString('ru-RU');

export function WildArchetypesPage({ loadCatalog, loadDecks }: {
  loadCatalog: (signal: AbortSignal) => Promise<unknown>;
  loadDecks: (archetype: string, signal: AbortSignal) => Promise<unknown>;
}) {
  const [catalog, setCatalog] = useState<WildArchetype[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('archetype') ?? '');
  const [decks, setDecks] = useState<WildDeck[]>([]);
  const [decksLoading, setDecksLoading] = useState(false);
  const [decksError, setDecksError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError('');
    loadCatalog(controller.signal)
      .then(readWildArchetypes)
      .then(items => {
        setCatalog(items);
        setSelected(previous => items.some(item => item.nameEn === previous) ? previous : '');
      })
      .catch(error => { if (!controller.signal.aborted) setCatalogError(error instanceof Error ? error.message : 'Не удалось загрузить архетипы'); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [loadCatalog, retry]);

  useEffect(() => {
    if (!selected || !catalog.some(item => item.nameEn === selected)) {
      setDecks([]);
      setDecksError('');
      return;
    }
    const controller = new AbortController();
    setDecksLoading(true);
    setDecksError('');
    loadDecks(selected, controller.signal)
      .then(payload => readWildDecks(payload, selected))
      .then(setDecks)
      .catch(error => { if (!controller.signal.aborted) setDecksError(error instanceof Error ? error.message : 'Не удалось загрузить колоды'); })
      .finally(() => { if (!controller.signal.aborted) setDecksLoading(false); });
    return () => controller.abort();
  }, [catalog, loadDecks, selected, retry]);

  const filtered = useMemo(() => catalog.filter(item =>
    `${item.nameRu} ${item.nameEn} ${item.classLabel}`.toLocaleLowerCase('ru-RU')
      .includes(query.trim().toLocaleLowerCase('ru-RU'))), [catalog, query]);
  const active = catalog.find(item => item.nameEn === selected);
  const choose = (name: string) => {
    setSelected(name);
    const url = new URL(window.location.href);
    if (name) url.searchParams.set('archetype', name);
    else url.searchParams.delete('archetype');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  };

  return <div className="wild-archetypes">
    <header className="wild-archetypes__hero">
      <p className="wild-archetypes__eyebrow">Статистика · Вольный формат</p>
      <h1>Архетипы Вольного формата</h1>
      <p>Выберите архетип, чтобы посмотреть актуальные колоды и открыть код в конструкторе.</p>
      <nav aria-label="Разделы архетипов"><a href="/archetypes/">Стандартные архетипы</a><a href="/deck-builder/">Конструктор колод</a></nav>
    </header>
    <div className="wild-archetypes__layout">
      <section className="wild-archetypes__catalog" aria-labelledby="wild-catalog-title">
        <div className="wild-archetypes__section-heading"><h2 id="wild-catalog-title">Каталог</h2><span>{catalog.length} архетипов</span></div>
        <label className="wild-archetypes__search">Поиск по названию или классу
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Например, маг" />
        </label>
        {catalogLoading && <p role="status">Загрузка архетипов…</p>}
        {catalogError && <div role="alert"><p>{catalogError}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Повторить</button></div>}
        {!catalogLoading && !catalogError && filtered.length === 0 && <p>Архетипы не найдены.</p>}
        <div className="wild-archetypes__items">{filtered.map(item => <button type="button" key={item.nameEn}
          className="wild-archetypes__item" aria-pressed={selected === item.nameEn} onClick={() => choose(item.nameEn)}>
          <span className="wild-archetypes__item-main"><strong>{item.nameRu}</strong><small>{item.classLabel}</small></span>
          <span className="wild-archetypes__item-stat"><strong>{percent(item.winRate)}</strong><small>{number(item.games)} игр</small></span>
        </button>)}</div>
      </section>
      <section className="wild-archetypes__decks" aria-labelledby="wild-decks-title">
        <div className="wild-archetypes__section-heading"><h2 id="wild-decks-title">{active?.nameRu ?? 'Колоды'}</h2>
          {active && <span>{number(active.games)} игр</span>}</div>
        {!selected && <p>Выберите архетип в каталоге.</p>}
        {decksLoading && <p role="status">Загрузка колод…</p>}
        {decksError && <div role="alert"><p>{decksError}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Повторить</button></div>}
        {selected && !decksLoading && !decksError && decks.length === 0 && <p>Пока нет колод для этого архетипа.</p>}
        {!decksLoading && !decksError && decks.map((deck, index) =>
          <article className="wild-archetypes__deck" key={`${deck.deckCode}-${index}`}>
            <div><h3>{deck.title}</h3><p>{percent(deck.winRate)} побед · {number(deck.games)} игр</p></div>
            <a className="wild-archetypes__deck-link" href={`/deck-builder/?code=${encodeURIComponent(deck.deckCode)}`}>Открыть колоду</a>
          </article>)}
      </section>
    </div>
  </div>;
}
