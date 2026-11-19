import './BattlegroundLibraryPublic.css';
import './BattlegroundLibraryPublicCard.css';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import type { PublicBattlegroundLibraryCard } from '@/apps/public-web/lib/publicBattlegroundLibraryCardData';

const number = (value: number, digits: number) => value.toFixed(digits).replace('.', ',');

/**
 * What a guest and a robot get on `/library/<kind>/<slug>-<id>/` in the server HTML: type, tavern tier, tribe,
 * attack and health (the golden version too), the card text, mechanics, the base statistics («Топ 50%»: average
 * place with and without the card, popularity, sample) and related cards by tags. The same markup for everyone; the
 * closed part (strength by round, purchases, board positions, history) lives in `.paywalled-library-card`.
 */
export function BattlegroundLibraryPublicCard({ card }: { card: PublicBattlegroundLibraryCard }) {
  const stats = card.stats;
  const date = stats?.updatedAt ? seoDataDate(stats.updatedAt, Date.now()) : null;
  const body = card.attack !== null && card.health !== null ? `${card.attack}/${card.health}` : null;
  const golden = card.golden?.attack != null && card.golden.health != null ? `${card.golden.attack}/${card.golden.health}` : null;
  return <div className="bg-library-public">
    <section id="card-facts" aria-labelledby="card-facts-title">
      <h2 id="card-facts-title">Характеристики</h2>
      <dl className="bg-library-public__grid">
        <div><dt>Тип</dt><dd>{card.typeName}</dd></div>
        {card.tavernTier !== null ? <div><dt>Уровень таверны</dt><dd>{card.tavernTier}</dd></div> : null}
        {card.tribe ? <div><dt>Тип существа</dt><dd>{card.tribe}</dd></div> : null}
        {body ? <div><dt>Атака/здоровье</dt><dd>{body}</dd></div> : null}
        {golden ? <div><dt>Золотая версия</dt><dd>{golden}</dd></div> : null}
      </dl>
    </section>
    {card.text ? <section id="card-text" aria-labelledby="card-text-title">
      <h2 id="card-text-title">Текст карты</h2>
      <p>{card.text}</p>
    </section> : null}
    {card.mechanics.length ? <section id="card-mechanics" aria-labelledby="card-mechanics-title">
      <h2 id="card-mechanics-title">Механики</h2>
      <ul className="bg-library-public__mechanics">{card.mechanics.map(mechanic => <li key={mechanic}>{mechanic}</li>)}</ul>
    </section> : null}
    {stats ? <section id="card-stats" aria-labelledby="card-stats-title">
      <h2 id="card-stats-title">Статистика</h2>
      <dl className="bg-library-public__grid">
        <div><dt>Среднее место с картой</dt><dd>{number(stats.avgPlacementWith, 2)}</dd></div>
        {stats.avgPlacementWithout !== null ? <div><dt>Среднее место без карты</dt><dd>{number(stats.avgPlacementWithout, 2)}</dd></div> : null}
        {stats.popularity !== null ? <div><dt>Популярность</dt><dd>{`${number(stats.popularity, 1)}%`}</dd></div> : null}
        <div><dt>Игр в выборке</dt><dd>{stats.gamesWith.toLocaleString('ru-RU')}</dd></div>
      </dl>
      <p>
        {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : 'Дата обновления неизвестна'}
        {' · источник HSReplay · рейтинг «Топ 50%», текущий патч.'}
      </p>
    </section> : null}
    {card.related.length ? <section id="card-related" aria-labelledby="card-related-title">
      <h2 id="card-related-title">Связанные карты</h2>
      <ul className="bg-library-public__related">
        {card.related.map(related => <li key={related.dbfId}><a href={related.path}>
          {related.name}{related.tavernTier !== null ? <span>{`таверна ${related.tavernTier}`}</span> : null}
        </a></li>)}
      </ul>
    </section> : null}
  </div>;
}
