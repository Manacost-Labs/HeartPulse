import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Layers3,
  RefreshCw,
  Search,
  Swords,
} from 'lucide-react';
import '../route-parchment.css';
import HsReplayDeckList, { type HsReplayDeckCard } from './HsReplayDeckList';
import DeckRenderPreview from './deckrender/DeckRenderPreview';
import './ViciousSyndicateGold.css';

type DeckBuild = {
  deckCode: string;
  source: string;
  sourceLabel: string;
  sourceUrl: string;
  matchedArchetype: string;
  matchMethod: 'exact' | 'alias';
  updatedAt: string | null;
  winrate: number | null;
  sampleGames: number | null;
  deckCards: HsReplayDeckCard[];
};

type ClassDistribution = {
  class: string;
  classLabel: string;
  classIcon: string;
  frequency: number;
};

type DeckDistribution = ClassDistribution & {
  deck: string;
  deckLabel: string;
  build: DeckBuild | null;
};

type TierDeck = Omit<DeckDistribution, 'frequency'> & {
  rank: number;
  winrate: number;
};

type TierSection = {
  rankBracket: string;
  rankLabel: string;
  decks: TierDeck[];
};

type ViciousGoldPayload = {
  title: string;
  format: string;
  games: number;
  source: string;
  sourceUrl: string;
  updatedAt: string | null;
  minimumDeckFrequency: number;
  classDistribution: ClassDistribution[];
  deckDistribution: DeckDistribution[];
  tierList: TierSection[];
  buildCoverage: { found: number; total: number };
};

type ViciousGoldBuildsPayload = {
  builds: Array<{ deck: string; build: DeckBuild | null }>;
  buildCoverage: { found: number; total: number };
};

const EMPTY_DATA: ViciousGoldPayload = {
  title: 'Vicious Syndicate Gold',
  format: 'Standard',
  games: 0,
  source: 'Vicious Syndicate Live',
  sourceUrl: '',
  updatedAt: null,
  minimumDeckFrequency: 0.5,
  classDistribution: [],
  deckDistribution: [],
  tierList: [],
  buildCoverage: { found: 0, total: 0 },
};

function classIcon(icon: string): string {
  return `/class_icon/ui/${icon.replace(/-/g, '')}-64.webp`;
}

function formatDate(value: string | null): string {
  if (!value) return 'нет данных';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function percent(value: number): string {
  return `${PERCENT_FORMATTER.format(value)}%`;
}

const PERCENT_FORMATTER = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function powerTier(winrate: number): { id: string; label: string } {
  if (winrate >= 52) return { id: 'one', label: 'Tier 1' };
  if (winrate >= 50) return { id: 'two', label: 'Tier 2' };
  if (winrate >= 47) return { id: 'three', label: 'Tier 3' };
  return { id: 'four', label: 'Tier 4' };
}

function missingBuildLabel(deck: string, buildState: 'loading' | 'ready' | 'error'): string {
  if (/^(?:Other|Bot)\s/i.test(deck.replace(/^tier:/, ''))) return 'Сборная категория';
  if (buildState === 'loading') return 'Сборка загружается';
  if (buildState === 'error') return 'Сборка временно недоступна';
  return 'Сборка обновляется';
}

function BuildActions({ deck, build, buildState, copiedDeck, onCopy, onOpen, expanded }: {
  deck: string;
  build: DeckBuild | null;
  buildState: 'loading' | 'ready' | 'error';
  copiedDeck: string;
  onCopy: (deck: string, code: string) => void;
  onOpen?: (deck: string) => void;
  expanded?: boolean;
}) {
  if (!build) {
    const isAggregate = /^(?:Other|Bot)\s/i.test(deck.replace(/^tier:/, ''));
    return (
      <span className={isAggregate ? 'vsgold__build-aggregate' : 'vsgold__build-missing'}>
        {missingBuildLabel(deck, buildState)}
      </span>
    );
  }
  return (
    <div className="vsgold__build">
      <button
        type="button"
        className={`vsgold__build-copy-button${copiedDeck === deck ? ' vsgold__build-copy-button--copied' : ''}`}
        onClick={() => onCopy(deck, build.deckCode)}
        aria-label={copiedDeck === deck ? 'Код колоды скопирован' : `Скопировать код колоды ${deck.replace(/^tier:/, '')}`}
      >
        <img src="/assets/ui/deck-code-to-hearthstone.png" alt="" aria-hidden="true" width="1557" height="571" decoding="async" />
        <span className="vsgold__copy-feedback" aria-live="polite">
          {copiedDeck === deck ? 'Код колоды скопирован' : ''}
        </span>
      </button>
      {onOpen && <button type="button" className="vsgold__build-open" aria-expanded={expanded} onClick={() => onOpen(deck)}><Layers3 size={15} /> {expanded ? 'Скрыть' : 'Состав'}</button>}
      <span>{build.matchMethod === 'alias' ? `${build.sourceLabel} · точный синоним` : build.sourceLabel}</span>
    </div>
  );
}

export default function ViciousSyndicateGold() {
  const [data, setData] = useState<ViciousGoldPayload>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buildState, setBuildState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [revision, setRevision] = useState(0);
  const [rankBracket, setRankBracket] = useState('All ranks');
  const [powerClass, setPowerClass] = useState('all');
  const [deckClass, setDeckClass] = useState('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [copiedDeck, setCopiedDeck] = useState('');
  const [openDeckKey, setOpenDeckKey] = useState('');
  const deckSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    setLoading(true);
    setError('');
    setBuildState('loading');

    async function fetchBuilds() {
      try {
        const response = await fetch('/api/vicious-syndicate-gold/builds', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({})) as Partial<ViciousGoldBuildsPayload> & { error?: string };
        if (!response.ok || !Array.isArray(payload.builds) || !payload.buildCoverage) {
          throw new Error(payload.error || 'Не удалось загрузить сборки');
        }
        if (ignore) return;
        const buildsByDeck = new Map(payload.builds.map(item => [item.deck, item.build]));
        const buildCoverage = payload.buildCoverage;
        setData(summary => ({
          ...summary,
          deckDistribution: summary.deckDistribution.map(deck => ({
            ...deck,
            build: buildsByDeck.get(deck.deck) ?? null,
          })),
          tierList: summary.tierList.map(section => ({
            ...section,
            decks: section.decks.map(deck => ({
              ...deck,
              build: buildsByDeck.get(deck.deck) ?? null,
            })),
          })),
          buildCoverage,
        }));
        setBuildState('ready');
      } catch (loadError) {
        if (!ignore && !(loadError instanceof DOMException && loadError.name === 'AbortError')) {
          setBuildState('error');
        }
      }
    }

    async function fetchSummary() {
      try {
        const response = await fetch('/api/vicious-syndicate-gold', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить статистику');
        if (ignore) return;
        const summary = payload as ViciousGoldPayload;
        setData(summary);
        setRankBracket(summary.tierList[0]?.rankBracket ?? 'All ranks');
        void fetchBuilds();
      } catch (loadError) {
        if (!ignore && !(loadError instanceof DOMException && loadError.name === 'AbortError')) {
          setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить статистику');
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void fetchSummary();
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [revision]);

  const selectedTier = data.tierList.find(section => section.rankBracket === rankBracket) ?? data.tierList[0];
  const tierDecks = useMemo(
    () => (selectedTier?.decks ?? []).filter(deck => powerClass === 'all' || deck.class === powerClass),
    [selectedTier, powerClass],
  );
  const visibleDecks = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase('ru-RU');
    return data.deckDistribution.filter(deck => (
      (deckClass === 'all' || deck.class === deckClass)
      && (!needle || `${deck.deck} ${deck.deckLabel}`.toLocaleLowerCase('ru-RU').includes(needle))
    ));
  }, [data.deckDistribution, deckClass, deferredQuery]);

  const copyDeck = async (deck: string, code: string) => {
    let copied = false;
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch {
      const fallback = document.createElement('textarea');
      fallback.value = code;
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      fallback.select();
      copied = document.execCommand('copy');
      fallback.remove();
    }
    if (!copied) return;
    setCopiedDeck(deck);
    window.setTimeout(() => setCopiedDeck(current => current === deck ? '' : current), 1800);
  };

  const selectDeckClass = (classKey: string) => {
    setDeckClass(classKey);
    if (!window.matchMedia('(max-width: 1120px)').matches) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.requestAnimationFrame(() => deckSectionRef.current?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    }));
  };

  if (loading) {
    return (
      <section className="vsgold vsgold__state" aria-busy="true">
        <RefreshCw className="vsgold__spinner" size={38} />
        <h1>Загружаем Vicious Syndicate Gold</h1>
        <p>Собираем распределения, Power Tier и коды колод.</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="vsgold vsgold__state" role="alert">
        <AlertTriangle size={42} />
        <h1>Статистика временно недоступна</h1>
        <p>{error}</p>
        <button type="button" onClick={() => setRevision(value => value + 1)}><RefreshCw size={17} /> Повторить</button>
      </section>
    );
  }

  return (
    <div className="vsgold">
      <header className="traditional-mode-banner">
        <div className="traditional-mode-banner__copy">
          <h1>Vicious Syndicate Gold</h1>
          <p>Расширенная статистика меты: популярность, готовые сборки и Power Tier.</p>
        </div>
        <dl className="traditional-mode-banner__summary" aria-label="Сводка Vicious Syndicate Gold">
          <div><dt>Партий</dt><dd>{data.games.toLocaleString('ru-RU')}</dd></div>
          <div><dt>{buildState === 'loading' ? 'Догружаем сборки' : 'Готовых сборок'}</dt><dd>{buildState === 'loading' ? '…' : `${data.buildCoverage.found}/${data.buildCoverage.total}`}</dd></div>
        </dl>
      </header>

      <nav className="vsgold__mobile-nav" aria-label="Разделы статистики">
        <a href="#vsgold-classes">Классы</a>
        <a href="#vsgold-decks">Колоды</a>
        <a href="#vsgold-power">Power Tier</a>
      </nav>

      <section className="vsgold__distribution-grid">
        <article className="vsgold__panel vsgold__classes" id="vsgold-classes" data-tour-id="vicious-classes">
          <header className="vsgold__section-heading">
            <img src="/main_assets/winrate-classes.png" alt="" width="52" height="52" decoding="async" />
            <div><span>LIVE · STANDARD</span><h2>Распределение классов</h2></div>
          </header>
          <div className="vsgold__class-bars">
            {data.classDistribution.map(item => (
              <button key={item.class} type="button" aria-pressed={deckClass === item.class} onClick={() => selectDeckClass(item.class)}>
                <img src={classIcon(item.classIcon)} alt="" width="40" height="40" loading="lazy" decoding="async" />
                <span>{item.classLabel}</span>
                <div><i style={{ width: `${item.frequency}%` }} /></div>
                <strong>{percent(item.frequency)}</strong>
              </button>
            ))}
          </div>
        </article>

        <article ref={deckSectionRef} className="vsgold__panel vsgold__decks" id="vsgold-decks" data-tour-id="vicious-decks">
          <header className="vsgold__section-heading">
            <img src="/main_assets/tier-list.png" alt="" width="52" height="52" decoding="async" />
            <div><span>ПОРОГ ≥ {data.minimumDeckFrequency}%</span><h2>Распределение колод</h2></div>
          </header>
          <div className="vsgold__deck-tools">
            <label><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти архетип" /></label>
            <select value={deckClass} onChange={event => setDeckClass(event.target.value)} aria-label="Фильтр колод по классу">
              <option value="all">Все классы</option>
              {data.classDistribution.map(item => <option key={item.class} value={item.class}>{item.classLabel}</option>)}
            </select>
          </div>
          <div className="vsgold__deck-list">
            {visibleDecks.map((deck, index) => <React.Fragment key={deck.deck}>
              <div className="vsgold__deck-row" data-tour-id={index === 0 ? 'vicious-build-action' : undefined}>
                <img src={classIcon(deck.classIcon)} alt="" width="40" height="40" loading="lazy" decoding="async" />
                <div className="vsgold__deck-name"><strong>{deck.deckLabel}</strong><span>{deck.deck}</span></div>
                <b>{percent(deck.frequency)}</b>
                <BuildActions deck={deck.deck} build={deck.build} buildState={buildState} copiedDeck={copiedDeck} onCopy={copyDeck} expanded={openDeckKey === deck.deck} onOpen={key => setOpenDeckKey(current => current === key ? '' : key)} />
              </div>
              {openDeckKey === deck.deck && deck.build && <section className="vsgold__deck-composition" aria-label={`Состав колоды ${deck.deckLabel}`}>
                <header><div><span>АКТУАЛЬНАЯ СБОРКА</span><h3>{deck.deckLabel}</h3></div><a href={deck.build.sourceUrl} target="_blank" rel="noreferrer">Источник</a></header>
                <DeckRenderPreview deckCode={deck.build.deckCode} deckName={deck.deckLabel}>
                  <HsReplayDeckList cards={deck.build.deckCards || []} label={`Состав колоды ${deck.deckLabel}`} />
                </DeckRenderPreview>
              </section>}
            </React.Fragment>)}
            {!visibleDecks.length && <p className="vsgold__empty">По этому фильтру колод нет.</p>}
          </div>
        </article>
      </section>

      <section className="vsgold__panel vsgold__power" id="vsgold-power">
        <header className="vsgold__power-heading" data-tour-id="vicious-power">
          <div className="vsgold__section-heading">
            <img src="/main_assets/tier-list.png" alt="" width="52" height="52" loading="lazy" decoding="async" />
            <div><span>POWER RANKINGS</span><h2>Power Tier List</h2></div>
          </div>
          <p>Выберите диапазон рангов и класс. Винрейт и порядок берутся из Vicious Syndicate Live.</p>
        </header>

        <div className="vsgold__rank-tabs" role="tablist" aria-label="Диапазон рейтинга" data-tour-id="vicious-power-filters">
          {data.tierList.map(section => (
            <button
              key={section.rankBracket}
              type="button"
              role="tab"
              aria-selected={rankBracket === section.rankBracket}
              onClick={() => setRankBracket(section.rankBracket)}
            >{section.rankLabel}</button>
          ))}
        </div>
        <div className="vsgold__class-tabs" aria-label="Класс для Power Tier">
          <button type="button" aria-pressed={powerClass === 'all'} className={powerClass === 'all' ? 'active' : ''} onClick={() => setPowerClass('all')}><Swords size={15} /> Все</button>
          {data.classDistribution.map(item => (
            <button key={item.class} type="button" aria-pressed={powerClass === item.class} className={powerClass === item.class ? 'active' : ''} onClick={() => setPowerClass(item.class)}>
              <img src={classIcon(item.classIcon)} alt="" width="24" height="24" loading="lazy" decoding="async" /> {item.classLabel}
            </button>
          ))}
        </div>

        <div className="vsgold__tier-board">
          {tierDecks.map(deck => {
            const tier = powerTier(deck.winrate);
            return (
              <article className={`vsgold__tier-card vsgold__tier-card--${tier.id}`} key={`${rankBracket}:${deck.deck}`}>
                <span className="vsgold__tier-rank">#{deck.rank}</span>
                <img src={classIcon(deck.classIcon)} alt="" width="46" height="46" loading="lazy" decoding="async" />
                <div><small>{tier.label} · {deck.classLabel}</small><h3>{deck.deckLabel}</h3><p>{deck.deck}</p></div>
                <strong>{percent(deck.winrate)}<span>WR</span></strong>
                <BuildActions deck={`tier:${deck.deck}`} build={deck.build} buildState={buildState} copiedDeck={copiedDeck} onCopy={copyDeck} />
              </article>
            );
          })}
          {!tierDecks.length && <p className="vsgold__empty">Для этого класса в выбранном диапазоне пока нет Power Tier.</p>}
        </div>
      </section>
    </div>
  );
}
