import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import '../vendor/varylo-ui/styles/index.css';
import '../shared/ui/varyloParchment.css';
import { Combobox } from '../vendor/varylo-ui/forms/Combobox';
import type { SelectOptionGroup } from '../vendor/varylo-ui/forms/Listbox';
import { PortalContainerContext } from '../vendor/varylo-ui/primitives/Portal';
import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import {
  matchupMinSample, standardMatchupArchetypes, standardMatchupOverview,
  type StandardMatchupArchetype, type StandardMatchupGroup, type StandardMatchupOpponent, type StandardMatchupOverview,
  type StandardMatchupsData,
} from '../modules/standardMatchups/public';
import { archetypeClassBackdrop } from './archetypeDetailModel';
import { STANDARD_META_CLASS_LABELS } from './standardMetaClassModel';
import { CONFIDENCE_TEXT, ClassIcon, MatchupBar, matchupSide, percent } from './StandardMatchupsVisuals';
import './StandardMatchupsOverview.css';
import { useListTransition } from '../components/transitions/useListTransition';

/** Rows per group while the list is collapsed: the best favoured, the worst unfavoured. */
const COLLAPSED_PER_GROUP = 5;
const POPULAR_CHIPS = 6;

const GROUPS: Array<{ id: StandardMatchupGroup; title: string; hint: string }> = [
  { id: 'strong', title: 'Хорошие', hint: '52% и выше' },
  { id: 'even', title: 'Ровные', hint: '48–52%' },
  { id: 'weak', title: 'Сложные', hint: 'ниже 48%' },
];
type Filter = 'all' | StandardMatchupGroup;

export type StandardMatchupsOverviewProps = {
  /** The dataset without the source's "Other" rows and columns. */
  data: StandardMatchupsData;
  labelOf: (name: string, label?: string) => string;
  selected: string;
  onSelectedChange: (archetype: string) => void;
};

function archetypeHref(format: string, slug: string | null): string | null {
  return slug ? canonicalPagePath(`/standard/archetypes/${format}/${slug}`) : null;
}

function classPhrase(classKey: string): string {
  return STANDARD_META_CLASS_LABELS[classKey as keyof typeof STANDARD_META_CLASS_LABELS] ?? classKey;
}

/**
 * One archetype against the field: a header with the class art, a one-line
 * summary and the average against each class, then every published pair as a
 * bar from 50%, grouped into favoured, even and unfavoured. HSGuru publishes no
 * game count per pair, so a pair's reliability comes from both archetypes'
 * shares of games (`model/matrix.ts`), and unreliable pairs are muted.
 */
export default function StandardMatchupsOverview({ data, labelOf, selected, onSelectedChange }: StandardMatchupsOverviewProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const query = useDeferredValue(search.trim().toLocaleLowerCase('ru-RU'));
  const archetypes = useMemo(() => standardMatchupArchetypes(data, labelOf), [data, labelOf]);
  const overview = useMemo(() => standardMatchupOverview(data, selected, labelOf), [data, selected, labelOf]);
  const minSample = matchupMinSample(data.sourceUrl);
  const popular = useMemo(() => [...archetypes].sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).slice(0, POPULAR_CHIPS), [archetypes]);
  const options = useMemo<SelectOptionGroup[]>(() => {
    const groups = new Map<string, SelectOptionGroup>();
    for (const archetype of [...archetypes].sort((a, b) => (b.share ?? 0) - (a.share ?? 0))) {
      const label = archetype.classKey ? classPhrase(archetype.classKey) : 'Без класса';
      const group = groups.get(label) ?? { label, options: [] };
      groups.set(label, group);
      group.options.push({
        value: archetype.id,
        label: archetype.label,
        description: `${percent(archetype.winrate)} против меты${archetype.share !== undefined ? ` · доля ${percent(archetype.share)}` : ''}`,
        icon: <ClassIcon classKey={archetype.classKey} size={20} />,
      });
    }
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  }, [archetypes]);

  // A strength filter, a search or another archetype: groups that stay glide, groups that return enter.
  const rowsRef = useListTransition<HTMLOListElement>(`${filter}|${query}|${expanded}|${selected}`);

  if (!overview) return null;
  const { archetype, opponents } = overview;
  const href = archetypeHref(data.format, archetype.slug);
  const counts = { strong: 0, even: 0, weak: 0 };
  for (const opponent of opponents) counts[opponent.group] += 1;
  const matching = opponents.filter(opponent => (filter === 'all' || opponent.group === filter)
    && (!query || `${opponent.label} ${opponent.id}`.toLocaleLowerCase('ru-RU').includes(query)));
  const collapsible = filter === 'all' && !query && matching.length > COLLAPSED_PER_GROUP * GROUPS.length;
  const groups = GROUPS.map(group => {
    const items = matching.filter(opponent => opponent.group === group.id);
    const shown = !collapsible || expanded || items.length <= COLLAPSED_PER_GROUP ? items
      : group.id === 'weak' ? items.slice(-COLLAPSED_PER_GROUP) : items.slice(0, COLLAPSED_PER_GROUP);
    return { ...group, items, shown };
  }).filter(group => group.items.length > 0);
  const hidden = groups.reduce((sum, group) => sum + group.items.length - group.shown.length, 0);

  return (
    <div className="standard-matchups-overview hp-varylo-parchment">
      <PortalContainerContext.Provider value={layer}>
        <OverviewHero archetype={archetype} counts={counts} href={href} options={options} popular={popular}
          onPick={id => { onSelectedChange(id); setExpanded(false); }} />
        <OverviewSummary overview={overview} />

        <section className="standard-matchups-overview__list" aria-label={`${archetype.label} против соперников`}>
          <div className="standard-matchups-overview__tools">
            <label className="standard-matchups__search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Найти соперника</span>
              <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Найти соперника" />
            </label>
            <div className="standard-matchups__filter-chips" role="group" aria-label="Сила матчапа">
              {([['all', 'Все', opponents.length], ...GROUPS.map(group => [group.id, group.title, counts[group.id]] as const)] as const)
                .map(([id, label, count]) => (
                  <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                    {label}<span>{count}</span>
                  </button>
                ))}
            </div>
          </div>

          {groups.length ? (
            <ol className="standard-matchups-overview__rows" ref={rowsRef}>
              {groups.map(group => (
                <li key={group.id} className="standard-matchups-overview__group" data-group={group.id}>
                  <h4>{group.title} <span>{group.hint} · {group.items.length}</span></h4>
                  <ol>
                    {group.shown.map(opponent => <OpponentRow key={opponent.id} opponent={opponent} format={data.format} />)}
                  </ol>
                </li>
              ))}
            </ol>
          ) : <p className="standard-matchups-overview__empty">По этому фильтру соперников нет.</p>}
          {collapsible && (hidden > 0 || expanded) && (
            <button type="button" className="standard-matchups-overview__more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
              {expanded ? 'Свернуть' : `Показать все ${matching.length}`}
            </button>
          )}
          <p className="standard-matchups-overview__note">
            Полоса отсчитана от 50%. HSGuru не публикует число игр по паре{minSample ? ` и показывает пары от ${minSample} игр` : ''}:
            надёжность оценена по долям игр обоих архетипов, пары с малой выборкой бледнее.
          </p>
        </section>
      </PortalContainerContext.Provider>
      <div ref={setLayer} className="standard-matchups-overview__layer" />
    </div>
  );
}

function OpponentRow({ opponent, format }: { opponent: StandardMatchupOpponent; format: string }) {
  const href = archetypeHref(format, opponent.slug);
  return (
    <li className="standard-matchups-overview__row" data-confidence={opponent.confidence}>
      <ClassIcon classKey={opponent.classKey} size={30} />
      <span className="standard-matchups-overview__name">
        {href ? <a href={href}>{opponent.label}</a> : opponent.label}
        <small>доля {percent(opponent.share)} · {CONFIDENCE_TEXT[opponent.confidence]}</small>
      </span>
      <MatchupBar value={opponent.vs} />
      <strong className="standard-matchups-overview__rate" data-side={matchupSide(opponent.vs)}>{percent(opponent.vs)}</strong>
    </li>
  );
}

function OverviewHero({ archetype, counts, href, options, popular, onPick }: {
  archetype: StandardMatchupArchetype;
  counts: Record<StandardMatchupGroup, number>;
  href: string | null;
  options: SelectOptionGroup[];
  popular: StandardMatchupArchetype[];
  onPick: (archetype: string) => void;
}) {
  const backdrop = archetypeClassBackdrop(archetype.classKey);
  return (
    <header className="standard-matchups-overview__hero" data-class={archetype.classKey ?? undefined}>
      {backdrop && (
        <img className="standard-matchups-overview__backdrop" src={backdrop.src} srcSet={backdrop.srcSet} sizes="(max-width: 640px) 100vw, 1200px"
          alt="" decoding="async" style={{ objectPosition: backdrop.focus }} />
      )}
      <div className="standard-matchups-overview__identity">
        <ClassIcon classKey={archetype.classKey} size={64} />
        <div>
          <p className="standard-matchups-overview__eyebrow">Ваш архетип</p>
          <h3>{archetype.label}</h3>
          {archetype.label !== archetype.id && <p className="standard-matchups-overview__english">{archetype.id}</p>}
        </div>
      </div>
      <dl className="standard-matchups-overview__stats">
        <div><dt>Против меты</dt><dd data-side={archetype.winrate === null ? undefined : matchupSide(archetype.winrate)}>{percent(archetype.winrate)}</dd></div>
        <div><dt>Доля игр</dt><dd>{percent(archetype.share)}</dd></div>
        <div><dt>Соперники</dt><dd>{counts.strong} · {counts.even} · {counts.weak}<small>хорошие · ровные · сложные</small></dd></div>
      </dl>
      {href && (
        <a className="standard-matchups-overview__archetype-link" href={href}>
          Страница архетипа <ArrowRight size={16} aria-hidden="true" />
        </a>
      )}
      <div className="standard-matchups-overview__picker" id="matchups-picker" data-tour-id="matchups-picker">
        <label className="standard-matchups-overview__picker-label" htmlFor="matchups-archetype">Архетип</label>
        <Combobox id="matchups-archetype" options={options} value={archetype.id} size="md"
          onValueChange={value => { if (value) onPick(value); }}
          // A click into the filled field starts a new search instead of appending to the name.
          onFocus={event => event.currentTarget.select()}
          placeholder="Найдите архетип" emptyText="Такого архетипа нет в матчапах"
          leftIcon={<ClassIcon classKey={archetype.classKey} size={20} />} />
        <div className="standard-matchups-overview__chips" role="group" aria-label="Популярные архетипы">
          {popular.map(item => (
            <button key={item.id} type="button" aria-pressed={item.id === archetype.id}
              onClick={() => onPick(item.id)}>
              <ClassIcon classKey={item.classKey} size={18} />{item.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function OverviewSummary({ overview: { best, worst, classes } }: { overview: StandardMatchupOverview }) {
  const bestClass = classes[0];
  const worstClass = classes.length > 1 ? classes[classes.length - 1] : null;
  return (
    <section className="standard-matchups-overview__summary" aria-label="Коротко">
      <p>
        {best && <>Лучше всего против <strong>{best.label}</strong> ({percent(best.vs)})</>}
        {worst && <>, хуже всего против <strong>{worst.label}</strong> ({percent(worst.vs)})</>}
        {bestClass && <>. Против класса «{classPhrase(bestClass.classKey)}» в среднем <strong>{percent(bestClass.winrate)}</strong></>}
        {worstClass && <>, против класса «{classPhrase(worstClass.classKey)}» — <strong>{percent(worstClass.winrate)}</strong></>}
        .
      </p>
      <ul className="standard-matchups-overview__classes" aria-label="Средний винрейт против классов">
        {classes.map(item => (
          <li key={item.classKey} data-side={matchupSide(item.winrate)} title={`${classPhrase(item.classKey)}: ${percent(item.winrate)}, архетипов ${item.opponents}`}>
            <ClassIcon classKey={item.classKey} size={30} />
            <span className="sr-only">{classPhrase(item.classKey)}</span>
            <strong>{percent(item.winrate, 0)}</strong>
            <MatchupBar value={item.winrate} />
          </li>
        ))}
      </ul>
    </section>
  );
}
