import { useMemo } from 'react';
import { LineChart } from '../../../shared/ui/analytics/LineChart';
import { StackedBarChart } from '../../../shared/ui/analytics/StackedBarChart';
import '../../../shared/ui/analytics/Analytics.css';
import { formatCount } from '../model/subscriptionFormat';
import {
  dailyChartPoints, planSeries, planShareRows, rankPlans, unobservedDayCount, unobservedRanges,
  weeklyChartPoints, WEEKLY_SEGMENT_LABELS,
} from '../model/subscriptionCharts';
import { pluralRu } from '../../../shared/text/pluralRu';
import type { SubscriptionMetrics } from '../model/types';

const BASE_COLOR = '#8d171d';
const STARTS_COLOR = '#2f6b3a';

/** Платная база по дням: линия, пунктир на днях без наблюдений и доли тарифов на выбранных датах. */
export function DailyPaidChart({ metrics }: { metrics: SubscriptionMetrics }) {
  const { daily } = metrics;
  const plans = useMemo(() => rankPlans(daily), [daily]);
  const points = useMemo(() => dailyChartPoints(daily, plans), [daily, plans]);
  const series = useMemo(() => planSeries(daily, plans), [daily, plans]);
  const shareRows = useMemo(() => planShareRows(daily, plans), [daily, plans]);
  const missing = unobservedDayCount(daily);
  const ranges = unobservedRanges(daily);
  return <div className="sa-chart-slot" data-chart-id="daily-paid">
    <LineChart
      title="Активные платные подписчики по дням"
      subtitle="Наведите на день, чтобы увидеть разбивку по тарифам, приходы и уходы"
      points={points}
      unit="count"
      color={BASE_COLOR}
      referenceLabel="Значение перенесено"
      xLabel="День "
    />
    <ul className="sa-legend" aria-label="Обозначения графика">
      <li><i />Наблюдаемые дни</li>
      {missing > 0 && <li><i data-dashed="" />Дни без наблюдений: значение перенесено с предыдущего дня</li>}
    </ul>
    {missing > 0 && <p className="sa-chart-note" data-testid="unobserved-note">
      Без наблюдений {formatCount(missing)} {pluralRu(missing, 'день', 'дня', 'дней')}: {ranges.join(', ')}. На этих днях база не менялась по данным, а не по факту.
    </p>}
    {shareRows.length > 0 && <div className="sa-chart-slot" style={{ marginTop: 20 }}>
      <StackedBarChart title="Доли тарифов" subtitle="Состав платной базы на выбранных наблюдаемых днях" rows={shareRows} series={series} />
    </div>}
  </div>;
}

/** Начало и окончание доступа по неделям; неполная неделя отмечена отдельным сегментом. */
export function WeeklyAccessChart({ metrics }: { metrics: SubscriptionMetrics }) {
  const points = useMemo(() => weeklyChartPoints(metrics.weekly), [metrics.weekly]);
  const partial = metrics.weekly.some(week => week.partial);
  return <div className="sa-chart-slot" data-chart-id="weekly-access">
    <LineChart
      title="Начало и окончание доступа по неделям"
      subtitle="Сплошная линия — начали платный доступ, пунктир — закончили"
      points={points}
      unit="count"
      color={STARTS_COLOR}
      referenceLabel="Закончили"
      segmentLabel={segment => WEEKLY_SEGMENT_LABELS[segment] ?? segment}
      domain={{ minimum: 0 }}
      xLabel="Неделя "
    />
    <ul className="sa-legend" aria-label="Обозначения графика">
      <li><i style={{ borderTopColor: STARTS_COLOR }} />Начали доступ</li>
      <li><i data-dashed="" style={{ borderTopColor: '#5f554a' }} />Закончили</li>
    </ul>
    {partial && <p className="sa-chart-note">Последняя неделя ещё не закончилась: её числа неполные и вырастут.</p>}
  </div>;
}

export function SubscriptionChartsSkeleton() {
  return <div className="sa-charts" aria-hidden="true">
    <div className="sa-skeleton sa-skeleton--chart" />
    <div className="sa-skeleton sa-skeleton--chart" />
  </div>;
}
