import { useMemo, useState } from 'react';
import { Swords } from 'lucide-react';
import { BuildActions } from './BuildActions';
import {
  classIcon, deckCount, groupByPowerTier, percent,
  type BuildState, type ClassDistribution, type TierSection,
} from './viciousGoldModel';

export function PowerTierBoard({ tierList, classes, buildState, copiedDeck, onCopy }: {
  tierList: TierSection[];
  classes: ClassDistribution[];
  buildState: BuildState;
  copiedDeck: string;
  onCopy: (deck: string, code: string) => void;
}) {
  const [rankBracket, setRankBracket] = useState(() => tierList[0]?.rankBracket ?? 'All ranks');
  const [powerClass, setPowerClass] = useState('all');
  const selectedTier = tierList.find(section => section.rankBracket === rankBracket) ?? tierList[0];
  const bands = useMemo(
    () => groupByPowerTier((selectedTier?.decks ?? []).filter(deck => powerClass === 'all' || deck.class === powerClass)),
    [selectedTier, powerClass],
  );

  return (
    <section className="vsgold__panel vsgold__power" id="vsgold-power">
      <header className="vsgold__power-heading" data-tour-id="vicious-power">
        <div className="vsgold__section-heading">
          <img src="/main_assets/tier-list.png" alt="" width="52" height="52" loading="lazy" decoding="async" />
          <div><span>Винрейт по рангам</span><h2>Power Tier List</h2></div>
        </div>
        <p>Выберите диапазон рангов и класс. Винрейт и порядок берутся из Vicious Syndicate Live.</p>
      </header>

      <div className="vsgold__rank-tabs" role="tablist" aria-label="Диапазон рейтинга" data-tour-id="vicious-power-filters">
        {tierList.map(section => (
          <button key={section.rankBracket} type="button" role="tab" aria-selected={rankBracket === section.rankBracket}
            onClick={() => setRankBracket(section.rankBracket)}>{section.rankLabel}</button>
        ))}
      </div>
      <div className="vsgold__class-tabs" aria-label="Класс для Power Tier">
        <button type="button" aria-pressed={powerClass === 'all'} className={powerClass === 'all' ? 'active' : ''} onClick={() => setPowerClass('all')}><Swords size={15} /> Все</button>
        {classes.map(item => (
          <button key={item.class} type="button" aria-pressed={powerClass === item.class} className={powerClass === item.class ? 'active' : ''} onClick={() => setPowerClass(item.class)}>
            <img src={classIcon(item.classIcon)} alt="" width="24" height="24" loading="lazy" decoding="async" /> {item.classLabel}
          </button>
        ))}
      </div>

      {bands.map(band => (
        <section key={band.id} className={`vsgold__tier-band vsgold__tier-band--${band.id}`} aria-labelledby={`vsgold-tier-${band.id}`}>
          <header><h3 id={`vsgold-tier-${band.id}`}>{band.label}</h3><p>{band.range}, {deckCount(band.decks.length)}</p></header>
          <div className="vsgold__tier-board">
            {band.decks.map(deck => (
              <article className={`vsgold__tier-card vsgold__tier-card--${band.id}`} key={`${rankBracket}:${deck.deck}`}>
                <span className="vsgold__tier-rank">#{deck.rank}</span>
                <img src={classIcon(deck.classIcon)} alt="" width="46" height="46" loading="lazy" decoding="async" />
                <div><small>{deck.classLabel}</small><h4>{deck.deckLabel}</h4><p>{deck.deck}</p></div>
                <strong>{percent(deck.winrate)}<span>винрейт</span></strong>
                <BuildActions deck={`tier:${deck.deck}`} build={deck.build} buildState={buildState} copiedDeck={copiedDeck} onCopy={onCopy} />
              </article>
            ))}
          </div>
        </section>
      ))}
      {!bands.length && <p className="vsgold__empty">Для этого класса в выбранном диапазоне пока нет Power Tier.</p>}
    </section>
  );
}
