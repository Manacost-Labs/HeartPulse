import { useEffect, useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import '../route-parchment.css';
import './StandardMatchupsOpen.css';
import PaywallGate, { type PaywallAccessState } from '../components/PaywallGate';
import {
  loadPublicStandardMatchups, type PublicStandardMatchups, type PublicStandardMatchupsPair, type StandardMatchupsFormat,
} from '../modules/standardMatchups/public';

const MOSCOW_DATE = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit',
  year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** Moscow time, as the other open pages print it: the same text on the server and in the browser. */
function moscowDate(iso: string | null): string | null {
  return iso ? `${MOSCOW_DATE.format(new Date(iso)).replace(',', '')} МСК` : null;
}

/** Each format has its own address (and its own prerendered open slice), so the switch is two links. */
const FORMATS: ReadonlyArray<readonly [StandardMatchupsFormat, string, string]> = [
  ['standard', 'Стандарт', '/standard/matchups/'], ['wild', 'Вольный', '/standard/matchups/wild/'],
];
/** A pair with fewer games than this is muted: its rate is a rough guess. */
const SOLID_GAMES = 100;

/** Strong, even or weak matchup: one letter, the table is printed 900 times over. */
function band(pair: PublicStandardMatchupsPair): 's' | 'e' | 'w' | undefined {
  if (pair.winrate === null) return undefined;
  return pair.winrate >= 52 ? 's' : pair.winrate <= 48 ? 'w' : 'e';
}

/**
 * The open general slice of the matchup matrix (all ranks, the source's default period): the
 * guest's page and the robot's, server-rendered from the same projection. The paid filters and
 * the history of a pair sit behind a lock; the subscriber's matrix replaces this view only once
 * it is ready (StandardMatchupsPageClient).
 */
export function StandardMatchupsOpen({ initial, paywall, format = 'standard' }: {
  initial: PublicStandardMatchups | null;
  paywall: PaywallAccessState;
  /** The format of the address: `/standard/matchups/` is Standard, `/standard/matchups/wild/` is Wild. */
  format?: StandardMatchupsFormat;
}) {
  const [data, setData] = useState<PublicStandardMatchups | null>(initial);
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [attempt, setAttempt] = useState(0);
  const [offer, setOffer] = useState(false);

  // The server prints the most played archetypes of the page's format; the rest of the slice loads here.
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
          <h1>{format === 'wild' ? 'Матчапы Вольного формата' : 'Матчапы'}</h1>
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
            {FORMATS.map(([value, name, href]) => (
              <a key={value} href={href} aria-current={format === value ? 'page' : undefined}
                aria-label={`Показать матчапы: ${name}`}>{name}</a>
            ))}
          </div>
        </fieldset>
        <div className="standard-matchups__control-cluster paywalled-standard-matchups">
          <span className="standard-matchups__control-label">В подписке</span>
          <div className="standard-matchups-open__locks">
            {['Ранг', 'Период', 'Порог игр', 'История матчапов'].map(name => (
              <button key={name} type="button" data-locked-filter="" aria-expanded={offer}
                onClick={() => setOffer(true)}><Lock size={12} aria-hidden="true" />{name}</button>
            ))}
          </div>
        </div>
      </div>

      {offer ? (
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

      {shown ? <OpenMatrix data={shown} busy={status === 'loading'} />
        : status === 'failed' ? null : <div className="standard-matchups-open__empty" aria-busy="true">Загружаем матчапы…</div>}
    </section>
  );
}

function OpenMatrix({ data, busy }: { data: PublicStandardMatchups; busy: boolean }) {
  const { archetypes, pairs } = data;
  return (
    <div className="standard-matchups-open__scroll" aria-busy={busy}>
      <table className="standard-matchups-open__matrix">
        <caption className="sr-only">
          Винрейт архетипа по строке против архетипа по столбцу, % побед. Показаны {archetypes.length} самых популярных архетипов.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="standard-matchups-open__corner">Архетип</th>
            <th scope="col" className="standard-matchups-open__total">Винрейт</th>
            {archetypes.map(column => (
              <th key={column.name} scope="col" className="standard-matchups-open__column" data-class={column.classKey ?? undefined}>
                <span>{column.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {archetypes.map((row, rowIndex) => (
            <tr key={row.name}>
              <th scope="row" className="standard-matchups-open__row" data-class={row.classKey ?? undefined}>
                <span>{row.label}</span>
                <small>{[row.popularity, row.games ? `${row.games.toLocaleString('ru-RU')} игр` : null].filter(Boolean).join(' · ')}</small>
              </th>
              <td className="standard-matchups-open__total">{row.winrate === null ? '—' : row.winrate.toFixed(1)}</td>
              {pairs[rowIndex].map((pair, columnIndex) => (
                <td key={archetypes[columnIndex].name} data-b={pair ? band(pair) : undefined}
                  data-l={pair && pair.games < SOLID_GAMES ? '' : undefined}>
                  {pair && pair.winrate !== null ? pair.winrate.toFixed(1) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
