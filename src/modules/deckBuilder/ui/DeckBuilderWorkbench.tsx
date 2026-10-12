import { useState } from 'react';
import { Copy, Download, Minus, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { BUILDER_CLASSES, type BuilderCard, type BuilderClass, type BuilderEntry, type BuilderFormat } from '../model/selection';
import { useDeckBuilder, type DeckBuilderInitial, type DeckBuilderPorts } from '../useDeckBuilder';

export type DeckBuilderWorkbenchProps = { ports: DeckBuilderPorts; initial?: DeckBuilderInitial };
type Editor = ReturnType<typeof useDeckBuilder>;

function GalleryCard({ card, count, disabled, onAdd }: {
  card: BuilderCard; count: number; disabled: boolean; onAdd: () => void;
}) {
  return <button type="button" className={`hp-builder-card${count ? ' is-selected' : ''}`}
    onClick={onAdd} disabled={disabled} aria-label={`Добавить: ${card.name}${count ? `, в колоде ${count}` : ''}`}>
    <img src={card.image} alt="" loading="lazy" decoding="async" width={360} height={497} />
    <span className="hp-builder-card-name sr-only">{card.name}</span>
    <span className="hp-builder-card-action" aria-hidden="true">{count ? `В колоде: ${count}` : <><Plus size={14} /> Добавить</>}</span>
  </button>;
}

function DeckRow({ card, editor }: { card: BuilderEntry; editor: Editor }) {
  const [failed, setFailed] = useState(false);
  return <li className="hp-builder-row">
    <div className="hp-builder-tile">
      {card.tile && !failed ? <img src={card.tile} alt={`${card.cost} маны · ${card.name}`}
        width={320} height={64} loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : <span className="hp-builder-tile-fallback"><b>{card.cost}</b><span>{card.name}</span></span>}
      {card.count > 1 ? <span className="hp-builder-copies" aria-label={`${card.count} копии`}>×{card.count}</span> : null}
    </div>
    <div className="hp-builder-row-controls">
      <button type="button" onClick={() => editor.change(card, -1)} aria-label={`Убрать: ${card.name}`}><Minus size={16} /></button>
      <button type="button" onClick={() => editor.change(card, 1)} disabled={!editor.canAdd(card)} aria-label={`Ещё копия: ${card.name}`}><Plus size={16} /></button>
    </div>
  </li>;
}

function CollectionFilters({ editor }: { editor: Editor }) {
  const { filters, catalog } = editor;
  const advancedCount = ['type', 'rarity', 'mechanic', 'minionType', 'spellSchool', 'pool']
    .filter(key => filters[key as keyof typeof filters]).length;
  const hasFilters = !!(filters.query || filters.mana || filters.pool || filters.set || advancedCount);
  const facetOptions = (kind: 'set' | 'type' | 'minionType' | 'spellSchool', values: string[] = []) =>
    values.map(value => <option key={value} value={value}>{editor.label(kind, value)}</option>);
  return <div className="hp-builder-filters">
    <label className="hp-builder-search"><Search size={18} aria-hidden="true" />
      <input type="search" value={filters.query} maxLength={100} onChange={event => editor.filter('query', event.target.value)}
        placeholder="Поиск по названию или тексту" aria-label="Поиск карт" /></label>
    <div className="hp-builder-mana" role="group" aria-label="Стоимость маны">
      {['', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'].map(value =>
        <button key={value} type="button" aria-label={value ? `Мана: ${value}` : 'Любая мана'}
          aria-pressed={filters.mana === value} onClick={() => editor.filter('mana', filters.mana === value ? '' : value)}>
          {value || 'Все'}</button>)}
    </div>
    <div className="hp-builder-filter-toolbar">
      <label>Дополнение<select value={filters.set} onChange={event => editor.filter('set', event.target.value)}>
        <option value="">Все дополнения</option>{facetOptions('set', catalog.facets?.sets)}</select></label>
    <div className="hp-builder-sort">
      <label>Сортировка<select value={filters.sort} onChange={event => editor.filter('sort', event.target.value)}>
        <option value="mana">По мане</option><option value="set">По дополнению</option><option value="name">По названию</option>
        <option value="attack">По атаке</option><option value="health">По здоровью</option>
        <option value="class">По классу</option><option value="mechanics">По механикам</option></select></label>
      <button type="button" aria-label={filters.direction === 'desc' ? 'Порядок: по убыванию' : 'Порядок: по возрастанию'}
        onClick={() => editor.filter('direction', filters.direction === 'desc' ? 'asc' : 'desc')}>
        <span aria-hidden="true">{filters.direction === 'desc' ? '↓' : '↑'}</span></button>
      {hasFilters ? <button className="hp-builder-clear-filters" type="button" onClick={editor.resetFilters}><X size={16} />Сбросить</button> : null}
    </div>
    </div>
    <details className="hp-builder-extra-filters">
      <summary><SlidersHorizontal size={16} aria-hidden="true" />Ещё фильтры{advancedCount ? ` · ${advancedCount}` : ''}</summary>
      <div className="hp-builder-filter-selects">
        <label>Тип карты<select value={filters.type} onChange={event => editor.filter('type', event.target.value)}>
          <option value="">Все типы</option>{facetOptions('type', catalog.facets?.types)}</select></label>
        <label>Редкость<select value={filters.rarity} onChange={event => editor.filter('rarity', event.target.value)}>
          <option value="">Любая</option><option value="COMMON">Обычная</option><option value="RARE">Редкая</option>
          <option value="EPIC">Эпическая</option><option value="LEGENDARY">Легендарная</option></select></label>
        <label>Механика<select value={filters.mechanic} onChange={event => editor.filter('mechanic', event.target.value)}>
          <option value="">Все механики</option>{catalog.facets?.mechanics.map(value =>
            <option key={value} value={value}>{catalog.mechanicTranslations?.[value] || value}</option>)}</select></label>
        <label>Тип существа<select value={filters.minionType} onChange={event => editor.filter('minionType', event.target.value)}>
          <option value="">Все существа</option>{facetOptions('minionType', catalog.facets?.minionTypes)}</select></label>
        <label>Школа магии<select value={filters.spellSchool} onChange={event => editor.filter('spellSchool', event.target.value)}>
          <option value="">Все школы</option>{facetOptions('spellSchool', catalog.facets?.spellSchools)}</select></label>
        <label>Карты<select value={filters.pool} onChange={event => editor.filter('pool', event.target.value)}>
          <option value="">Класс + нейтральные</option><option value="class">Только класс</option><option value="neutral">Нейтральные</option></select></label>
      </div>
    </details>
  </div>;
}

function CardGallery({ editor }: { editor: Editor }) {
  const { filters } = editor;
  return <section className="hp-builder-gallery" aria-labelledby="hp-builder-gallery-title">
    <div className="hp-builder-section-heading"><h2 id="hp-builder-gallery-title">Карты</h2>
      <span>{editor.loading ? 'Загрузка…' : `${editor.catalog.total} в коллекции`}</span></div>
    <CollectionFilters editor={editor} />
    {editor.error ? <div className="hp-builder-message" role="alert"><p>{editor.error}</p><button type="button" onClick={editor.retry}>Повторить загрузку</button></div>
      : editor.loading ? <div className="hp-builder-skeletons" role="status" aria-label="Загрузка карт">
        {Array.from({ length: 12 }, (_, i) => <div key={i} />)}</div>
      : editor.catalog.cards.length ? <div className="hp-builder-card-grid">
        {editor.catalog.cards.map(card => <GalleryCard key={card.dbfId} card={card}
          count={editor.deck.find(entry => entry.dbfId === card.dbfId)?.count ?? 0} disabled={!editor.canAdd(card)}
          onAdd={() => editor.change(card, 1)} />)}</div>
      : <div className="hp-builder-message"><h3>Карты не найдены</h3><p>Измените поиск или фильтры.</p></div>}
    {!editor.loading && !editor.error && editor.catalog.totalPages > 1 ? <nav className="hp-builder-pagination" aria-label="Страницы карт">
      <button type="button" disabled={filters.page <= 1} onClick={() => editor.filter('page', filters.page - 1)}>Назад</button>
      <span>{filters.page} / {editor.catalog.totalPages}</span>
      <button type="button" disabled={filters.page >= editor.catalog.totalPages} onClick={() => editor.filter('page', filters.page + 1)}>Далее</button>
    </nav> : null}
  </section>;
}

function SelectedDeck({ editor }: { editor: Editor }) {
  const selectedClass = BUILDER_CLASSES.find(hero => hero.id === editor.filters.heroClass) ?? BUILDER_CLASSES[4];
  const sorted = [...editor.deck].sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, 'ru'));
  return <aside className="hp-builder-deck" aria-labelledby="hp-builder-deck-title">
    <div className="hp-builder-deck-header"><img src={`/class_icon/ui/${selectedClass.icon}-64.webp`} alt="" width={64} height={64} />
      <div><h2 id="hp-builder-deck-title">Ваша колода</h2><span>{selectedClass.label} · {editor.filters.format === 'standard' ? 'Стандарт' : 'Вольный'}</span></div>
      <strong className={editor.count > editor.limit ? 'is-overfull' : ''} aria-label={`Карт в колоде: ${editor.count} из ${editor.limit}`}>{editor.count}<small>/{editor.limit}</small></strong></div>
    <label className="hp-builder-deck-name">Название колоды<input value={editor.name} maxLength={100} onChange={event => editor.setName(event.target.value)} /></label>
    <p className="hp-builder-progress" role="status">{editor.count === editor.limit ? 'Все карты на месте' : editor.count > editor.limit
      ? `Уберите ${editor.count - editor.limit} лишних карт` : `Добавьте ещё ${editor.limit - editor.count} карт`}</p>
    {sorted.length ? <ul className="hp-builder-deck-list">{sorted.map(card => <DeckRow key={card.dbfId} card={card} editor={editor} />)}</ul>
      : <div className="hp-builder-empty"><Plus size={28} aria-hidden="true" /><strong>Начните с любимой карты</strong><p>Нажмите на карту в коллекции — она появится здесь.</p></div>}
    <div className="hp-builder-deck-actions">
      <button className="hp-builder-save" type="button" onClick={() => { void editor.saveImage(); }}
        disabled={!editor.count || editor.count > editor.limit || editor.exporting}>
        <Download size={18} />{editor.exporting ? 'Собираем картинку…' : 'Сохранить картинку'}</button>
      <div className="hp-builder-secondary-actions"><button type="button" onClick={() => { void editor.copyCode(); }} disabled={!editor.count}><Copy size={15} />Код колоды</button>
        <button type="button" onClick={editor.clear} disabled={!editor.count}><Trash2 size={15} />Очистить</button></div>
      {editor.notice ? <p className="hp-builder-feedback" role="status">{editor.notice}</p> : null}
      {editor.exportError ? <p className="hp-builder-feedback is-error" role="alert">{editor.exportError}</p> : null}
      {editor.count ? <details className="hp-builder-code"><summary>Показать код колоды</summary><textarea readOnly value={editor.code} aria-label="Код колоды для Hearthstone" /></details> : null}
    </div>
  </aside>;
}

export function DeckBuilderWorkbench({ ports, initial }: DeckBuilderWorkbenchProps) {
  const editor = useDeckBuilder(ports, initial);
  const [panel, setPanel] = useState<'cards' | 'deck'>('cards');
  return <div className="hp-builder" data-panel={panel}>
    <header className="hp-builder-heading"><h1>Конструктор колод</h1>
      <p>Выбирайте карты и сохраняйте колоду одной картинкой.</p></header>
    <div className="hp-builder-context">
      <label>Класс<select value={editor.filters.heroClass} onChange={event => editor.context(event.target.value as BuilderClass, editor.filters.format)}>
        {BUILDER_CLASSES.map(hero => <option key={hero.id} value={hero.id}>{hero.label}</option>)}</select></label>
      <label>Формат<select value={editor.filters.format} onChange={event => editor.context(editor.filters.heroClass, event.target.value as BuilderFormat)}>
        <option value="standard">Стандарт</option><option value="wild">Вольный</option></select></label>
      <a href="/standard/cards/">Открыть библиотеку карт ↗</a>
    </div>
    {editor.pending ? <div className="hp-builder-reset" role="alert"><div><strong>{editor.pending === 'clear' ? 'Очистить колоду?' : 'Начать новую колоду?'}</strong>
      <p>{editor.pending === 'clear' ? 'Все выбранные карты будут удалены.' : 'При смене класса или формата выбранные карты будут удалены.'}</p></div>
      <button type="button" onClick={editor.confirmReset}>Да, начать заново</button><button type="button" onClick={editor.cancelReset}>Оставить колоду</button></div> : null}
    <div className="hp-builder-mobile-switch" role="group" aria-label="Панель конструктора">
      <button type="button" aria-pressed={panel === 'cards'} onClick={() => setPanel('cards')}>Карты</button>
      <button type="button" aria-pressed={panel === 'deck'} onClick={() => setPanel('deck')}>Колода · {editor.count}/{editor.limit}</button></div>
    <div className="hp-builder-workspace"><CardGallery editor={editor} /><SelectedDeck editor={editor} /></div>
  </div>;
}
