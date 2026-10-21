import { useEffect, useMemo, useState } from 'react';
import { Swords } from 'lucide-react';
import { MetricComparison, type ComparisonMetric } from '../vendor/valyro-ui/charts/MetricComparison';
import { Combobox } from '../vendor/valyro-ui/forms/Combobox';
import type { SelectItem } from '../vendor/valyro-ui/forms/Listbox';
import { PortalContainerContext } from '../vendor/valyro-ui/primitives/Portal';
import { useStandardMatchups } from '../modules/standardMatchups/public';
import { classIconUrl, useNeutralClassIcon } from './classIcons';
import {
  formatProfileValue, matchupBetween, profileComparison, profileSummary,
} from './archetypeComparisonModel';
import '../vendor/varylo-ui/styles/index.css';
import '../shared/ui/varyloParchment.css';
import './archetypeVaryloTheme.css';
import './ArchetypeComparisons.css';

export type ProfileItem = Parameters<typeof profileComparison>[0] & { archetype: string; classKey: string | null; games: number; format: 'standard' | 'wild' };
type Rows = ReturnType<typeof profileComparison>;
type MatchupState = Parameters<typeof matchupBetween>[0] | 'loading' | 'unavailable';

/**
 * The subscriber's HSGuru matchup table of the archetype's format, read through the matchups
 * module (same access as this page). Its hook starts on Standard, so a Wild page switches the
 * format before enabling the read instead of fetching Standard first.
 */
function useFormatMatchups(viewerId: string | undefined, format: 'standard' | 'wild'): MatchupState {
  const [switched, setSwitched] = useState<'standard' | 'wild'>('standard');
  const matchups = useStandardMatchups(viewerId, Boolean(viewerId) && switched === format);
  const { changeFormat } = matchups;
  useEffect(() => { changeFormat(format); setSwitched(format); }, [changeFormat, format]);
  if (!viewerId) return 'unavailable';
  if (matchups.format !== format || matchups.loading) return 'loading';
  return matchups.state.data ?? (matchups.error ? 'unavailable' : 'loading');
}

const CLASS_NAMES: Record<string, string> = {
  deathknight: 'Рыцарь смерти', demonhunter: 'Охотник на демонов', druid: 'Друид', hunter: 'Охотник', mage: 'Маг',
  paladin: 'Паладин', priest: 'Жрец', rogue: 'Разбойник', shaman: 'Шаман', warlock: 'Чернокнижник', warrior: 'Воин',
};
const percent = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;

function ClassIcon({ classKey, size = 20 }: { classKey: string | null; size?: number }) {
  return <img className="profile-class-icon" src={classIconUrl(classKey)} alt="" width={size} height={size} loading="lazy"
    onError={event => useNeutralClassIcon(event.currentTarget)} />;
}

/** Opponents grouped by class, each with its icon and its winrate and sample as the description. */
function opponentOptions(others: readonly ProfileItem[]): SelectItem[] {
  const groups = new Map<string, ProfileItem[]>();
  for (const entry of others) {
    const key = entry.classKey ?? '';
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups].sort(([a], [b]) => (CLASS_NAMES[a] ?? 'Я').localeCompare(CLASS_NAMES[b] ?? 'Я', 'ru')).map(([classKey, entries]) => ({
    label: CLASS_NAMES[classKey] ?? 'Без класса',
    options: entries.map(entry => ({
      value: entry.slug,
      label: entry.archetypeLabel,
      icon: <ClassIcon classKey={entry.classKey} />,
      description: `${entry.winrate === null ? '—' : percent(entry.winrate)} · ${entry.games.toLocaleString('ru-RU')} игр`,
    })),
  }));
}

const VIEW = { width: 600, height: 450, cx: 300, cy: 232, radius: 138 };
const angle = (index: number, total: number) => (index / total) * Math.PI * 2 - Math.PI / 2;
const point = (index: number, total: number, ratio: number) => [
  VIEW.cx + Math.cos(angle(index, total)) * VIEW.radius * ratio,
  VIEW.cy + Math.sin(angle(index, total)) * VIEW.radius * ratio,
] as const;

/**
 * The format percentile on each axis, with the real values of both archetypes printed under
 * the axis name. Every number is also in the table beside it, so the drawing is decorative.
 */
function ProfileRadar({ rows }: { rows: Rows }) {
  const total = rows.length;
  const polygon = (key: 'minePercentile' | 'theirPercentile') => rows
    .map((row, index) => point(index, total, (row[key] ?? 0) / 100).join(',')).join(' ');
  return <svg className="profile-radar" viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="presentation" aria-hidden="true">
    {[0.25, 0.5, 0.75, 1].map(level => <polygon key={level} className="profile-radar__ring" data-outer={level === 1 || undefined}
      points={rows.map((_, index) => point(index, total, level).join(',')).join(' ')} />)}
    {rows.map((row, index) => {
      const [x, y] = point(index, total, 1);
      return <line key={row.key} className="profile-radar__spoke" x1={VIEW.cx} y1={VIEW.cy} x2={x} y2={y} />;
    })}
    <text className="profile-radar__scale" x={VIEW.cx + 6} y={VIEW.cy - VIEW.radius * 0.5 + 12}>50</text>
    <text className="profile-radar__scale" x={VIEW.cx + 6} y={VIEW.cy - VIEW.radius + 12}>100</text>
    <polygon className="profile-radar__area" data-side="theirs" points={polygon('theirPercentile')} />
    <polygon className="profile-radar__area" data-side="mine" points={polygon('minePercentile')} />
    {rows.flatMap((row, index) => (['theirPercentile', 'minePercentile'] as const).map(key => {
      if (row[key] === null) return null;
      const [x, y] = point(index, total, (row[key] ?? 0) / 100);
      return <circle key={`${row.key}-${key}`} className="profile-radar__vertex" data-side={key === 'minePercentile' ? 'mine' : 'theirs'} cx={x} cy={y} r={4} />;
    }))}
    {rows.map((row, index) => {
      const [x, y] = point(index, total, 1.1);
      const cos = Math.cos(angle(index, total));
      const sin = Math.sin(angle(index, total));
      const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
      // Three lines (name, this archetype, the opponent) grow upwards above the plot, downwards below
      // it; offsets in em follow the larger phone type.
      const first = sin < -0.9 ? '-2.5em' : sin > 0.2 ? '0.8em' : '-0.75em';
      return <text key={row.key} className="profile-radar__label" x={x} y={y} textAnchor={anchor}>
        <tspan x={x} dy={first} className="profile-radar__name">{row.radarLabel ?? row.label}</tspan>
        <tspan x={x} dy="1.2em" data-side="mine">{formatProfileValue(row.key, row.mine)}</tspan>
        <tspan x={x} dy="1.15em" data-side="theirs">{formatProfileValue(row.key, row.theirs)}</tspan>
      </text>;
    })}
  </svg>;
}

/** Percentiles of both archetypes on one 0–100 track: the same measure the radar draws. */
function PercentileBars({ mine, theirs }: { mine: number | null; theirs: number | null }) {
  return <span className="profile-percentiles">
    {([['mine', mine], ['theirs', theirs]] as const).map(([side, value]) => <span key={side} className="profile-percentiles__row" data-side={side}>
      <span className="profile-percentiles__track"><i style={{ inlineSize: `${value ?? 0}%` }} /></span>
      <small>{value === null ? '—' : `${value} из 100`}</small>
    </span>)}
  </span>;
}

function tableMetrics(rows: Rows, mineLabel: string, theirLabel: string): ComparisonMetric[] {
  return rows.map(row => {
    const leaderName = row.leader === 'mine' ? mineLabel : theirLabel;
    const mineIsBetter = row.leaderIsBetter === null ? null : row.leaderIsBetter === (row.leader === 'mine');
    return {
      label: row.label,
      value: row.mine ?? 0,
      previous: row.theirs ?? 0,
      format: value => formatProfileValue(row.key, value),
      chart: <PercentileBars mine={row.minePercentile} theirs={row.theirPercentile} />,
      badge: !row.leader
        ? { label: 'Вровень', color: 'gray', title: 'Разница меньше, чем заметно в игре' }
        : row.better
          ? { label: `Лучше: ${mineIsBetter ? mineLabel : theirLabel}`, color: mineIsBetter ? 'green' : 'red', title: `${row.label}: ${row.better === 'higher' ? 'больше' : 'меньше'} — лучше` }
          : { label: `Выше: ${leaderName}`, color: 'blue', title: `${row.label} не делает архетип сильнее, только описывает его` },
    };
  });
}

function HeadToHead({ mine, theirs, matchup }: {
  mine: ProfileItem; theirs: ProfileItem; matchup: ReturnType<typeof matchupBetween> | 'loading' | 'unavailable';
}) {
  const body = matchup === 'loading' ? <p className="profile-h2h__note">Загружаем матчапы HSGuru…</p>
    : matchup === 'unavailable' || matchup === null ? <p className="profile-h2h__note">Матчапы HSGuru сейчас недоступны.</p>
    : matchup.winrate === null ? <p className="profile-h2h__note">{matchup.missing === 'pair'
      ? 'HSGuru не публикует эту пару: в Легенде у неё меньше 25 игр.'
      : `«${matchup.missing === 'archetype' ? mine.archetypeLabel : theirs.archetypeLabel}» нет в таблице матчапов HSGuru для Легенды: у архетипа мало игр на этом ранге.`}</p>
    : <>
      <p className="profile-h2h__value"><b>{percent(matchup.winrate)}</b> побед {mine.archetypeLabel} против {theirs.archetypeLabel}</p>
      <span className="profile-h2h__bar" aria-hidden="true"><i data-side="mine" style={{ inlineSize: `${matchup.winrate}%` }} /><i data-side="theirs" /></span>
      {matchup.reverse !== null ? <p className="profile-h2h__note">Обратная пара в той же таблице: {theirs.archetypeLabel} — {percent(matchup.reverse)}.</p> : null}
    </>;
  return <section className="profile-h2h" aria-label="Очный матчап">
    <h3><Swords size={16} aria-hidden="true" /> Очный матчап · HSGuru, Легенда</h3>
    {body}
  </section>;
}

/** This archetype against another one of the format: radar of percentiles, table of values, summary and their direct matchup. */
export function ArchetypeRadar({ item, items, viewerId }: { item: ProfileItem; items: readonly ProfileItem[]; viewerId?: string }) {
  const matchups = useFormatMatchups(viewerId, item.format);
  const others = useMemo(() => items.filter(other => other.slug !== item.slug), [items, item.slug]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  // Until the reader picks one, the opponent is the most played archetype with a published direct matchup.
  const suggested = typeof matchups === 'string' ? others[0]
    : others.find(entry => matchupBetween(matchups, item.archetype, entry.archetype)?.winrate != null) ?? others[0];
  const other = others.find(entry => entry.slug === chosen) ?? suggested;
  const options = useMemo(() => opponentOptions(others), [others]);
  const rows = useMemo(() => other ? profileComparison(item, other, items) : [], [item, items, other]);
  if (!other) return <p className="archetype-insight-empty">В формате нет других архетипов для сравнения.</p>;
  const matchup = typeof matchups === 'string' ? matchups : matchupBetween(matchups, item.archetype, other.archetype);
  return <div className="archetype-radar hp-varylo">
    <PortalContainerContext.Provider value={layer}>
      <div className="archetype-radar__pick hp-varylo-parchment">
        <label htmlFor="archetype-radar-opponent">Сравнить с</label>
        <Combobox
          id="archetype-radar-opponent"
          className="archetype-radar__combobox"
          options={options}
          value={other.slug}
          onValueChange={slug => { if (slug) setChosen(slug); }}
          leftIcon={<ClassIcon classKey={other.classKey} />}
          placeholder="Найдите архетип"
          emptyText="Ничего не найдено"
          labels={{ toggleSuggestions: 'Показать архетипы' }}
        />
      </div>
    </PortalContainerContext.Provider>
    <div ref={setLayer} className="archetype-radar__layer hp-varylo-parchment" />
    <p className="archetype-radar__summary">{profileSummary(item.archetypeLabel, other.archetypeLabel, rows)}</p>
    <div className="archetype-radar__body">
      <figure className="archetype-radar__plot">
        <ProfileRadar rows={rows} />
        <figcaption className="archetype-radar__legend">
          <span data-side="mine"><ClassIcon classKey={item.classKey} size={18} />{item.archetypeLabel}</span>
          <span data-side="theirs"><ClassIcon classKey={other.classKey} size={18} />{other.archetypeLabel}</span>
          <small>Ось — место среди {items.length} архетипов формата, 0–100</small>
        </figcaption>
      </figure>
      <div className="archetype-radar__side">
        <MetricComparison
          className="profile-table"
          metrics={tableMetrics(rows, item.archetypeLabel, other.archetypeLabel)}
          bars="paired"
          currentLabel={item.archetypeLabel}
          previousLabel={other.archetypeLabel}
          locale="ru-RU"
          labels={{ metric: 'Метрика', change: 'Итог', new: 'Новое', increase: 'Больше', decrease: 'Меньше' }}
          ariaLabel={`${item.archetypeLabel} против ${other.archetypeLabel}: значения и место в формате`}
        />
        <HeadToHead mine={item} theirs={other} matchup={matchup} />
      </div>
    </div>
  </div>;
}

