import { useEffect, useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import '../route-parchment.css';
import './StandardMatchupsOpen.css';
import { setPageFormat, usePageFormat } from '../shared/navigation/pageFormat';
import PaywallGate, { type PaywallAccessState } from '../components/PaywallGate';
import {
  loadPublicStandardMatchups, type PublicStandardMatchups, type StandardMatchupsFormat,
} from '../modules/standardMatchups/public';
import { OpenMatrix } from './StandardMatchupsOpenMatrix';

const MOSCOW_DATE = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit',
  year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** Moscow time, as the other open pages print it: the same text on the server and in the browser. */
function moscowDate(iso: string | null): string | null {
  return iso ? `${MOSCOW_DATE.format(new Date(iso)).replace(',', '')} МСК` : null;
}

const FORMATS: ReadonlyArray<readonly [StandardMatchupsFormat, string]> = [['standard', 'Стандарт'], ['wild', 'Вольный']];

const FILTER_NAMES = ['Ранг', 'Период', 'Порог игр', 'История матчапов'];

/**
 * The open general slice of the matchup matrix (all ranks, the source's default period): the
 * guest's page and the robot's, server-rendered from the same projection. The paid filters and
 * the history of a pair sit behind a lock; the subscriber's matrix replaces this view only once
 * it is ready (StandardMatchupsPageClient).
 */
export function StandardMatchupsOpen({ initial, paywall, accessConfirmed = false }: {
  initial: PublicStandardMatchups | null;
  paywall: PaywallAccessState;
  /** The reader's access to the paid view is confirmed (a subscriber, an administrator) and its data is on the way. */
  accessConfirmed?: boolean;
}) {
  // Nobody who has access, or whose access is still being checked, is shown a lock or an offer: the locks are for
  // a guest and a reader without a subscription. The server prints the guest's locks.
  const unlocking = accessConfirmed || (paywall.authUser != null && paywall.subscriptionLoading);
  // The format is the address's (`?format=wild`, the menu's «Вольный» opens it): Standard until the browser has read it,
  // so the server's HTML and the first render agree.
  const format: StandardMatchupsFormat = usePageFormat() ?? 'standard';
  const [data, setData] = useState<PublicStandardMatchups | null>(initial);
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [attempt, setAttempt] = useState(0);
  const [offer, setOffer] = useState(false);

  // The server prints the most played archetypes of Standard; the rest of the slice and the other format load here.
  const complete = data?.format === format && !data.truncated;
  useEffect(() => {
    if (complete) return undefined;
    const controller = new AbortController();
    setStatus('loading');
    void loadPublicStandardMatchups(format, { signal: controller.signal }).then(next => {
      if (controller.signal.aborted) return;
      if (next) setData(next);
      setStatus(next ? 'idle' : 'failed');
    });
    return () => controller.abort();
  }, [format, complete, attempt]);

  // The other format's numbers never stay under the chosen one: until its answer comes, there is no matrix.
  const shown = data?.format === format ? data : null;
  const updated = moscowDate(shown?.updatedAt ?? null);
  const label = FORMATS.find(([value]) => value === format)?.[1] ?? '';
  return (
    <section className="standard-matchups standard-matchups-open space-y-5 sm:space-y-6" id="matchups-overview">
      <header className="traditional-mode-banner">
        <div className="traditional-mode-banner__copy">
          <h1>Матчапы</h1>
          {shown ? (
            <p className="standard-matchups-open__line">
              {label} · {shown.rankLabel || 'Все ранги'} · от {shown.minGames} игр в паре
              {updated && shown.updatedAt ? <> · данные на <time dateTime={shown.updatedAt}>{updated}</time></> : null}
              {' · источник '}
              {/^https:\/\/(?:www\.)?hsguru\.com\//.test(shown.sourceUrl)
                ? <a href={shown.sourceUrl} rel="noopener noreferrer">HSGuru</a> : 'HSGuru'}
            </p>
          ) : null}
        </div>
      </header>

      <div className="standard-matchups__mode-toolbar" aria-label="Настройки отображения матчапов">
        <fieldset className="standard-matchups__control-cluster">
          <legend className="sr-only">Формат игры</legend>
          <span className="standard-matchups__control-label" aria-hidden="true">Формат</span>
          <div className="standard-matchups__rank-switcher standard-matchups__segmented">
            {FORMATS.map(([value, name]) => (
              <button key={value} type="button" aria-pressed={format === value} aria-label={`Показать матчапы: ${name}`}
                onClick={() => setPageFormat(value)}>{name}</button>
            ))}
          </div>
        </fieldset>
        <div className="standard-matchups__control-cluster paywalled-standard-matchups">
          <span className="standard-matchups__control-label">{unlocking ? 'Фильтры' : 'В подписке'}</span>
          <div className="standard-matchups-open__locks" aria-busy={unlocking || undefined}>
            {unlocking ? <span className="sr-only" role="status">Загружаем фильтры</span> : null}
            {FILTER_NAMES.map(name => unlocking ? (
              <span key={name} className="standard-matchups-open__pending" data-pending-filter="">{name}</span>
            ) : (
              <button key={name} type="button" data-locked-filter="" aria-expanded={offer}
                onClick={() => setOffer(true)}><Lock size={12} aria-hidden="true" />{name}</button>
            ))}
          </div>
        </div>
      </div>

      {offer && !unlocking ? (
        <div id="standard-matchups-paywall">
          <PaywallGate active presentation="inline" variant="standard" headingLevel="h2"
            title="Ранги, периоды и история матчапов — в подписке"
            description="Общий срез по всем рангам открыт всем. Тариф «Алмаз» открывает матчапы по отдельным рангам, периоды патчей, порог игр и историю матчапов."
            benefits={['Матчапы Легенды, Топ-1000 и Алмаза', 'Периоды патчей и порог игр в паре', 'История матчапов архетипа']}
            {...paywall} />
        </div>
      ) : null}

      {status === 'failed' ? (
        <div className="standard-matchups__error flex flex-wrap items-center gap-2 text-sm" role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{shown ? 'Не удалось загрузить формат «' + (FORMATS.find(([value]) => value === format)?.[1] ?? '') + '».' : 'Данные временно недоступны.'}</span>
          <button type="button" onClick={() => setAttempt(value => value + 1)}>Повторить</button>
        </div>
      ) : null}

      {shown ? <OpenMatrix key={shown.format} data={shown} busy={status === 'loading'} />
        : status === 'failed' ? null : <div className="standard-matchups-open__empty" aria-busy="true">Загружаем матчапы…</div>}
    </section>
  );
}
