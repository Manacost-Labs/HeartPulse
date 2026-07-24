import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type {
  BattlegroundHeroMmr,
  BattlegroundHeroMode,
  BattlegroundHeroSortDirection,
  BattlegroundHeroSortKey,
  BattlegroundHeroTierEntry,
  BattlegroundHeroTierSection,
} from './Battlegrounds';

const TIER_ORDER = ['S', 'A', 'B', 'C', 'D'];
type CompositionMap = Record<string, string>;
type CompositionReference = {
  byHero: CompositionMap;
  byId: CompositionMap;
};
let compositionReferenceCache: CompositionReference | null = null;
let compositionReferenceRequest: Promise<CompositionReference> | null = null;

function metricNumber(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value || '').replace(',', '.').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function plainText(value: unknown): string {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function heroCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const noun = mod10 === 1 && mod100 !== 11
    ? 'герой'
    : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'героя' : 'героев');
  return `${count} ${noun}`;
}

async function loadCompositionReference(): Promise<CompositionReference> {
  if (compositionReferenceCache) return compositionReferenceCache;
  if (compositionReferenceRequest) return compositionReferenceRequest;

  const params = new URLSearchParams({ mode: 'solo', mmr: 'TOP_50_PERCENT' });
  compositionReferenceRequest = fetch(`/api/bg/heroes/compositions?${params.toString()}`)
    .then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'Составы временно недоступны');
      }
      const result = {
        byHero: payload?.compositions && typeof payload.compositions === 'object'
          ? payload.compositions as CompositionMap
          : {},
        byId: payload?.composition_names && typeof payload.composition_names === 'object'
          ? payload.composition_names as CompositionMap
          : {},
      };
      compositionReferenceCache = result;
      return result;
    })
    .finally(() => {
      compositionReferenceRequest = null;
    });

  return compositionReferenceRequest;
}

function PlacementDistribution({ values }: { values?: string[] }) {
  const points = useMemo(() => (values || []).map(value => metricNumber(value) || 0), [values]);
  const maximum = Math.max(...points, 1);
  const strongestIndex = Math.max(0, points.indexOf(Math.max(...points)));
  const [activeIndex, setActiveIndex] = useState(strongestIndex);

  useEffect(() => setActiveIndex(strongestIndex), [strongestIndex, values]);

  if (!points.length) return <span className="bg-hero-ledger__empty">—</span>;
  return (
    <div className="bg-hero-distribution" aria-label={`Распределение мест: ${values?.join(', ')}`}>
      <div className="bg-hero-distribution__plot">
        {points.map((value, index) => (
          <button
            key={`${index}-${value}`}
            type="button"
            className="bg-hero-distribution__place"
            aria-label={`${index + 1} место: ${values?.[index] || '—'}`}
            aria-pressed={activeIndex === index}
            onPointerEnter={() => setActiveIndex(index)}
            onFocus={() => setActiveIndex(index)}
            onClick={() => setActiveIndex(index)}
          >
            <span style={{ height: `${Math.max(10, (value / maximum) * 100)}%` }} />
            <small>{index + 1}</small>
          </button>
        ))}
      </div>
      <output className="bg-hero-distribution__value" aria-live="polite">
        <strong>{activeIndex + 1}</strong> место · {values?.[activeIndex] || '—'}
      </output>
    </div>
  );
}

function SortButton({
  field,
  label,
  sortKey,
  sortDirection,
  onSort,
}: {
  field: BattlegroundHeroSortKey;
  label: string;
  sortKey: BattlegroundHeroSortKey;
  sortDirection: BattlegroundHeroSortDirection;
  onSort: (field: BattlegroundHeroSortKey) => void;
}) {
  const active = sortKey === field;
  const SortIcon = active ? (sortDirection === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      className="bg-hero-ledger__sort-button"
      data-active={active ? 'true' : 'false'}
      onClick={() => onSort(field)}
      title={`${label}: изменить сортировку`}
    >
      <span>{label}</span>
      <SortIcon aria-hidden="true" />
    </button>
  );
}

function LedgerRow({
  hero,
  tier,
  composition,
  compositionsLoading,
  onNavigate,
  flat = false,
}: {
  hero: BattlegroundHeroTierEntry;
  tier: string;
  composition?: string;
  compositionsLoading: boolean;
  onNavigate: (path: string) => void;
  flat?: boolean;
}) {
  const href = hero.dbfId ? `/heroes/${hero.dbfId}` : '/heroes';
  const pickRate = metricNumber(hero.popularity);
  const averagePlace = metricNumber(hero.averagePlace);
  const heroPowerText = plainText(hero.heroPower?.text);
  return (
    <div className={`bg-hero-ledger__row${flat ? ' bg-hero-ledger__row--flat' : ''}`} role="row">
      {flat && (
        <div className={`bg-hero-ledger__tier-cell bg-hero-ledger__tier-mark--${tier.toLowerCase()}`} role="cell">
          <span className="bg-hero-ledger__tier-emblem"><strong>{tier}</strong></span>
        </div>
      )}
      <div className="bg-hero-ledger__hero" role="cell">
        <a
          href={href}
          onClick={event => {
            if (!hero.dbfId) return;
            event.preventDefault();
            onNavigate(href);
          }}
        >
          <img src={hero.image} alt="" loading="lazy" decoding="async" />
          <span>
            <strong>{hero.name}</strong>
            {hero.originalName && <small>{hero.originalName}</small>}
            {hero.heroPower && (
              <span className="bg-hero-ledger__power">
                <b>{hero.heroPower.name}</b>
                {heroPowerText && <small>{heroPowerText}</small>}
              </span>
            )}
          </span>
        </a>
      </div>
      <div className="bg-hero-ledger__metric bg-hero-ledger__metric--pick" role="cell">
        <small>Частота выбора</small>
        <strong>{hero.popularity || '—'}</strong>
        <span aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, pickRate || 0))}%` }} /></span>
      </div>
      <div className="bg-hero-ledger__composition" role="cell">
        <small>Лучший состав</small>
        <strong>
          <span
            className={`bg-hero-ledger__composition-value${
              composition ? '' : ` bg-hero-ledger__composition-value--${compositionsLoading ? 'pending' : 'empty'}`
            }`}
          >
            {composition || (compositionsLoading ? '…' : 'Нет данных')}
          </span>
        </strong>
      </div>
      <div className="bg-hero-ledger__metric bg-hero-ledger__metric--placement" role="cell">
        <small>Среднее место</small>
        <strong>{hero.averagePlace || '—'}</strong>
        <span aria-hidden="true"><i style={{ width: `${averagePlace ? Math.max(8, 100 - ((averagePlace - 1) / 7) * 100) : 0}%` }} /></span>
      </div>
      <div className="bg-hero-ledger__distribution" role="cell">
        <small>Распределение мест</small>
        <PlacementDistribution values={hero.placementDistribution} />
      </div>
    </div>
  );
}

export default function BattlegroundHeroLedger({
  sections,
  sortKey,
  sortDirection,
  onSort,
  onNavigate,
}: {
  sections: BattlegroundHeroTierSection[];
  mode: BattlegroundHeroMode;
  mmr: BattlegroundHeroMmr;
  sortKey: BattlegroundHeroSortKey;
  sortDirection: BattlegroundHeroSortDirection;
  onSort: (field: BattlegroundHeroSortKey) => void;
  onNavigate: (path: string) => void;
}) {
  const orderedSections = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return sections
      .map(section => ({
        ...section,
        heroes: [...section.heroes].sort((a, b) => (
          (metricNumber(a.averagePlace) ?? Number.POSITIVE_INFINITY)
          - (metricNumber(b.averagePlace) ?? Number.POSITIVE_INFINITY)
          || a.name.localeCompare(b.name, 'ru')
        )),
      }))
      .sort((a, b) => direction * (TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)));
  }, [sections, sortDirection]);
  const sortedEntries = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return sections
      .flatMap(section => section.heroes.map(hero => ({ hero, tier: section.tier })))
      .sort((a, b) => {
        const aValue = metricNumber(sortKey === 'pickRate' ? a.hero.popularity : a.hero.averagePlace);
        const bValue = metricNumber(sortKey === 'pickRate' ? b.hero.popularity : b.hero.averagePlace);
        if (aValue === null && bValue !== null) return 1;
        if (aValue !== null && bValue === null) return -1;
        if (aValue !== null && bValue !== null && aValue !== bValue) return direction * (aValue - bValue);
        return a.hero.name.localeCompare(b.hero.name, 'ru');
      });
  }, [sections, sortDirection, sortKey]);
  const ariaSort = (field: BattlegroundHeroSortKey): 'ascending' | 'descending' | 'none' => (
    sortKey === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'
  );
  const [compositionReference, setCompositionReference] = useState<CompositionReference>(
    compositionReferenceCache || { byHero: {}, byId: {} },
  );
  const [compositionsLoading, setCompositionsLoading] = useState(!compositionReferenceCache);

  useEffect(() => {
    if (compositionReferenceCache) {
      setCompositionReference(compositionReferenceCache);
      setCompositionsLoading(false);
      return;
    }

    let alive = true;
    setCompositionsLoading(true);
    void loadCompositionReference()
      .then(result => {
        if (alive) setCompositionReference(result);
      })
      .catch(() => {
        if (alive) setCompositionReference({ byHero: {}, byId: {} });
      })
      .finally(() => {
        if (alive) setCompositionsLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const compositionFor = (hero: BattlegroundHeroTierEntry) => (
    hero.bestComposition
    || (hero.bestCompositionId ? compositionReference.byId[String(hero.bestCompositionId)] : '')
    || (hero.dbfId ? compositionReference.byHero[String(hero.dbfId)] : '')
    || ''
  );

  return (
    <div className="bg-hero-ledger" role="table" aria-label="Таблица героев Полей сражений">
      <div className="bg-hero-ledger__mobile-sort" aria-label="Сортировка таблицы">
        <SortButton field="tier" label="Тир" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
        <SortButton field="pickRate" label="Выбор" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
        <SortButton field="averagePlace" label="Место" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
      </div>
      <div className="bg-hero-ledger__header" role="row">
        <span role="columnheader" aria-sort={ariaSort('tier')}>
          <SortButton field="tier" label="Тир" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
        </span>
        <span role="columnheader">Герой</span>
        <span role="columnheader" aria-sort={ariaSort('pickRate')}>
          <SortButton field="pickRate" label="Частота выбора" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
        </span>
        <span role="columnheader">Лучший состав</span>
        <span role="columnheader" aria-sort={ariaSort('averagePlace')}>
          <SortButton field="averagePlace" label="Среднее место" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
        </span>
        <span role="columnheader">Распределение мест</span>
      </div>
      {sortKey === 'tier'
        ? orderedSections.map(section => (
            <section key={section.tier} className="bg-hero-ledger__tier" role="rowgroup" aria-label={`Тир ${section.tier}`}>
              <div className={`bg-hero-ledger__tier-mark bg-hero-ledger__tier-mark--${section.tier.toLowerCase()}`} role="rowheader">
                <span className="bg-hero-ledger__tier-emblem"><strong>{section.tier}</strong></span>
                <span className="bg-hero-ledger__tier-count">{heroCountLabel(section.heroes.length)}</span>
              </div>
              <div className="bg-hero-ledger__rows">
                {section.heroes.map(hero => (
                  <React.Fragment key={`${section.tier}-${hero.dbfId || hero.name}`}>
                    <LedgerRow
                      hero={hero}
                      tier={section.tier}
                      composition={compositionFor(hero)}
                      compositionsLoading={compositionsLoading}
                      onNavigate={onNavigate}
                    />
                  </React.Fragment>
                ))}
              </div>
            </section>
          ))
        : (
            <div className="bg-hero-ledger__flat" role="rowgroup">
              {sortedEntries.map(({ hero, tier }) => (
                <React.Fragment key={`${tier}-${hero.dbfId || hero.name}`}>
                  <LedgerRow
                    hero={hero}
                    tier={tier}
                    composition={compositionFor(hero)}
                    compositionsLoading={compositionsLoading}
                    onNavigate={onNavigate}
                    flat
                  />
                </React.Fragment>
              ))}
            </div>
          )}
    </div>
  );
}
