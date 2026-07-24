import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpenText, ShieldCheck, Sparkles } from 'lucide-react';
import './Archetypes.css';
import ArchetypeHistoryChart from './ArchetypeHistoryChart';

type ArchetypeRow = {
  id: number | null;
  nameEn: string;
  nameRu: string;
  translated: boolean;
  classKey: string;
  classLabel: string;
  url: string | null;
  standard: boolean;
  wild: boolean;
  stats?: {
    winRate: number | null;
    popularity: number | null;
    games: number | null;
    turns: number | null;
    durationMinutes: number | null;
    climbingSpeed: number | null;
  };
};

type ArchetypesResponse = {
  count: number;
  translated: number;
  items: ArchetypeRow[];
};

type ArchetypeDetail = {
  snapshot: Record<string, any>;
  matchups: Array<Record<string, any>>;
  mulligan: Array<Record<string, any>>;
  decks: Array<Record<string, any>>;
  history: Array<Record<string, any>>;
};

const formatPercent = (value: unknown) => typeof value === 'number' ? `${value.toFixed(2)}%` : '—';
const formatNumber = (value: unknown) => typeof value === 'number' ? value.toLocaleString('ru-RU') : '—';

export default function ArchetypesPage({
  isAdmin = false,
  authChecking = false,
}: {
  isAdmin?: boolean;
  authChecking?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ArchetypesResponse | null>(null);
  const detailId = Number(window.location.pathname.match(/^\/archetypes\/(\d+)\/?$/)?.[1] || 0) || null;
  const wildDetail = window.location.pathname.replace(/\/+$/, '') === '/archetypes/wild';
  const wildArchetype = wildDetail ? new URLSearchParams(window.location.search).get('archetype') : null;
  const format = new URLSearchParams(window.location.search).get('format') === 'wild' ? 'wild' : 'standard';
  const [detail, setDetail] = useState<ArchetypeDetail | null>(null);
  const [detailUnavailable, setDetailUnavailable] = useState<string | null>(null);
  const [wildDecks, setWildDecks] = useState<Array<Record<string, any>>>([]);
  const [wildDecksLoading, setWildDecksLoading] = useState(false);
  const [wildDecksError, setWildDecksError] = useState<string | null>(null);

  useEffect(() => {
    if (authChecking || !isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        /*
         * Data path, deliberately kept server-side after this request:
         *
         * Browser → GET /api/admin/archetypes (admin cookie required)
         * HS-Arena server → HS_DATA_API_BASE_URL/api/hsreplay/archetypes?hl=en
         * HS Data API → HSReplay /api/v1/archetypes/?hl=en
         *
         * The Arena server combines the English HSReplay dictionary with our
         * archetype_translations table and fallback translation map. `nameRu`
         * equals `nameEn` when no approved Russian translation exists.
         * Do not fetch HSReplay from the browser: it is Cloudflare-protected
         * and its authenticated session belongs only to the data API.
         */
        const response = await fetch(`/api/admin/archetypes?format=${format}`, {
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'X-CSRF-Request': '1',
          },
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || `HTTP ${response.status}`);
        }
        const payload = await response.json() as ArchetypesResponse;
        if (!cancelled) setData(payload);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Не удалось загрузить архетипы');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authChecking, format, isAdmin]);

  const groups = useMemo(() => {
    const map = new Map<string, ArchetypeRow[]>();
    for (const item of data?.items || []) {
      /*
       * The server returns the HSReplay reference catalogue for Standard and
       * an HSGuru Wild-meta slice for Wild, so do not infer the format from a
       * historical HSReplay signature.
       */
      if (format === 'standard' && !item.standard) continue;
      const list = map.get(item.classLabel) || [];
      list.push(item);
      map.set(item.classLabel, list);
    }
    return [...map.entries()];
  }, [data, format]);

  useEffect(() => {
    if (authChecking || !isAdmin || !detailId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setDetail(null);
      setDetailUnavailable(null);
      try {
        const response = await fetch(`/api/admin/archetypes/${detailId}?format=${format}`, {
          credentials: 'include',
          headers: { Accept: 'application/json', 'X-CSRF-Request': '1' },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
        if (!payload?.available) {
          if (!cancelled) setDetailUnavailable(payload?.reason || 'Статистика недоступна.');
        } else if (!cancelled) {
          setDetail(payload.data as ArchetypeDetail);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Не удалось загрузить статистику архетипа');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authChecking, detailId, format, isAdmin]);

  useEffect(() => {
    if (authChecking || !isAdmin || !wildArchetype) return;
    let cancelled = false;
    (async () => {
      setWildDecksLoading(true);
      setWildDecksError(null);
      try {
        const response = await fetch(`/api/admin/archetypes/wild/decks?archetype=${encodeURIComponent(wildArchetype)}`, {
          credentials: 'include',
          headers: { Accept: 'application/json', 'X-CSRF-Request': '1' },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
        if (!cancelled) setWildDecks(Array.isArray(payload?.decks) ? payload.decks : []);
      } catch (err: any) {
        if (!cancelled) setWildDecksError(err?.message || 'Не удалось загрузить сборки');
      } finally {
        if (!cancelled) setWildDecksLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authChecking, isAdmin, wildArchetype]);

  if (authChecking) {
    return (
      <section className="archetypes-page">
        <div className="archetypes-status">Проверяем доступ…</div>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="archetypes-page">
        <div className="archetypes-denied hs-deck-frame">
          <ShieldCheck aria-hidden="true" />
          <h1>Архетипы</h1>
          <p>Раздел доступен только администраторам.</p>
          <a href="/?login">Войти в профиль</a>
        </div>
      </section>
    );
  }

  const FormatTabs = () => (
    <nav className="archetypes-format-tabs" aria-label="Формат архетипов">
      <a className={format === 'standard' ? 'is-active' : ''} href={detailId ? `/archetypes/${detailId}/?format=standard` : '/archetypes/?format=standard'}>Стандарт</a>
      <a className={format === 'wild' ? 'is-active' : ''} href={detailId ? `/archetypes/${detailId}/?format=wild` : '/archetypes/?format=wild'}>Вольный</a>
    </nav>
  );

  if (detailId) {
    return (
      <section className="archetypes-page">
        <header className="archetypes-hero hs-timber-frame">
          <a className="archetypes-back" href={`/archetypes/?format=${format}`}><ArrowLeft aria-hidden="true" /> Все архетипы</a>
          <div className="archetypes-hero__kicker"><BookOpenText aria-hidden="true" /> HSReplay · подробная статистика</div>
          <h1>{detail?.snapshot?.nameRu || detail?.snapshot?.name || `Архетип #${detailId}`}</h1>
          <FormatTabs />
        </header>
        {loading && <div className="archetypes-status">Загрузка статистики…</div>}
        {error && !loading && <p className="archetypes-error">{error}</p>}
        {detailUnavailable && !loading && <div className="archetypes-status">{detailUnavailable}</div>}
        {detail && !loading && (
          <div className="archetypes-detail">
            <section className="archetypes-detail__summary">
              <div><strong>{formatPercent(detail.snapshot.win_rate)}</strong><span>винрейт</span></div>
              <div><strong>{formatNumber(detail.snapshot.total_games)}</strong><span>игр</span></div>
              <div><strong>{formatPercent(detail.snapshot.pct_of_total)}</strong><span>доля меты</span></div>
              <div><strong>{detail.snapshot.as_of_popularity ? new Date(detail.snapshot.as_of_popularity).toLocaleDateString('ru-RU') : '—'}</strong><span>данные на</span></div>
            </section>

            <section className="archetypes-detail__panel">
              <h2>Сборки колод <span>{detail.decks.length}</span></h2>
              {detail.decks.map(deck => (
                <article className="archetypes-deck" key={deck.id}>
                  <div className="archetypes-deck__meta">
                    <strong>{formatPercent(deck.win_rate)}</strong><span>{formatNumber(deck.total_games)} игр</span>
                    <span>{deck.avg_num_player_turns ? `${Number(deck.avg_num_player_turns).toFixed(1)} ходов` : '—'}</span>
                    {deck.url && <a href={deck.url} target="_blank" rel="noreferrer">Открыть на HSReplay</a>}
                  </div>
                  <div className="archetypes-deck__cards">{(deck.cards || []).filter((card: any) => !card.sideboard).map((card: any) => <span key={`${card.id}-${card.dbf_id}`}>{card.count > 1 ? `${card.count}× ` : ''}{card.card_name || card.card_name_en}</span>)}</div>
                </article>
              ))}
              {!detail.decks.length && <p>Для текущего среза сборки не найдены.</p>}
            </section>

            <section className="archetypes-detail__panel">
              <h2>Муллиган <span>{detail.mulligan.length}</span></h2>
              <p className="archetypes-detail__source">
                HSReplay · {detail.snapshot.region === 'REGION_EU' ? 'Европа' : detail.snapshot.region || '—'} ·
                {' '}{detail.snapshot.rank_range || 'LEGEND'} · {detail.snapshot.mulligan_time_range === 'LAST_30_DAYS' ? 'последние 30 дней' : detail.snapshot.mulligan_time_range || '—'}
              </p>
              <div className="archetypes-table-wrap"><table><thead><tr>
                <th>#</th><th>Карта</th><th>Винрейт в стартовой</th><th>Оставляют</th><th>Винрейт при взятии</th><th>Винрейт при розыгрыше</th><th>Появлений</th><th>Оставили</th><th>Взяли</th><th>Разыграли</th><th>В руке, ходов</th><th>Ход розыгрыша</th>
              </tr></thead><tbody>{detail.mulligan.map(row => <tr key={row.dbf_id}>
                <td>{row.hsreplay_rank ?? '—'}</td><td>{row.card_name || row.card_name_en}</td><td>{formatPercent(row.opening_hand_winrate)}</td><td>{formatPercent(row.keep_percentage)}</td><td>{formatPercent(row.winrate_when_drawn)}</td><td>{formatPercent(row.winrate_when_played)}</td><td>{formatNumber(row.times_presented_in_initial_cards)}</td><td>{formatNumber(row.times_kept)}</td><td>{formatNumber(row.times_card_drawn)}</td><td>{formatNumber(row.times_card_played)}</td><td>{typeof row.avg_turns_in_hand === 'number' ? row.avg_turns_in_hand.toFixed(1) : '—'}</td><td>{typeof row.avg_turn_played_on === 'number' ? row.avg_turn_played_on.toFixed(1) : '—'}</td>
              </tr>)}</tbody></table></div>
            </section>

            <section className="archetypes-detail__panel">
              <h2>Матчапы <span>{detail.matchups.length}</span></h2>
              <div className="archetypes-table-wrap"><table><thead><tr><th>Соперник</th><th>Винрейт</th><th>Игр</th></tr></thead><tbody>{detail.matchups.map(row => <tr key={row.opponent_archetype_id}><td>{row.opponent_name}</td><td>{formatPercent(row.win_rate)}</td><td>{formatNumber(row.total_games)}</td></tr>)}</tbody></table></div>
            </section>

            <section className="archetypes-detail__panel">
              <h2>История показателей <span>{detail.history.length}</span></h2>
              <ArchetypeHistoryChart history={detail.history} />
            </section>
          </div>
        )}
      </section>
    );
  }

  if (wildArchetype) {
    return (
      <section className="archetypes-page">
        <header className="archetypes-hero hs-timber-frame">
          <a className="archetypes-back" href="/archetypes/?format=wild"><ArrowLeft aria-hidden="true" /> Все архетипы Вольного</a>
          <div className="archetypes-hero__kicker"><BookOpenText aria-hidden="true" /> HSGuru · сборки Вольного</div>
          <h1>{wildArchetype}</h1>
        </header>
        <div className="archetypes-detail">
          <section className="archetypes-detail__panel">
            <h2>Сборки колод <span>{wildDecks.length || '—'}</span></h2>
            {wildDecksLoading && <p>Загрузка сборок…</p>}
            {wildDecksError && <p className="archetypes-error">{wildDecksError}</p>}
            {!wildDecksLoading && !wildDecksError && wildDecks.map((deck, index) => (
              <article className="archetypes-deck" key={`${deck.url || deck.deck_code || index}`}>
                <div className="archetypes-deck__meta">
                  <strong>{formatPercent(deck.win_rate)}</strong>
                  <span>{formatNumber(deck.games)} игр</span>
                  {deck.url && <a href={deck.url} target="_blank" rel="noreferrer">Открыть на HSGuru</a>}
                </div>
                {deck.deck_code && <code className="archetypes-deck__code">{deck.deck_code}</code>}
              </article>
            ))}
            {!wildDecksLoading && !wildDecksError && !wildDecks.length && <p>Сборки с достаточной выборкой пока не найдены.</p>}
          </section>
        </div>
      </section>
    );
  }

  return (
    <section className="archetypes-page">
      <header className="archetypes-hero hs-timber-frame">
        <div className="archetypes-hero__kicker"><BookOpenText aria-hidden="true" /> Справочник администрации</div>
        <h1>Архетипы</h1>
        <p>
          {format === 'wild'
            ? 'Актуальная мета Вольного: HSGuru · все ранги · последние сутки · минимум 100 игр.'
            : 'Актуальные архетипы Стандарта из HSReplay с полной доступной статистикой. Русское название показываем только при наличии перевода в словаре Манакоста.'}
        </p>
        <div className="archetypes-hero__rule" />
        <FormatTabs />
        <div className="archetypes-hero__summary" aria-label="Статистика каталога">
          <div><strong>{groups.reduce((total, [, items]) => total + items.length, 0) || '—'}</strong><span>в формате</span></div>
          <div><strong>{data ? data.items.filter(item => item.translated).length : '—'}</strong><span>с переводом</span></div>
          <div><strong>{data ? data.items.filter(item => !item.translated).length : '—'}</strong><span>на английском</span></div>
        </div>
      </header>

      <div className="archetypes-directory">
        <div className="archetypes-directory__heading">
          <div>
            <span className="archetypes-kicker">HSReplay · полный словарь</span>
            <h2>Все архетипы по классам</h2>
          </div>
          <Sparkles aria-hidden="true" />
        </div>

        {loading && <div className="archetypes-status">Загрузка архетипов…</div>}
      {error && !loading && (
        <p className="archetypes-error">
          {error}
        </p>
      )}

        {!loading && !error && groups.map(([classLabel, items]) => (
          <section key={classLabel} className="archetypes-class">
            <h3>
              {classLabel} <span>{items.length}</span>
            </h3>
            <ol>
              {items.map((item, index) => (
                <li key={`${item.classKey}-${item.id ?? item.nameEn}`}>
                  <span className="archetypes-row__index">{index + 1}.</span>
                  <a
                    className="archetypes-row__name"
                    href={item.id != null
                      ? `/archetypes/${item.id}/?format=${format}`
                      : `/archetypes/wild/?archetype=${encodeURIComponent(item.nameEn)}`}
                  >
                    <strong>{item.nameRu}</strong>
                    {item.translated && item.nameRu !== item.nameEn && <small>{item.nameEn}</small>}
                    {!item.translated && <small className="archetypes-row__untranslated">перевод не добавлен</small>}
                    {item.stats && <small className="archetypes-row__stats">
                      {formatPercent(item.stats.winRate)} · {formatNumber(item.stats.games)} игр · {formatPercent(item.stats.popularity)} меты
                    </small>}
                  </a>
                  {item.id != null && <span className="archetypes-row__id">#{item.id}</span>}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </section>
  );
}
