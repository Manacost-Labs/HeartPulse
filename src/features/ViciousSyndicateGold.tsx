import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import '../route-parchment.css';
import '../vendor/varylo-ui/styles/index.css';
import './archetypeVaryloTheme.css';
import './ViciousSyndicateGold.css';
import { DeckShareList } from './viciousGold/DeckShareList';
import { MetaShare } from './viciousGold/MetaShare';
import { PowerTierBoard } from './viciousGold/PowerTierBoard';
import { ViciousGoldBanner, ViciousGoldLoading } from './viciousGold/ViciousGoldBanner';
import { ViciousGoldReport } from './viciousGold/ViciousGoldReport';
import { reportWindowLabel, type BuildState, type DeckBuild, type ViciousGoldPayload } from './viciousGold/viciousGoldModel';

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
  const [copiedDeck, setCopiedDeck] = useState('');
  const deckSectionRef = useRef<HTMLDivElement>(null);

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
    if (classKey === 'all' || !window.matchMedia('(max-width: 1120px)').matches) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.requestAnimationFrame(() => deckSectionRef.current?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    }));
  };

  if (loading || error) {
    return (
      <section className="vsgold">
        <ViciousGoldBanner />
        {loading ? <ViciousGoldLoading /> : <div className="vsgold-section vsgold__state" role="alert">
          <AlertTriangle size={42} />
          <h2>Статистика временно недоступна</h2>
          <p>{error}</p>
          <button type="button" onClick={() => setRevision(value => value + 1)}><RefreshCw size={17} /> Повторить</button>
        </div>}
      </section>
    );
  }

  const reportWindow = reportWindowLabel(data.timeRanges?.tierLadder ?? data.timeRanges?.distribution);
  return (
    <div className="vsgold">
      <ViciousGoldBanner>
        <dl className="traditional-mode-banner__summary" aria-label="Сводка Vicious Syndicate Gold">
          <div><dt>Партий</dt><dd>{data.games.toLocaleString('ru-RU')}</dd></div>
          <div><dt>Окно данных</dt><dd>{reportWindow?.replace(/^последние /, '') ?? '—'}</dd></div>
        </dl>
      </ViciousGoldBanner>

      <ViciousGoldReport data={data} />

      <PowerTierBoard tierList={data.tierList} classes={data.classDistribution} copiedDeck={copiedDeck} onCopy={copyDeck} />

      <MetaShare classes={data.classDistribution} decks={data.deckDistribution} selectedClass={deckClass}
        onSelectClass={selectDeckClass} minimumFrequency={data.minimumDeckFrequency}>
        <DeckShareList ref={deckSectionRef} decks={data.deckDistribution} classes={data.classDistribution}
          minimumFrequency={data.minimumDeckFrequency} deckClass={deckClass} onDeckClassChange={setDeckClass}
          buildState={buildState} buildCoverage={data.buildCoverage} copiedDeck={copiedDeck} onCopy={copyDeck} />
      </MetaShare>

      <details className="vsgold-method">
        <summary>Как читать отчёт</summary>
        <p>Тир — по винрейту Power Tier против тех же порогов, что на странице меты: S от 53%, A от 51%, B от 49%, C от 47%, ниже — D. Vicious Syndicate не отдаёт число игр по каждому архетипу, поэтому доверительного интервала здесь нет.</p>
        <p>В диапазонах рангов рядом с винрейтом — разница в процентных пунктах с той же колодой на всех рангах. Истории прошлых отчётов в источнике нет, поэтому изменений со временем страница не показывает.</p>
      </details>
    </div>
  );
}
