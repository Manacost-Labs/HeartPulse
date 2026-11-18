import './BattlegroundHeroesPublicRanking.css';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import type { PublicBattlegroundHeroesRanking } from '@/apps/public-web/lib/publicBattlegroundHeroesData';

const number = (value: number, digits: number) => value.toFixed(digits).replace('.', ',');
const dash = '—';

function tip(hero: PublicBattlegroundHeroesRanking['heroes'][number]): string {
  return [
    hero.heroPowerName ? `Сила: ${hero.heroPowerName}` : '',
    hero.bestComposition ? `Лучшая сборка: ${hero.bestComposition}` : '',
    hero.keyMinions.length ? `Ключевые существа: ${hero.keyMinions.join(', ')}` : '',
  ].filter(Boolean).join('. ');
}

function RankingTable({ data, id, title }: { data: PublicBattlegroundHeroesRanking; id: string; title: string }) {
  const date = seoDataDate(data.updatedAt, Date.now());
  const withGames = data.heroes.some(hero => hero.games !== null);
  const duos = data.mode === 'duos';
  return <section id={id} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>{title}</h2>
    <p>
      {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : 'Дата обновления неизвестна'}
      {`${data.source ? ` · источник ${data.source}` : ''} · рейтинг «Топ 50%».${duos ? ' В Дуо топ-4 не считается: команд четыре.' : ''}`}
    </p>
    <div className="bg-heroes-public__scroll">
      <table>
        <caption>{title}</caption>
        <thead><tr>
          <th scope="col">#</th><th scope="col">Герой</th><th scope="col">Тир</th><th scope="col">Среднее место</th>
          <th scope="col">Топ-4</th><th scope="col">Выбор</th>{withGames ? <th scope="col">Игр</th> : null}
          <th scope="col">Краткий совет</th>
        </tr></thead>
        <tbody>
          {data.heroes.map((hero, index) => <tr key={hero.dbfId}>
            <td>{index + 1}</td>
            <th scope="row"><a className="bg-heroes-public__hero" href={`/heroes/${hero.dbfId}/`}>
              {hero.image ? <img src={hero.image} alt="" width={40} height={40} loading="lazy" decoding="async" /> : null}
              <span>{hero.name}</span>
            </a></th>
            <td>{hero.tier}</td>
            <td>{number(hero.avgPlacement, 2)}</td>
            <td>{hero.top4Rate === null ? dash : `${number(hero.top4Rate, 1)}%`}</td>
            <td>{hero.pickRate === null ? dash : `${number(hero.pickRate, 1)}%`}</td>
            {withGames ? <td>{hero.games === null ? dash : hero.games.toLocaleString('ru-RU')}</td> : null}
            <td className="bg-heroes-public__tip">{tip(hero) || dash}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}

/**
 * What a guest and a robot get on `/heroes/` in the server HTML: the full
 * ranking of the base range («Топ 50%») for solo and duos with tier, average
 * place, top-4 share, pick rate and a short tip. Both modes are in the page
 * (no script needed to switch). The same markup for everyone; the closed part
 * (other rating ranges, comparison, change between patches) lives in
 * `.paywalled-heroes` (see the page's JSON-LD). Nothing for a mode without data.
 */
export function BattlegroundHeroesPublicRanking({ solo, duos }: {
  solo: PublicBattlegroundHeroesRanking | null; duos: PublicBattlegroundHeroesRanking | null;
}) {
  if (!solo && !duos) return <p className="bg-heroes-public" role="status">Рейтинг героев временно недоступен. Попробуйте позже.</p>;
  return <div className="bg-heroes-public">
    <nav className="bg-heroes-public__modes" aria-label="Режим рейтинга">
      {solo ? <a href="#heroes-solo">Соло</a> : null}
      {duos ? <a href="#heroes-duos">Дуо</a> : null}
    </nav>
    {solo ? <RankingTable data={solo} id="heroes-solo" title="Рейтинг героев Полей сражений — Соло" /> : null}
    {duos ? <RankingTable data={duos} id="heroes-duos" title="Рейтинг героев Полей сражений — Дуо" /> : null}
  </div>;
}
