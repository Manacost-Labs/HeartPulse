import './BattlegroundBuildsPublicList.css';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import type { BuildTier, PublicBattlegroundBuilds, PublicBuildCard, PublicBuildRow } from '@/apps/public-web/lib/publicBattlegroundBuildsData';
import { BattlegroundBuildTierBadge } from './BattlegroundBuildTierBadge';

const TIERS: readonly BuildTier[] = ['S', 'A', 'B', 'C', 'D'];
const BUILDER_HREF = '/battlegrounds/tier-builder/';
const number = (value: number, digits: number) => value.toFixed(digits).replace('.', ',');

/** The page's anchor for a build, also the address its JSON-LD list entry points at. */
export const buildAnchor = (build: Pick<PublicBuildRow, 'key'>) => `build-${build.key}`;

function Minion({ card }: { card: PublicBuildCard }) {
  return <li>
    {card.image ? <img src={card.image} alt="" width={40} height={40} loading="lazy" decoding="async" /> : null}
    <span>{card.name}</span>
  </li>;
}

function Build({ build }: { build: PublicBuildRow }) {
  const facts = [
    build.archetype,
    build.difficulty ? `сложность: ${build.difficulty.toLowerCase()}` : null,
    build.avgPlacement === null ? null : `среднее место ${number(build.avgPlacement, 2)}`,
    build.popularity === null ? null : `популярность ${number(build.popularity, 1)}%`,
  ].filter(Boolean).join(' · ');
  return <li><article id={buildAnchor(build)} aria-labelledby={`${buildAnchor(build)}-title`}>
    <h3 id={`${buildAnchor(build)}-title`}>{build.title}</h3>
    {facts ? <p className="bg-builds-public__facts">{facts}</p> : null}
    {build.description ? <p>{build.description}</p> : null}
    <ul className="bg-builds-public__minions" aria-label="Ключевые существа">
      {build.coreCards.map(card => <Minion key={card.dbfId} card={card} />)}
    </ul>
    {build.additionalCards.length
      ? <p className="bg-builds-public__more">Пример стола дополняют: {build.additionalCards.map(card => card.name).join(', ')}.</p>
      : null}
    <a className="bg-builds-public__builder" href={BUILDER_HREF}>Собрать в конструкторе</a>
  </article></li>;
}

/**
 * What a guest and a robot get on `/battlegrounds/tier-list/` and `/battlegrounds/strategies/` in the server
 * HTML: every build of the base slice by tier, with its key minions, the conditions for going into it, an
 * example of the board, the base-range average place and popularity, and a link to the builder. The same
 * markup for everyone; the closed part (narrow rating ranges, fork analysis, trinkets by range) lives in
 * `.paywalled-builds` (see the page's JSON-LD). `null` is a list the source could not give.
 */
export function BattlegroundBuildsPublicList({ data }: { data: PublicBattlegroundBuilds | null }) {
  if (!data) return <p className="bg-builds-public" role="status">Сборки временно недоступны. Попробуйте позже.</p>;
  const date = seoDataDate(data.updatedAt, Date.now());
  return <div className="bg-builds-public">
    <p>
      {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : 'Дата обновления неизвестна'}
      {data.source ? ` · источник ${data.source}` : ''}
    </p>
    {TIERS.map(tier => {
      const builds = data.builds.filter(build => build.tier === tier);
      return builds.length ? <section key={tier} id={`tier-${tier.toLowerCase()}`} aria-labelledby={`tier-${tier.toLowerCase()}-title`}>
        <h2 id={`tier-${tier.toLowerCase()}-title`}><BattlegroundBuildTierBadge tier={tier} small /> Тир {tier}</h2>
        <ul className="bg-builds-public__list">{builds.map(build => <Build key={build.key} build={build} />)}</ul>
      </section> : null;
    })}
  </div>;
}
