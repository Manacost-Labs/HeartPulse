import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Tooltip } from '../vendor/varylo-ui/basic/Tooltip';
import { KpiGroup, type KpiItem } from '../vendor/varylo-ui/data-display/KpiGroup';
import { LoadingBlock } from '../shared/ui/LoadingSurface';
import { Line } from './BattlegroundsSkeletons';
import '../vendor/varylo-ui/styles/index.css';
import './archetypeVaryloTheme.css';
import './BattlegroundMinionHeader.css';

const LABELS = {
  increase: 'Рост',
  decrease: 'Снижение',
  unchanged: 'Без изменений',
  noData: 'Нет данных',
  loading: 'Загружаем статистику',
  ofTarget: (percent: string, target: string) => `${percent} от ${target}`,
};

export type MinionHeaderFact = { key: string; label: string; icon?: string | null };

type BattlegroundMinionHeaderProps = {
  /** The h1 text; while loading without a teaser, a placeholder line in the same box. */
  title: string | null;
  /** Card render with its own fallbacks; the page owns image recovery. */
  card: ReactNode | null;
  /** Normal/golden switch under the card, when the minion has a golden version. */
  variant?: ReactNode;
  facts: MinionHeaderFact[];
  rulesText?: string;
  /** Same-origin art behind the plate; hidden when it fails. */
  art?: string | null;
  kpis: KpiItem[];
  /** Colours the leading placement gap: lower placement with the minion is better. */
  placementTone?: 'better' | 'worse' | null;
  /** Page-tour anchors of the identity block and the KPI strip. */
  identityTourId?: string;
  metricsTourId?: string;
  /** Shown instead of the KPI strip when the slice has no games. */
  emptyText: string;
  /** Shows «Как считается» with the methodology; the data source line itself is not shown. */
  methodology?: boolean;
  /**
   * Loading geometry of the same plate: placeholders stand in for every missing
   * part, so the loaded header replaces it without a layout shift.
   */
  loading?: boolean;
};

/** Methodology of hs-data-api (HSReplay formulas), retold for the tooltip. */
const METHODOLOGY = [
  'Место с ним и без — среднее итоговое место в играх, где существо стояло на столе, против игр без него. Меньше — лучше.',
  'Винрейт боёв — доля выигранных боёв, в которых существо было на столе.',
  'Популярность — доля игр со существом на столе, взвешенная по ходам.',
  'Влияние — на сколько мест в среднем улучшается итог по ходам, где оно на столе. Больше — лучше.',
  'Пусто — меньше 30 игр или боёв, на позициях стола — меньше 200 досок.',
];

export function BattlegroundMinionHeader({ title, card, variant, facts, rulesText, art, kpis, placementTone, identityTourId, metricsTourId, emptyText, methodology = false, loading = false }: BattlegroundMinionHeaderProps) {
  return (
    <section className="minion-header">
      {art ? (
        <img
          className="minion-header__backdrop"
          src={art}
          width={512}
          height={680}
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchPriority="high"
          onError={event => { event.currentTarget.hidden = true; }}
        />
      ) : null}
      <div className="minion-header__card">{card ?? <LoadingBlock className="minion-header__card-placeholder" />}</div>
      {variant ? <div className="minion-header__variant">{variant}</div> : null}
      <div className="minion-header__identity" data-tour-id={identityTourId}>
        {title !== null
          ? <h1 className="minion-header__title">{title}</h1>
          : <p className="minion-header__title" aria-hidden="true"><Line className="bg-skeleton-w-name" /></p>}
        {loading && !facts.length ? (
          <ul className="minion-header__facts" aria-hidden="true"><li><LoadingBlock className="minion-header__fact-placeholder" /></li></ul>
        ) : facts.length ? (
          <ul className="minion-header__facts">
            {facts.map(fact => (
              <li key={fact.key}>
                {fact.icon ? <img src={fact.icon} alt="" width="24" height="24" /> : null}
                <span>{fact.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {rulesText ? <p className="minion-header__text">{rulesText}</p>
          : loading ? <p className="minion-header__text" aria-hidden="true"><Line /><Line className="bg-skeleton-w-short bg-skeleton-line--phone" /></p> : null}
      </div>
      {loading ? (
        <KpiGroup className="minion-header__metrics hp-varylo hp-varylo--plate" items={[]} loading skeletonCount={5}
          minTileWidth={104} locale="ru-RU" labels={LABELS} />
      ) : kpis.length ? (
        <KpiGroup
          className="minion-header__metrics hp-varylo hp-varylo--plate"
          items={kpis}
          minTileWidth={104}
          locale="ru-RU"
          labels={LABELS}
          data-placement-tone={placementTone ?? undefined}
          data-tour-id={metricsTourId}
        />
      ) : <p className="minion-header__empty" data-tour-id={metricsTourId}>{emptyText}</p>}
      {loading ? <p className="minion-header__source" aria-hidden="true"><Line className="bg-skeleton-w-short" /></p> : methodology ? (
        <p className="minion-header__source">
          <Tooltip
            className="minion-header__methodology"
            content={<ul>{METHODOLOGY.map(line => <li key={line}>{line}</li>)}</ul>}
          >
            <button type="button" aria-label="Как считается статистика">
              <Info aria-hidden="true" size={15} /> Как считается
            </button>
          </Tooltip>
        </p>
      ) : null}
    </section>
  );
}
