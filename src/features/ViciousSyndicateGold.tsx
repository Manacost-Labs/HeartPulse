import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { parsePublicViciousGold, VICIOUS_GOLD_PUBLIC_PATH, type PublicViciousGold } from '../../shared/viciousGoldPublicContract';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import { PaidMetricLock } from '../shared/ui/PaidLocks';
import { useHydrated } from '../shared/ui/useHydrated';
import '../route-parchment.css';
import '../vendor/varylo-ui/styles/index.css';
import './archetypeVaryloTheme.css';
import './ViciousSyndicateGold.css';
import { DeckShareList } from './viciousGold/DeckShareList';
import { MetaShare } from './viciousGold/MetaShare';
import { PowerTierBoard } from './viciousGold/PowerTierBoard';
import { ViciousGoldBanner, ViciousGoldLoading, ViciousGoldSummaryLoading } from './viciousGold/ViciousGoldBanner';
import { lockedPayload } from './viciousGold/viciousGoldOpen';
import { ViciousGoldReport } from './viciousGold/ViciousGoldReport';
import { reportWindowLabel, type BuildState, type DeckBuild, type ViciousGoldPayload } from './viciousGold/viciousGoldModel';

type ViciousGoldBuildsPayload = {
  builds: Array<{ deck: string; build: DeckBuild | null }>;
  buildCoverage: { found: number; total: number };
};

type ViciousGoldProps = {
  /** The open frame the server rendered (#656), or `null`: the page then reads it in the browser. */
  open?: PublicViciousGold | null;
  /** The viewer has the Standard subscription: the paid report replaces the open frame in place. */
  hasFullAccess?: boolean;
  /** A remembered viewer's access is still checked: the locks are not shown yet. */
  accessPending?: boolean;
  /** The paid route refused the viewer (401/403): the page asks for the access check again. */
  onAccessDenied?: () => void;
};

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/**
 * One view for everyone (#656): a guest gets the subscriber's report on the open frame (header, classes and
 * archetypes in a neutral order, the rank brackets), with a lock in the place of every closed value. A subscriber's
 * paid report replaces the frame in place; until it comes in, the frame shows with its locks hidden.
 */
export default function ViciousSyndicateGold({ open: initialOpen = null, hasFullAccess = false, accessPending = false, onAccessDenied }: ViciousGoldProps) {
  const [open, setOpen] = useState(initialOpen);
  const [openFailed, setOpenFailed] = useState(false);
  const [openRevision, setOpenRevision] = useState(0);
  const [data, setData] = useState<ViciousGoldPayload | null>(null);
  const [error, setError] = useState('');
  const [buildState, setBuildState] = useState<BuildState>('loading');
  const [revision, setRevision] = useState(0);
  const [deckClass, setDeckClass] = useState('all');
  const [copiedDeck, setCopiedDeck] = useState('');
  const deckSectionRef = useRef<HTMLDivElement>(null);
  const denied = useRef(onAccessDenied);
  useEffect(() => { denied.current = onAccessDenied; });
  const hydrated = useHydrated();
  const frame = useMemo(() => (open ? lockedPayload(open) : null), [open]);

  // The open frame the server could not render (a build without the API, a slow source): read here.
  useEffect(() => {
    if (open || hasFullAccess) return;
    const controller = new AbortController();
    setOpenFailed(false);
    fetchWithDeadline(VICIOUS_GOLD_PUBLIC_PATH, { headers: { Accept: 'application/json' }, signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(raw => {
        const parsed = parsePublicViciousGold(raw);
        if (parsed) setOpen(parsed);
        else setOpenFailed(true);
      }, loadError => { if (!isAbort(loadError)) setOpenFailed(true); });
    return () => controller.abort();
  }, [open, hasFullAccess, openRevision]);

  useEffect(() => {
    if (!hasFullAccess) return;
    const controller = new AbortController();
    let ignore = false;
    setData(null);
    setError('');
    setBuildState('loading');

    // Both reports start at once; the builds are merged after the summary they complete.
    const request = (url: string) => fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const summaryRequest = request('/api/vicious-syndicate-gold');
    const buildsRequest = request('/api/vicious-syndicate-gold/builds');
    // Either paid route refusing the viewer (401/403) means access was withdrawn: whichever answers first, the paid
    // data is dropped and the page goes to the open frame in the same render; the other read is cancelled.
    const refuse = () => {
      if (ignore) return;
      ignore = true;
      controller.abort();
      // Committed before the next paint: a refused viewer never gets one more frame of the paid report.
      flushSync(() => setData(null));
      denied.current?.();
    };
    const refusing = (response: Response) => response.status === 401 || response.status === 403;
    // A rejection is read by fetchBuilds after the summary; until then it must not be unhandled.
    buildsRequest.then(response => { if (refusing(response)) refuse(); }, () => undefined);

    async function fetchBuilds() {
      try {
        const response = await buildsRequest;
        const payload = await response.json().catch(() => ({})) as Partial<ViciousGoldBuildsPayload> & { error?: string };
        if (!response.ok || !Array.isArray(payload.builds) || !payload.buildCoverage) {
          throw new Error(payload.error || 'Не удалось загрузить сборки');
        }
        if (ignore) return;
        const buildsByDeck = new Map(payload.builds.map(item => [item.deck, item.build]));
        const buildCoverage = payload.buildCoverage;
        setData(summary => summary && ({
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
        if (!ignore && !isAbort(loadError)) {
          setBuildState('error');
        }
      }
    }

    async function fetchSummary() {
      try {
        const response = await summaryRequest;
        if (refusing(response)) return refuse();
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить статистику');
        if (ignore) return;
        const summary = payload as ViciousGoldPayload;
        setData(summary);
        void fetchBuilds();
      } catch (loadError) {
        if (!ignore && !isAbort(loadError)) {
          setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить статистику');
        }
      }
    }

    void fetchSummary();
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [hasFullAccess, revision]);

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

  const paid = hasFullAccess ? data : null;
  const failed = hasFullAccess ? Boolean(error) : !frame && openFailed;
  if (!paid && (failed || !frame)) {
    const retry = () => (hasFullAccess ? setRevision(value => value + 1) : setOpenRevision(value => value + 1));
    return (
      <section className="vsgold">
        <ViciousGoldBanner>{failed ? null : <ViciousGoldSummaryLoading />}</ViciousGoldBanner>
        {failed ? <div className="vsgold-section vsgold__state" role="alert">
          <AlertTriangle size={42} />
          <h2>Статистика временно недоступна</h2>
          <p>{error || 'Не удалось загрузить отчёт'}</p>
          <button type="button" onClick={retry}><RefreshCw size={17} /> Повторить</button>
        </div> : <ViciousGoldLoading />}
      </section>
    );
  }

  if (!paid && frame) {
    // A subscriber waiting for the paid report, or a remembered viewer whose access is checked: no lock flashes.
    // Server HTML has no `data-access-settled`, so a remembered viewer's locks stay hidden until hydration.
    const locksHidden = accessPending || hasFullAccess;
    const frameWindow = reportWindowLabel(frame.timeRanges?.tierLadder ?? frame.timeRanges?.distribution);
    return (
      <div className="vsgold" data-locked="" data-access-pending={locksHidden ? '' : undefined}
        data-access-settled={hydrated && !locksHidden ? '' : undefined}>
        <ViciousGoldBanner>
          <dl className="traditional-mode-banner__summary" aria-label="Сводка Vicious Syndicate Gold">
            <div><dt>Партий</dt><dd><PaidMetricLock label="Партий" closed="paywalled-vicious-gold" /></dd></div>
            <div><dt>Окно данных</dt><dd>{frameWindow?.replace(/^последние /, '') ?? '—'}</dd></div>
          </dl>
        </ViciousGoldBanner>

        <ViciousGoldReport data={frame} locked />

        <PowerTierBoard tierList={frame.tierList} classes={frame.classDistribution} copiedDeck="" onCopy={copyDeck} locked />

        <MetaShare classes={frame.classDistribution} decks={frame.deckDistribution} selectedClass={deckClass}
          onSelectClass={selectDeckClass} minimumFrequency={0} locked>
          <DeckShareList ref={deckSectionRef} decks={frame.deckDistribution} classes={frame.classDistribution}
            minimumFrequency={0} deckClass={deckClass} onDeckClassChange={setDeckClass}
            buildState="loading" buildCoverage={frame.buildCoverage} copiedDeck="" onCopy={copyDeck} locked />
        </MetaShare>
      </div>
    );
  }
  if (!paid) return null;

  const reportWindow = reportWindowLabel(paid.timeRanges?.tierLadder ?? paid.timeRanges?.distribution);
  return (
    <div className="vsgold">
      <ViciousGoldBanner>
        <dl className="traditional-mode-banner__summary" aria-label="Сводка Vicious Syndicate Gold">
          <div><dt>Партий</dt><dd>{paid.games.toLocaleString('ru-RU')}</dd></div>
          <div><dt>Окно данных</dt><dd>{reportWindow?.replace(/^последние /, '') ?? '—'}</dd></div>
        </dl>
      </ViciousGoldBanner>

      <ViciousGoldReport data={paid} />

      <PowerTierBoard tierList={paid.tierList} classes={paid.classDistribution} copiedDeck={copiedDeck} onCopy={copyDeck} />

      <MetaShare classes={paid.classDistribution} decks={paid.deckDistribution} selectedClass={deckClass}
        onSelectClass={selectDeckClass} minimumFrequency={paid.minimumDeckFrequency}>
        <DeckShareList ref={deckSectionRef} decks={paid.deckDistribution} classes={paid.classDistribution}
          minimumFrequency={paid.minimumDeckFrequency} deckClass={deckClass} onDeckClassChange={setDeckClass}
          buildState={buildState} buildCoverage={paid.buildCoverage} copiedDeck={copiedDeck} onCopy={copyDeck} />
      </MetaShare>
    </div>
  );
}
