import './ClassesPublicTeaser.css';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import type { PublicClassesTeaser } from '@/apps/public-web/lib/publicClassesTeaserData';

const formatWinrate = (value: number) => `${value.toFixed(1).replace('.', ',')}%`;

/**
 * What a guest and a robot get on `/classes/` in the server HTML, next to the
 * H1: the order of the classes with the winrate to 0.1 percentage point, the
 * sample size of the class (drafts or games), the date and the source. No breakdown, history or
 * comparison. The same markup for everyone; the closed part of the page lives
 * in `.paywalled-classes` (see the page's JSON-LD). Nothing without a teaser.
 */
export function ClassesPublicTeaser({ data }: { data: PublicClassesTeaser | null }) {
  if (!data) return null;
  const date = seoDataDate(data.updatedAt, Date.now());
  return <section className="classes-public-teaser" aria-labelledby="classes-public-teaser-title">
    <h2 id="classes-public-teaser-title">Классы Арены по винрейту сейчас</h2>
    <p>
      {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : 'Дата обновления неизвестна'}
      {`${data.source ? ` · источник ${data.source}` : ''}. Разбивка по картам и периодам, история и сравнение классов — по подписке.`}
    </p>
    <table>
      <caption>Порядок классов Арены по проценту побед</caption>
      <thead><tr><th scope="col">Место</th><th scope="col">Класс</th><th scope="col">Винрейт</th><th scope="col">{data.sampleUnit === 'games' ? 'Игр' : data.sampleUnit === 'drafts' ? 'Забегов' : 'Выборка'}</th></tr></thead>
      <tbody>
        {data.classes.map(item => <tr key={item.id}>
          <td>{item.place}</td>
          <th scope="row">{item.name}</th>
          <td>{formatWinrate(item.winrate)}</td>
          <td>{item.sample === null ? '—' : item.sample.toLocaleString('ru-RU')}</td>
        </tr>)}
      </tbody>
    </table>
  </section>;
}
