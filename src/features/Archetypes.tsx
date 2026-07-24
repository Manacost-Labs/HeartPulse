import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpenText, Search, ShieldCheck, Sparkles } from 'lucide-react';
import './Archetypes.css';
import {
  ArchetypeDecksPanel,
  ArchetypeMatchupsPanel,
  ArchetypeMulliganPanel,
  type ArchetypeDetailData,
} from './ArchetypeDetailSections';
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

const formatPercent = (value: unknown) => typeof value === 'number' ? `${value.toFixed(2)}%` : '—';
const formatNumber = (value: unknown) => typeof value === 'number' ? value.toLocaleString('ru-RU') : '—';
const formatArchetypeCount = (count: number) => {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14
    ? 'архетипов'
    : last === 1
      ? 'архетип'
      : last >= 2 && last <= 4
        ? 'архетипа'
        : 'архетипов';
  return `${count} ${noun}`;
};

export default function ArchetypesPage({
  isAdmin = false,
  authChecking = false,
  currentPath = window.location.pathname,
}: {
  isAdmin?: boolean;
  authChecking?: boolean;
  currentPath?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ArchetypesResponse | null>(null);
  const [query, setQuery] = useState('');
  const detailId = Number(currentPath.match(/^\/archetypes\/(\d+)\/?$/)?.[1] || 0) || null;
  const [detail, setDetail] = useState<ArchetypeDetailData | null>(null);
  const [detailUnavailable, setDetailUnavailable] = useState<string | null>(null);

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
        const response = await fetch('/api/admin/archetypes?format=standard', {
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
  }, [authChecking, isAdmin]);

  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
    const map = new Map<string, { classKey: string; items: ArchetypeRow[] }>();
    for (const item of data?.items || []) {
      if (!item.standard) continue;
      const searchable = `${item.nameRu} ${item.nameEn} ${item.classLabel} ${item.id ?? ''}`.toLocaleLowerCase('ru-RU');
      if (normalizedQuery && !searchable.includes(normalizedQuery)) continue;
      const group = map.get(item.classLabel) || { classKey: item.classKey, items: [] };
      group.items.push(item);
      map.set(item.classLabel, group);
    }
    return [...map.entries()].map(([classLabel, group]) => ({ classLabel, ...group }));
  }, [data, query]);

  useEffect(() => {
    if (authChecking || !isAdmin || !detailId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setDetail(null);
      setDetailUnavailable(null);
      try {
        const response = await fetch(`/api/admin/archetypes/${detailId}?format=standard`, {
          credentials: 'include',
          headers: { Accept: 'application/json', 'X-CSRF-Request': '1' },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
        if (!payload?.available) {
          if (!cancelled) setDetailUnavailable(payload?.reason || 'Статистика недоступна.');
        } else if (!cancelled) {
          setDetail(payload.data as ArchetypeDetailData);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Не удалось загрузить статистику архетипа');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authChecking, detailId, isAdmin]);

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

  if (detailId) {
    return (
      <section className="archetypes-page">
        <header className="archetypes-hero hs-timber-frame">
          <div className="archetypes-hero__copy">
            <a className="archetypes-back" href="/archetypes/"><ArrowLeft aria-hidden="true" /> Все архетипы</a>
            <div className="archetypes-hero__kicker"><BookOpenText aria-hidden="true" /> HSReplay · подробная статистика</div>
            <h1>{detail?.snapshot?.nameRu || detail?.snapshot?.name || `Архетип #${detailId}`}</h1>
          </div>
          <div className="archetypes-format-badge"><Sparkles aria-hidden="true" /><span>Формат</span><strong>Стандарт</strong></div>
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

            <ArchetypeMulliganPanel rows={detail.mulligan} snapshot={detail.snapshot} />
            <ArchetypeMatchupsPanel rows={detail.matchups} />
            <ArchetypeDecksPanel decks={detail.decks} classKey={detail.snapshot.player_class} />

            <section className="archetypes-detail__panel">
              <h2>История показателей <span>{detail.history.length}</span></h2>
              <ArchetypeHistoryChart history={detail.history} />
            </section>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="archetypes-page">
      <header className="archetypes-hero hs-timber-frame">
        <div className="archetypes-hero__copy">
          <div className="archetypes-hero__kicker"><BookOpenText aria-hidden="true" /> Справочник администрации · Стандарт</div>
          <h1>Архетипы</h1>
          <p>
            Актуальный каталог Стандарта из HSReplay с полной доступной статистикой.
            Русское название показываем только при наличии перевода в словаре Манакоста.
          </p>
          <div className="archetypes-hero__rule" />
        </div>
        <div className="archetypes-hero__summary" aria-label="Статистика каталога">
          <div className="archetypes-hero__summary-primary">
            <strong>{data ? data.items.filter(item => item.standard).length : '—'}</strong>
            <span>архетипов Стандарта</span>
          </div>
          <div><strong>{data ? data.items.filter(item => item.standard && item.translated).length : '—'}</strong><span>с переводом</span></div>
          <div><strong>{data ? data.items.filter(item => item.standard && !item.translated).length : '—'}</strong><span>ожидают перевода</span></div>
        </div>
      </header>

      <div className="archetypes-directory">
        <div className="archetypes-directory__heading">
          <div>
            <span className="archetypes-kicker">Каталог Стандарта</span>
            <h2>По классам</h2>
          </div>
          <label className="archetypes-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Найти архетип</span>
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Название, класс или ID"
              autoComplete="off"
            />
          </label>
        </div>

        {loading && <div className="archetypes-status">Загрузка архетипов…</div>}
      {error && !loading && (
        <p className="archetypes-error">
          {error}
        </p>
      )}

        {!loading && !error && groups.length === 0 && (
          <div className="archetypes-empty">
            <Search aria-hidden="true" />
            <strong>Ничего не найдено</strong>
            <span>Попробуйте другое название, класс или номер архетипа.</span>
          </div>
        )}

        {!loading && !error && groups.length > 0 && (
          <div className="archetypes-grid">
          {groups.map(({ classLabel, classKey, items }) => (
          <section key={classLabel} className="archetypes-class" data-class={classKey}>
            <header className="archetypes-class__heading">
              <img src={`/class_icon/ui/${classKey}-64.webp`} alt="" width="56" height="56" loading="lazy" decoding="async" />
              <div>
                <span>{formatArchetypeCount(items.length)}</span>
                <h3>{classLabel}</h3>
              </div>
            </header>
            <ol>
              {items.map((item, index) => (
                <li key={`${item.classKey}-${item.id ?? item.nameEn}`}>
                  <span className="archetypes-row__index">{index + 1}.</span>
                  <a
                    className="archetypes-row__name"
                    href={item.id != null ? `/archetypes/${item.id}/` : undefined}
                    aria-disabled={item.id == null ? 'true' : undefined}
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
        )}
      </div>
    </section>
  );
}
