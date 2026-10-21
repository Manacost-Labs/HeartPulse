import { useMemo, type ReactNode } from 'react';
import { Coins, LayoutGrid, TrendingUp } from 'lucide-react';
import type { BattlegroundMinionStats } from '../modules/battlegrounds/public';
import { LineChart } from '../shared/ui/analytics/LineChart';
import { Heatmap } from '../vendor/varylo-ui/charts/Heatmap';
import { BattlegroundMinionBoard } from './BattlegroundMinionBoard';
import {
  minionPurchaseMatrix,
  minionRoundCharts,
  PURCHASE_ROWS,
  type MinionVariant,
} from './battlegroundMinionStatsModel';
import '../shared/ui/analytics/Analytics.css';
import '../vendor/varylo-ui/styles/index.css';
import './archetypeVaryloTheme.css';
import './BattlegroundMinionStats.css';

type MinionSectionProps = { id: string; icon: ReactNode; eyebrow: string; title: string; description: string; tourId?: string; children: ReactNode };

function MinionSection({ id, icon, eyebrow, title, description, tourId, children }: MinionSectionProps) {
  return (
    <section className="minion-section" aria-labelledby={id}>
      <header className="minion-section__heading" data-tour-id={tourId}>
        <span className="minion-section__eyebrow">{icon} {eyebrow}</span>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </header>
      <div className="minion-section__body">{children}</div>
    </section>
  );
}

const percentValue = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %`;

type SectionsProps = { stats: BattlegroundMinionStats; variant: MinionVariant; /** Page-tour anchor of the first section heading. */ tourId?: string };

/** "По ходам", "Когда покупают" and "Позиция на столе" of one minion; a block without data is left out. */
export function BattlegroundMinionStatsSections({ stats, variant, tourId }: SectionsProps) {
  const rounds = useMemo(() => minionRoundCharts(stats, variant), [stats, variant]);
  const purchases = useMemo(() => minionPurchaseMatrix(stats), [stats]);
  const golden = variant === 'golden' ? ' золотой версии' : '';
  return (
    <>
      {rounds.winrate.length || rounds.impact.length ? (
        <MinionSection
          id="minion-rounds-title"
          tourId={tourId}
          icon={<TrendingUp aria-hidden="true" />}
          eyebrow="По ходам"
          title="Сила по ходам"
          description={`Как сражается${golden} существо в каждом ходу боя. Пропуск — меньше 30 боёв или игр.`}
        >
          <div className="minion-section__charts">
            {rounds.winrate.length ? (
              <LineChart title="Винрейт боёв" subtitle="Полоса — 95% интервал" unit="%" color="#8d171d"
                points={rounds.winrate} bandLabel="95% интервал" />
            ) : null}
            {rounds.impact.length ? (
              <LineChart title="Влияние на место" subtitle="Выше нуля — итоговое место лучше, чем без него" color="#8d171d"
                points={rounds.impact} />
            ) : null}
            {rounds.median ? (
              <LineChart title="Медианная атака" subtitle="В подсказке — атака/здоровье" unit="count" color="#8a5b24"
                points={rounds.median} domain={{ minimum: 0 }} />
            ) : null}
          </div>
        </MinionSection>
      ) : null}
      {purchases ? (
        <MinionSection
          id="minion-purchases-title"
          icon={<Coins aria-hidden="true" />}
          eyebrow="Таверна"
          title="Когда покупают"
          description="Доля покупок, когда существо есть в таверне, и выбор в раскопке по ходам. Пусто — меньше 30 предложений."
        >
          <div className="hp-varylo minion-section__heatmap">
            <Heatmap
              rows={[...PURCHASE_ROWS]}
              columns={purchases.columns}
              values={purchases.values}
              color="#8d171d"
              valueFormatter={percentValue}
              showValues
              locale="ru-RU"
              labels={{ less: 'Реже', more: 'Чаще' }}
              ariaLabel="Доля покупок по ходам"
            />
          </div>
        </MinionSection>
      ) : null}
      {stats.positions.normal || stats.positions.taunt ? (
        <MinionSection
          id="minion-board-title"
          icon={<LayoutGrid aria-hidden="true" />}
          eyebrow="Стол"
          title="Позиция на столе"
          description="Где стоит существо: доля досок по местам слева направо и влияние места на итог."
        >
          <BattlegroundMinionBoard stats={stats} />
        </MinionSection>
      ) : null}
    </>
  );
}
