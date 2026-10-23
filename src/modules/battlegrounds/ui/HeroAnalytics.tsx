import { useId, useMemo, useState } from 'react';
import { CircleAlert, Heart, Star, Swords } from 'lucide-react';
import { AnchoredImagePreview } from '../../../shared/ui/AnchoredImagePreview';
import { ColumnChart } from '../../../shared/ui/analytics/ColumnChart';
import { LineChart } from '../../../shared/ui/analytics/LineChart';
import { StackedBarChart } from '../../../shared/ui/analytics/StackedBarChart';
import { formatChartValue } from '../../../shared/ui/analytics/analyticsModel';
import {
  HERO_LOW_SAMPLE_GAMES, heroCompositionRows, heroFinalBoards, heroPlacementColumns, heroPowerMatrix, heroTavernDistribution,
  heroTavernPace, heroTurnPoints, type HeroAnalyticsRow,
} from '../model/heroAnalytics';
import { heroCardImageSources, heroMinionStat } from '../model/heroCardImages';
import { battlegroundMinionIconByRussianName } from '../model/minionTypeIcons';

/** Card data the hero detail payload carries for its minions, keyed by dbfId. */
export type HeroAnalyticsCard = {
  name?: string; text?: string; card_id?: string | null;
  /** The normal card of a golden minion; the server adds it from the BG card library. */
  base_card_id?: string | null;
};

// Palette of the site's analytics: winrate red, share blue (docs: template-chart.md).
const WINRATE = '#8d171d';
const SHARE = '#2f6c9e';
const MUTED = '#c4a57a';
// Tavern tiers are ordered, so they read as one warm scale from parchment to wine.
const TAVERN_SERIES = [
  ['#efe1c0', '#30251c'], ['#e0c48c', '#30251c'], ['#cfa262', '#30251c'], ['#b47c47', '#2a1a10'],
  ['#975636', '#fff6e0'], ['#78352a', '#fff6e0'], ['#531d23', '#fff6e0'],
].map(([color, textColor], index) => ({ key: String(index + 1), label: `Т${index + 1}`, color, textColor }));
const LOW_SAMPLE_HINT = `Меньше ${HERO_LOW_SAMPLE_GAMES} игр: оценка приблизительная`;
/** Matrix cells with fewer observations are faded: their share swings from game to game. */
const MATRIX_LOW_SAMPLE = 50;

const tavernIcon = (tier: number | null | undefined) => `/bg-legacy/assset/tier${Math.min(7, Math.max(1, Number(tier) || 1))}.png`;
const percent = (value: number | null, digits = 1) => (value === null ? '—' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: digits })}%`);
const decimal = (value: number | null) => (value === null ? '—' : value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return <header className="analytics-chart__header"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div></header>;
}

/** Обзор: where the hero finishes and how its fights go round by round. */
export function HeroOverview({ placement, combat }: { placement: unknown; combat: unknown }) {
  const columns = useMemo(() => heroPlacementColumns(placement), [placement]);
  const rounds = useMemo(() => heroTurnPoints(combat, { turn: 'combat_round', value: 'combat_winrate', sample: 'data_points' }, 'Раунд', 'боёв')
    .map(point => ({ ...point, reference: 50 })), [combat]);
  if (!columns.length && !rounds.length) return null;
  const topFour = columns.filter(column => column.accent).reduce((total, column) => total + column.value, 0);
  return <div className="bg-hero-analytics__grid">
    {columns.length > 0 && <ColumnChart title="Места в партиях" subtitle={`Доля партий на каждом месте · топ-4 — ${formatChartValue(topFour, '%', 1)}`} xLabel="Место"
      rows={columns.map(column => ({ label: column.label, value: column.value, detail: column.detail, color: column.accent ? WINRATE : MUTED }))} />}
    {rounds.length > 0 && <LineChart title="Винрейт боёв по раундам" subtitle="Доля выигранных боёв в каждом раунде · пунктир — 50%" unit="%" color={WINRATE}
      points={rounds} referenceLabel="Граница" />}
  </div>;
}

/** Сила героя: on which turn it is used, and how that depends on the tavern tier. */
export function HeroPowerAnalytics({ byTurn, byTier }: { byTurn: unknown; byTier: unknown }) {
  const points = useMemo(() => heroTurnPoints(byTurn, { turn: 'turn', value: 'invoked_rate', sample: 'total_data_points' }, 'Ход', 'партий'), [byTurn]);
  const matrix = useMemo(() => heroPowerMatrix(byTier), [byTier]);
  if (!points.length && !matrix.turns.length) return null;
  return <div className="bg-hero-analytics__stack">
    {points.length > 0 && <LineChart title="Когда применяют силу героя" subtitle="Доля партий, где сила героя применена на этом ходу" unit="%" color={SHARE}
      domain={{ minimum: 0, maximum: 100 }} points={points} />}
    {matrix.turns.length > 0 && <section className="analytics-chart bg-hero-power-matrix" aria-labelledby="bg-hero-power-matrix-title">
      <header className="analytics-chart__header"><div>
        <h3 id="bg-hero-power-matrix-title">По уровню таверны</h3>
        <p>Доля применений на ходу при этом уровне таверны, % · бледные клетки — меньше {MATRIX_LOW_SAMPLE} партий</p>
      </div></header>
      <div className="bg-hero-power-matrix__scroll" role="region" aria-label="Применение силы героя по ходам и уровням таверны" tabIndex={0}>
        <table>
          <thead><tr><th scope="col"><span className="sr-only">Таверна</span></th>{matrix.turns.map(({ turn, gold }) => <th key={turn} scope="col">
            <span>Ход {turn}</span>{gold !== null && <small>{gold} зол.</small>}
          </th>)}</tr></thead>
          <tbody>{matrix.tiers.map(tier => <tr key={tier}>
            <th scope="row"><img src={tavernIcon(tier)} alt="" width="22" height="22" loading="lazy" /><span className="bg-hero-power-matrix__tier-word">Таверна </span>{tier}</th>
            {matrix.turns.map(({ turn }) => {
              const cell = matrix.cell(turn, tier);
              if (!cell || cell.rate === null) return <td key={turn} className="is-empty"><span className="sr-only">нет данных</span></td>;
              const label = `Ход ${turn}, таверна ${tier}: ${percent(cell.rate)} · ${cell.games?.toLocaleString('ru-RU') ?? '—'} партий`;
              return <td key={turn} title={label} data-low={cell.games !== null && cell.games < MATRIX_LOW_SAMPLE ? '' : undefined}
                style={{ ['--cell' as string]: String(Math.min(1, cell.rate / 100)) }} data-strong={cell.rate >= 55 ? '' : undefined}>
                {Math.round(cell.rate)}<span className="sr-only">% · {cell.games?.toLocaleString('ru-RU')} партий</span>
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </section>}
  </div>;
}

/** Таверна: the usual upgrade pace and the full tier distribution by turn. */
export function HeroTavernAnalytics({ byTurn, distribution }: { byTurn: unknown; distribution: unknown }) {
  const pace = useMemo(() => heroTavernPace(byTurn), [byTurn]);
  const rows = useMemo(() => heroTavernDistribution(distribution), [distribution]);
  if (!pace.length && !rows.length) return null;
  const tiers = new Set(rows.flatMap(row => Object.keys(row.values)));
  return <div className="bg-hero-analytics__stack">
    {pace.length > 0 && <section className="analytics-chart bg-hero-tavern-pace" aria-labelledby="bg-hero-tavern-pace-title">
      <header className="analytics-chart__header"><div>
        <h3 id="bg-hero-tavern-pace-title">Когда улучшать таверну</h3>
        <p>Ход, с которого уровень таверны становится самым частым · доля игроков на нём в этот ход</p>
      </div></header>
      <ol className="bg-hero-tavern-pace__steps">
        {pace.map(step => <li key={step.tier}>
          <img src={tavernIcon(step.tier)} alt="" width="34" height="34" loading="lazy" />
          <span><strong>Ход {step.turn}</strong><small>Таверна {step.tier}{step.share !== null ? ` · ${percent(step.share, 0)}` : ''}</small></span>
        </li>)}
      </ol>
    </section>}
    {rows.length > 0 && <StackedBarChart title="Уровень таверны по ходам" subtitle="Доля игроков на каждом уровне таверны к концу хода" rows={rows}
      series={TAVERN_SERIES.filter(item => tiers.has(item.key))} />}
  </div>;
}

/** Tries each full-card source in turn; the name stands in when none loads. */
function CardImage({ sources, name }: { sources: string[]; name: string }) {
  const [index, setIndex] = useState(0);
  const source = sources[index];
  if (!source) return <span className="bg-hero-lineup__fallback">{name}</span>;
  return <img src={source} alt={name} width="256" height="388" loading="lazy" decoding="async" onError={() => setIndex(current => current + 1)} />;
}

/** A minion name that shows its full card beside it on hover or focus, outside the page flow. */
function CardPreview({ card, name }: { card: HeroAnalyticsCard | undefined; name: string }) {
  const previewId = useId();
  const [anchor, setAnchor] = useState<{ rect: DOMRect; key: number } | null>(null);
  const sources = heroCardImageSources(card, false);
  if (!sources.length) return <span className="bg-hero-card-name">{name}</span>;
  const show = (event: { currentTarget: HTMLElement }) => setAnchor(current => ({ rect: event.currentTarget.getBoundingClientRect(), key: (current?.key ?? 0) + 1 }));
  const hide = () => setAnchor(null);
  return <span className="bg-hero-card-name" tabIndex={0} aria-describedby={anchor ? previewId : undefined}
    onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}>
    {name}
    {anchor && <AnchoredImagePreview key={anchor.key} id={previewId} previewId={previewId} source={sources[0]} fallbackSource={sources[1] ?? sources[0]}
      name={name} accessibleName={`Полная карта ${name}`} anchorRect={anchor.rect} />}
  </span>;
}

/** Составы: the typical final board, every composition in one list, and the key minions of the final board. */
export function HeroCompositionAnalytics({ best, compositions, cards }: { best: HeroAnalyticsRow | null | undefined; compositions: unknown; cards: Record<string, HeroAnalyticsCard> }) {
  const rows = useMemo(() => heroCompositionRows(compositions), [compositions]);
  const boards = useMemo(() => heroFinalBoards(best?.final_form_minions), [best]);
  const lineup = Array.isArray(best?.lineup) ? (best.lineup as HeroAnalyticsRow[]) : [];
  if (!rows.length && !lineup.length && !boards.length) return null;
  const maxShare = Math.max(1, ...rows.map(row => row.share ?? 0));
  return <div className="bg-hero-analytics__stack">
    {lineup.length > 0 && <section className="analytics-chart" aria-labelledby="bg-hero-lineup-title">
      <header className="analytics-chart__header"><div>
        <h3 id="bg-hero-lineup-title">Финальный стол: {String(best?.name ?? 'состав')}</h3>
        <p>Типичный стол лучшего состава в конце партии · атака и здоровье — средние</p>
      </div></header>
      <ol className="bg-hero-lineup">
        {lineup.map((minion, index) => {
          const dbf = String(minion.dbfId ?? minion.minion_dbf_id ?? '');
          const card = cards[dbf];
          const name = card?.name || String(minion.name ?? 'Существо');
          const golden = Boolean(minion.premium);
          const sources = heroCardImageSources(card, golden);
          const attack = heroMinionStat(minion.attack);
          const health = heroMinionStat(minion.health);
          return <li key={`${dbf}-${String(minion.zone_position ?? index)}`} className="bg-hero-lineup__minion" title={card?.text ? `${name}: ${card.text}` : name}>
            <span className="bg-hero-lineup__art">
              <CardImage key={sources.join('|')} sources={sources} name={name} />
              {golden && <span className="bg-hero-lineup__golden" role="img" aria-label="Золотое"><Star aria-hidden="true" /></span>}
            </span>
            <strong>{name}</strong>
            <span className="bg-hero-lineup__stats" role="img" aria-label={`Атака ${attack}, здоровье ${health}`}>
              <span><Swords aria-hidden="true" />{attack}</span>
              <span><Heart aria-hidden="true" />{health}</span>
            </span>
          </li>;
        })}
      </ol>
    </section>}
    {rows.length > 0 && <section className="analytics-chart" aria-labelledby="bg-hero-compositions-title">
      <SectionHeading title="Составы героя" subtitle="Как часто герой играет каждый состав и на каком месте в среднем заканчивает с ним" />
      <div className="bg-hero-compositions" role="table" aria-labelledby="bg-hero-compositions-title">
        <div className="bg-hero-compositions__head" role="row">
          <span role="columnheader">Состав</span><span role="columnheader">Выбор</span><span role="columnheader">Среднее место</span><span role="columnheader">Игры</span>
        </div>
        {rows.map(row => {
          const icon = battlegroundMinionIconByRussianName[row.name];
          return <div key={row.key} role="row" className={`bg-hero-compositions__row${row.lowSample ? ' is-low-sample' : ''}`}>
            <span role="cell" className="bg-hero-compositions__name">
              {icon ? <img src={icon} alt="" width="26" height="26" loading="lazy" /> : <span className="bg-hero-compositions__icon-gap" />}
              {row.name}
            </span>
            <span role="cell" className="bg-hero-compositions__share">
              <span className="bg-hero-compositions__bar" aria-hidden="true"><i style={{ width: `${Math.max(1.5, (row.share ?? 0) / maxShare * 100)}%` }} /></span>
              {percent(row.share, 2)}
            </span>
            <span role="cell" className="bg-hero-compositions__place">
              <strong>{decimal(row.placement)}</strong>
              {row.interval !== null && <small> ± {row.interval.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</small>}
            </span>
            <span role="cell" className="bg-hero-compositions__games">
              {row.games === null ? '—' : row.games.toLocaleString('ru-RU')}
              {row.lowSample && <span role="img" aria-label={LOW_SAMPLE_HINT} title={LOW_SAMPLE_HINT}><CircleAlert aria-hidden="true" /></span>}
            </span>
          </div>;
        })}
      </div>
    </section>}
    {boards.length > 0 && <section className="analytics-chart" aria-labelledby="bg-hero-final-title">
      <header className="analytics-chart__header"><div>
        <h3 id="bg-hero-final-title">Ключевые существа финала</h3>
        <p>Доля финальных столов лучшего состава, где есть это существо, по уровню таверны в конце партии</p>
      </div></header>
      <div className="bg-hero-final">
        {boards.map(board => <div key={board.tier} className="bg-hero-final__group">
          <h4><img src={tavernIcon(board.tier)} alt="" width="22" height="22" loading="lazy" />Финал на таверне {board.tier}</h4>
          <ul>
            {board.minions.map(minion => <li key={minion.key}>
              <CardPreview card={cards[minion.dbfId]} name={cards[minion.dbfId]?.name || minion.name} />
              <span className="bg-hero-final__bar" aria-hidden="true"><i style={{ width: `${minion.share}%` }} /></span>
              <span className="bg-hero-final__value">{percent(minion.share, 0)}</span>
              <small className="bg-hero-final__golden">{minion.golden === null ? '' : `золотое ${percent(minion.golden, 0)}`}</small>
            </li>)}
          </ul>
        </div>)}
      </div>
    </section>}
  </div>;
}
