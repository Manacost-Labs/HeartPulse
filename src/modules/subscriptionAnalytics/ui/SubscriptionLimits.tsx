import { TableSurface } from '../../../shared/ui/analytics/TableSurface';
import '../../../shared/ui/analytics/Analytics.css';
import { pluralRu } from '../../../shared/text/pluralRu';
import { formatHours, formatMoment } from '../model/subscriptionBlocks';
import { EMPTY_VALUE, formatCount } from '../model/subscriptionFormat';
import { describeCodes } from '../model/subscriptionTexts';
import type { SubscriptionMetrics } from '../model/types';

/** «Что нельзя посчитать», оговорки к цифрам и покрытие данных: чем надёжны цифры страницы. */
export function SubscriptionLimits({ metrics }: { metrics: SubscriptionMetrics }) {
  const unavailable = describeCodes(metrics.unavailable, 'unavailable');
  const limitations = describeCodes(metrics.limitations, 'limitations');
  const { coverage } = metrics;
  const gaps = coverage.gaps;
  const maxGapHours = coverage.maxPollGapSeconds === null ? null : coverage.maxPollGapSeconds / 3600;
  const thresholdHours = coverage.gapThresholdSeconds / 3600;
  return <>
    <section className="sa-section" aria-labelledby="sa-unavailable-title" data-section="unavailable">
      <header className="sa-section__head">
        <h3 id="sa-unavailable-title">Что нельзя посчитать</h3>
        <p>Этих показателей в данных Boosty нет, поэтому страница их не выдумывает.</p>
      </header>
      {unavailable.length === 0 ? <p className="sa-empty">Источник не сообщил ограничений по недоступным показателям.</p>
        : <ul className="sa-bullets" data-testid="unavailable-list">{unavailable.map(item => <li key={item.code}>{item.text}</li>)}</ul>}
    </section>

    <section className="sa-section" aria-labelledby="sa-limitations-title" data-section="limitations">
      <header className="sa-section__head">
        <h3 id="sa-limitations-title">Ограничения и оговорки</h3>
        <p>Как читать цифры выше.</p>
      </header>
      {limitations.length === 0 ? <p className="sa-empty">Источник не назвал оговорок.</p>
        : <ul className="sa-bullets" data-testid="limitations-list">{limitations.map(item => <li key={item.code}>{item.text}</li>)}</ul>}
    </section>

    <section className="sa-section" aria-labelledby="sa-coverage-title" data-section="coverage">
      <header className="sa-section__head">
        <h3 id="sa-coverage-title">Покрытие данных</h3>
        <p>Мы видим только моменты опросов Boosty. Если опросов долго не было, всё, что случилось в паузе, станет видно только после неё.</p>
      </header>
      <ul className="sa-stats" aria-label="Покрытие данных">
        <li className="sa-stat">
          <span className="sa-stat__label">Наблюдаем с</span>
          <strong className="sa-stat__value sa-stat__value--small">{formatMoment(coverage.baselineAt, true)}</strong>
          <small className="sa-stat__hint">Первый опрос; раньше данных нет</small>
        </li>
        <li className="sa-stat">
          <span className="sa-stat__label">Принято опросов</span>
          <strong className="sa-stat__value">{formatCount(coverage.acceptedPolls)}</strong>
          <small className="sa-stat__hint">С начала наблюдений</small>
        </li>
        <li className="sa-stat">
          <span className="sa-stat__label">Самый долгий перерыв</span>
          <strong className="sa-stat__value">{maxGapHours === null ? EMPTY_VALUE : formatHours(maxGapHours)}</strong>
          <small className="sa-stat__hint">Перерыв — пауза без опросов дольше {formatHours(thresholdHours)}</small>
        </li>
      </ul>
      {gaps.length === 0
        ? <p className="sa-empty" data-testid="no-gaps">Перерывов дольше {formatHours(thresholdHours)} в наблюдениях нет.</p>
        : <>
          <TableSurface title="Перерывы в опросах">
            <table className="sa-table">
              <thead><tr>
                <th scope="col">С</th><th scope="col">По</th><th scope="col" className="is-numeric">Длилась</th>
              </tr></thead>
              <tbody>{gaps.map(gap => <tr key={`${gap.from}-${gap.to}`}>
                <th scope="row">{formatMoment(gap.from)}</th>
                <td>{formatMoment(gap.to)}</td>
                <td className="is-numeric">{formatHours(gap.hours)}</td>
              </tr>)}</tbody>
            </table>
          </TableSurface>
          <p className="sa-note">В {formatCount(gaps.length)} {pluralRu(gaps.length, 'перерыве', 'перерывах', 'перерывах')} изменения могли быть не замечены: уходы и приходы в это время относятся к моменту после паузы, а удержание на этих датах может быть неизвестным.</p>
        </>}
    </section>
  </>;
}
