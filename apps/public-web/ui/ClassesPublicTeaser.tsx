import './ClassesPublicTeaser.css';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import type { PublicClassesTeaser } from '@/apps/public-web/lib/publicClassesTeaserData';
import { PaidLockButton } from './PaidOffer';

const formatWinrate = (value: number) => `${value.toFixed(1).replace('.', ',')}%`;

/**
 * What a guest and a robot get on `/classes/` in the server HTML, as the page's
 * main content: the order of the classes with the winrate to 0.1 percentage
 * point, the sample size of the class (drafts or games), the date and the
 * source. The same markup for everyone. The closed part (breakdown by cards and
 * periods, history, comparison) is the last column, behind a lock, named by the
 * page's JSON-LD (`.paywalled-classes`). Nothing without a teaser.
 */
export function ClassesPublicTeaser({ data }: { data: PublicClassesTeaser | null }) {
  if (!data) return null;
  const date = seoDataDate(data.updatedAt, Date.now());
  return <section className="classes-public-teaser" aria-labelledby="classes-public-teaser-title">
    <h2 id="classes-public-teaser-title" className="sr-only">Классы Арены по винрейту сейчас</h2>
    <p>
      {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : 'Дата обновления неизвестна'}
      {data.source ? ` · источник ${data.source}` : ''}
    </p>
    <table>
      <caption>Порядок классов Арены по проценту побед</caption>
      <colgroup><col /><col /><col /><col /><col className="paywalled-classes" /></colgroup>
      <thead><tr><th scope="col">Место</th><th scope="col">Класс</th><th scope="col">Винрейт</th><th scope="col">{data.sampleUnit === 'games' ? 'Игр' : data.sampleUnit === 'drafts' ? 'Забегов' : 'Выборка'}</th>
        <th scope="col" className="classes-public-teaser__lock-head">
          <PaidLockButton className="classes-public-teaser__lock" closed="paywalled-classes"
            label="Разбивка по картам, история и сравнение классов"><span>Ещё</span></PaidLockButton>
        </th></tr></thead>
      <tbody>
        {data.classes.map(item => <tr key={item.id}>
          <td>{item.place}</td>
          <th scope="row">{item.name}</th>
          <td>{formatWinrate(item.winrate)}</td>
          <td>{item.sample === null ? '—' : item.sample.toLocaleString('ru-RU')}</td>
          <td />
        </tr>)}
      </tbody>
    </table>
  </section>;
}
