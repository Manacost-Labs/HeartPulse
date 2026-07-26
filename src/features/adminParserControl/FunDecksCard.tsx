import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, RefreshCw, Sparkles } from 'lucide-react';

type FunDeckRow = {
  title: string;
  deckCode: string;
  format: string;
  className: string;
  streamer: string | null;
  funScore: number | null;
  maxMetaSimilarity: number | null;
  nearestArchetype: string | null;
  winRate: number | null;
  games: number | null;
  reasons: string[];
  url: string | null;
};

type FunDecksPayload = {
  fetchedAt: string | null;
  detectorVersion: string | null;
  stats: Record<string, unknown>;
  cadence: {
    label: string;
    timers: string[];
    schedule: string;
  };
  decks: FunDeckRow[];
};

type FormatFilter = 'all' | 'Standard' | 'Wild';

async function fetchFunDecks(signal?: AbortSignal): Promise<FunDecksPayload> {
  const response = await fetch('/api/admin/fun-decks', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = await response.json().catch(() => ({})) as FunDecksPayload & { error?: string };
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Не удалось загрузить фановые колоды');
  }
  return payload;
}

function formatPercent(value: number | null, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}%`;
}

function formatScore(value: number | null): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(2);
}

function formatSimilarity(value: number | null): string {
  return value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(area);
      return copied;
    } catch {
      return false;
    }
  }
}

export default function FunDecksCard() {
  const [payload, setPayload] = useState<FunDecksPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<FormatFilter>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const next = await fetchFunDecks(signal);
      if (signal?.aborted) return;
      setPayload(next);
      setError(null);
    } catch (caught) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить фановые колоды');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (!copiedCode) return;
    const timer = window.setTimeout(() => setCopiedCode(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copiedCode]);

  const decks = useMemo(() => {
    const rows = payload?.decks ?? [];
    return format === 'all'
      ? rows
      : rows.filter(row => row.format.toLowerCase() === format.toLowerCase());
  }, [format, payload]);
  const published = payload?.stats.published_by_format as Record<string, number> | undefined;

  return (
    <section className="contest-admin-card admin-parser-card admin-fun-decks" aria-labelledby="fun-decks-title">
      <div className="admin-card-heading admin-parser-card__heading">
        <div>
          <h2 id="fun-decks-title"><Sparkles size={21} /> Фановые / off-meta колоды</h2>
          <p className="contest-muted">
            Концептуальные сборки с кодами для быстрой проверки. Пока только в админке.
            {' '}Обновление: {payload?.cadence.schedule ?? 'по расписанию парсера'}.
          </p>
        </div>
        <button
          type="button"
          className="contest-secondary-button"
          onClick={() => void reload()}
          disabled={loading}
        >
          <RefreshCw size={16} /> {loading ? 'Загрузка…' : 'Обновить'}
        </button>
      </div>

      {error && <p className="admin-parser-empty" role="alert">{error}</p>}

      {payload && (
        <>
          <div className="admin-parser-overview admin-fun-decks__stats" aria-label="Сводка фановых колод">
            <div>
              <span>В выборке</span>
              <strong>{payload.decks.length}</strong>
              <small>Std {published?.standard ?? '—'} · Wild {published?.wild ?? '—'}</small>
            </div>
            <div>
              <span>Детектор</span>
              <strong>{payload.detectorVersion || '—'}</strong>
              <small>обновлено {formatDate(payload.fetchedAt)}</small>
            </div>
            <div>
              <span>Расписание</span>
              <strong>:15 / :45</strong>
              <small>{payload.cadence.label}</small>
            </div>
            <div>
              <span>Отсечено</span>
              <strong>{typeof payload.stats.rejected === 'number' ? payload.stats.rejected : '—'}</strong>
              <small>из {typeof payload.stats.candidates === 'number' ? payload.stats.candidates : '—'} кандидатов</small>
            </div>
          </div>

          <div className="admin-fun-decks__filters" role="group" aria-label="Фильтр формата">
            {([
              ['all', 'Все'],
              ['Standard', 'Standard'],
              ['Wild', 'Wild'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={format === value ? 'is-active' : ''}
                aria-pressed={format === value}
                onClick={() => setFormat(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {!decks.length && <p className="admin-parser-empty" role="status">По выбранному фильтру колод нет.</p>}

          <div className="admin-fun-decks__list" aria-live="polite">
            {decks.map(deck => (
              <article key={`${deck.format}:${deck.deckCode}`} className="admin-fun-decks__item">
                <div className="admin-fun-decks__item-head">
                  <div>
                    <h3>{deck.title}</h3>
                    <p>
                      <span>{deck.format}</span>
                      <span>{deck.className}</span>
                      {deck.streamer && <span>{deck.streamer}</span>}
                      {deck.nearestArchetype && <span>рядом: {deck.nearestArchetype}</span>}
                    </p>
                  </div>
                  <div className="admin-fun-decks__metrics">
                    <span>fun {formatScore(deck.funScore)}</span>
                    <span>sim {formatSimilarity(deck.maxMetaSimilarity)}</span>
                    <span>WR {formatPercent(deck.winRate)}</span>
                    <span>{deck.games ?? '—'} игр</span>
                  </div>
                </div>

                {deck.reasons.length > 0 && (
                  <div className="admin-fun-decks__reasons">
                    {deck.reasons.map(reason => <span key={reason}>{reason}</span>)}
                  </div>
                )}

                <div className="admin-fun-decks__code-row">
                  <code title={deck.deckCode}>{deck.deckCode}</code>
                  <button
                    type="button"
                    className="contest-secondary-button"
                    onClick={() => {
                      void copyText(deck.deckCode).then(copied => {
                        if (copied) setCopiedCode(deck.deckCode);
                      });
                    }}
                  >
                    <Copy size={15} /> {copiedCode === deck.deckCode ? 'Скопировано' : 'Код'}
                  </button>
                  {deck.url && (
                    <a className="contest-secondary-button" href={deck.url} target="_blank" rel="noreferrer">
                      <ExternalLink size={15} /> HSGuru
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {loading && !payload && !error && (
        <p className="admin-parser-empty" role="status">Загружаем фановые колоды…</p>
      )}
    </section>
  );
}
