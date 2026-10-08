import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, Search } from 'lucide-react';
import '../route-parchment.css';
import HsReplayDeckList from './HsReplayDeckList';
import DeckRenderPreview from './deckrender/DeckRenderPreview';
import './ViciousSyndicateGold.css';
import { BuildActions } from './viciousGold/BuildActions';
import { PowerTierBoard } from './viciousGold/PowerTierBoard';
import { ViciousGoldBanner, ViciousGoldLoading } from './viciousGold/ViciousGoldBanner';
import {
  classIcon, percent, shareOfLeader, thresholdPercent,
  type BuildState, type DeckBuild, type ViciousGoldPayload,
} from './viciousGold/viciousGoldModel';

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

export default function ViciousSyndicateGold() {
  const [data, setData] = useState<ViciousGoldPayload>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buildState, setBuildState] = useState<BuildState>('loading');
  const [revision, setRevision] = useState(0);
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

  const leadingClassShare = Math.max(0, ...data.classDistribution.map(item => item.frequency));
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

  if (loading || error) {
    return (
      <section className="vsgold space-y-5 sm:space-y-6">
        <ViciousGoldBanner />
        {loading ? <ViciousGoldLoading /> : <div className="vsgold__panel vsgold__state" role="alert">
          <AlertTriangle size={42} />
          <h2>Статистика временно недоступна</h2>
          <p>{error}</p>
          <button type="button" onClick={() => setRevision(value => value + 1)}><RefreshCw size={17} /> Повторить</button>
        </div>}
      </section>
    );
  }

  return (
    <div className="vsgold">
      <ViciousGoldBanner source={{ url: data.sourceUrl, updatedAt: data.updatedAt }}>
        <dl className="traditional-mode-banner__summary" aria-label="Сводка Vicious Syndicate Gold">
          <div><dt>Партий</dt><dd>{data.games.toLocaleString('ru-RU')}</dd></div>
          <div><dt>{buildState === 'loading' ? 'Догружаем сборки' : 'Готовых сборок'}</dt><dd>{buildState === 'loading' ? '…' : `${data.buildCoverage.found}/${data.buildCoverage.total}`}</dd></div>
        </dl>
      </ViciousGoldBanner>

      <nav className="vsgold__mobile-nav" aria-label="Разделы статистики">
        <a href="#vsgold-classes">Классы</a>
        <a href="#vsgold-decks">Колоды</a>
        <a href="#vsgold-power">Power Tier</a>
      </nav>

      <section className="vsgold__distribution-grid">
        <article className="vsgold__panel vsgold__classes" id="vsgold-classes" data-tour-id="vicious-classes">
          <header className="vsgold__section-heading">
            <img src="/main_assets/winrate-classes.png" alt="" width="52" height="52" decoding="async" />
            <div><span>Доля в партиях</span><h2>Распределение классов</h2></div>
          </header>
          <div className="vsgold__class-bars">
            {data.classDistribution.map(item => (
              <button key={item.class} type="button" aria-pressed={deckClass === item.class} onClick={() => selectDeckClass(item.class)}>
                <img src={classIcon(item.classIcon)} alt="" width="40" height="40" loading="lazy" decoding="async" />
                <span>{item.classLabel}</span>
                <div><i style={{ width: shareOfLeader(item.frequency, leadingClassShare) }} /></div>
                <strong>{percent(item.frequency)}</strong>
              </button>
            ))}
          </div>
        </article>

        <article ref={deckSectionRef} className="vsgold__panel vsgold__decks" id="vsgold-decks" data-tour-id="vicious-decks">
          <header className="vsgold__section-heading">
            <img src="/main_assets/tier-list.png" alt="" width="52" height="52" decoding="async" />
            <div><span>Популярность от {thresholdPercent(data.minimumDeckFrequency)}</span><h2>Распределение колод</h2></div>
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
                <header><div><span>Актуальная сборка</span><h3>{deck.deckLabel}</h3></div><a href={deck.build.sourceUrl} target="_blank" rel="noreferrer">Источник</a></header>
                <DeckRenderPreview deckCode={deck.build.deckCode} deckName={deck.deckLabel}>
                  <HsReplayDeckList cards={deck.build.deckCards || []} label={`Состав колоды ${deck.deckLabel}`} />
                </DeckRenderPreview>
              </section>}
            </React.Fragment>)}
            {!visibleDecks.length && <p className="vsgold__empty">По этому фильтру колод нет.</p>}
          </div>
        </article>
      </section>

      <PowerTierBoard tierList={data.tierList} classes={data.classDistribution} buildState={buildState}
        copiedDeck={copiedDeck} onCopy={copyDeck} />
    </div>
  );
}
