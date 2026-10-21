import { useMemo } from 'react';
import { TierBadge } from '../modules/arenaTierList/public';
import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import type { StandardMetaItem } from '../../shared/standardMetaContract';
import { standardMetaClassIcon } from './standardMetaClassModel';
import { STANDARD_META_LOW_SAMPLE_GAMES, standardMetaTierGroups, type StandardMetaTierEntry } from './standardMetaTableModel';
import './StandardMetaTierGroups.css';

const percent = (value: number) => `${value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const archetypes = (count: number) => {
  const tens = count % 100;
  const ones = count % 10;
  const word = tens >= 11 && tens <= 14 ? 'архетипов' : ones === 1 ? 'архетип' : ones >= 2 && ones <= 4 ? 'архетипа' : 'архетипов';
  return `${count} ${word}`;
};

export type StandardMetaTierGroupsProps = {
  items: StandardMetaItem[];
  format: 'standard' | 'wild';
  formatLabel: string;
  rankLabel: string;
  periodLabel: string;
  minGames: number;
};

/**
 * The meta as tiers S–D: a header with the tier's floor and count, then the
 * archetypes as compact chips (class, name, win rate), best bound first.
 */
export default function StandardMetaTierGroups({ items, format, formatLabel, rankLabel, periodLabel, minGames }: StandardMetaTierGroupsProps) {
  const groups = useMemo(() => standardMetaTierGroups(items), [items]);
  const ranked = groups.reduce((sum, group) => sum + group.entries.length, 0);
  return (
    <section className="standard-meta-tier-groups" data-meta-surface="tiers" aria-labelledby="standard-meta-tier-groups-title">
      <header className="standard-meta-tier-groups__header">
        <div>
          <h2 id="standard-meta-tier-groups-title">Тиры архетипов</h2>
          <p>{formatLabel} · {rankLabel} · {periodLabel} · {archetypes(ranked)}</p>
        </div>
        <details className="standard-meta-tier-groups__method">
          <summary>Как считается тир</summary>
          <p>
            Тир ставится по нижней границе 90% доверительного интервала Уилсона для винрейта, а не по самому винрейту:
            S — граница от 53%, A — от 51%, B — от 49%, C — от 47%, ниже — D. Чем меньше игр, тем ниже граница, поэтому
            редкий архетип с высоким винрейтом может стоять тиром ниже уверенного.
          </p>
          <p>
            В срезе только архетипы от {minGames.toLocaleString('ru-RU')} игр (фильтр «Минимум игр»). Бледные плашки — меньше
            {' '}{STANDARD_META_LOW_SAMPLE_GAMES.toLocaleString('ru-RU')} игр: оценка приблизительная. Внутри тира — по убыванию границы.
          </p>
        </details>
      </header>
      {groups.map(group => (
        <section key={group.tier} className="standard-meta-tier-groups__tier" data-tier={group.tier} aria-labelledby={`standard-meta-tier-${group.tier}`}>
          <div className="standard-meta-tier-groups__tier-head">
            <TierBadge tier={group.tier} />
            <div>
              <h3 id={`standard-meta-tier-${group.tier}`}>Тир {group.tier}</h3>
              <small>{group.floor === null ? 'граница ниже 47%' : `граница от ${group.floor}%`} · {archetypes(group.entries.length)}</small>
            </div>
          </div>
          {group.entries.length ? (
            <ul className="standard-meta-tier-groups__chips">
              {group.entries.map(entry => (
                <li key={entry.item.id}>
                  <TierChip entry={entry} href={canonicalPagePath(`/standard/archetypes/${format}/${entry.item.slug}`)} />
                </li>
              ))}
            </ul>
          ) : <p className="standard-meta-tier-groups__empty">Нет архетипов в этом тире.</p>}
        </section>
      ))}
    </section>
  );
}

function TierChip({ entry, href }: { entry: StandardMetaTierEntry; href: string }) {
  const { item, estimate, bound } = entry;
  const games = item.games?.toLocaleString('ru-RU') ?? '—';
  const details = `${percent(estimate.winrate)} · ${games} игр · 95% интервал ${percent(estimate.low)}–${percent(estimate.high)} · граница тира ${percent(bound)}`;
  return (
    <a className="standard-meta-tier-groups__chip" href={href} title={`${item.archetype}: ${details}`} data-low-sample={estimate.lowSample ? '' : undefined}>
      <img src={standardMetaClassIcon(item.classKey)} alt="" width="24" height="24" loading="lazy" decoding="async" />
      <span className="standard-meta-tier-groups__chip-name">{item.archetypeLabel}</span>
      <strong>{percent(estimate.winrate)}</strong>
      <span className="sr-only">, {games} игр{estimate.lowSample ? ', мало игр' : ''}</span>
    </a>
  );
}
