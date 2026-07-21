import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, RotateCcw, ServerCog } from 'lucide-react';
import type { AdminMessage } from '../adminWorkspaceState';

type Status = {
  generatedAt: string;
  publicRoutes: string[];
  diamondRoutes: string[];
  caches: Record<string, { entries: number; fresh?: number; active?: number; activeJobs?: number }>;
  deckView: { queued: number; active: number; succeeded: number; failed: number; timeoutMs: number };
  sources: { viciousSyndicate: string; cardStatistics: Record<string, string>; renderApi: string };
};

const EMPTY: Status = {
  generatedAt: '', publicRoutes: [], diamondRoutes: [], caches: {},
  deckView: { queued: 0, active: 0, succeeded: 0, failed: 0, timeoutMs: 0 },
  sources: { viciousSyndicate: '', cardStatistics: {}, renderApi: '' },
};

export function StandardOperationsLegacy({ onMessage }: { onMessage: (message: AdminMessage | null) => void }) {
  const [status, setStatus] = useState<Status>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/standard-operations', { credentials: 'same-origin', cache: 'no-store', signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить служебное состояние');
      setStatus(payload as Status);
    } catch (error) {
      if (!signal?.aborted) onMessage({ type: 'err', text: error instanceof Error ? error.message : 'Не удалось загрузить служебное состояние' });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const reset = async (target: 'meta' | 'recommendations' | 'previews' | 'all') => {
    setResetting(target);
    try {
      const response = await fetch('/api/admin/standard-operations/reset', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' },
        body: JSON.stringify({ target }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось очистить кеш');
      setStatus(payload.status as Status);
      onMessage({ type: 'ok', text: 'Кеш очищен. Следующий запрос получит свежие данные.' });
    } catch (error) {
      onMessage({ type: 'err', text: error instanceof Error ? error.message : 'Не удалось очистить кеш' });
    } finally {
      setResetting('');
    }
  };

  return (
    <details className="contest-admin-card admin-standard-operations__legacy">
      <summary><ServerCog size={20} /><span><strong>Кеши и DeckView</strong><small>Служебные инструменты традиционного режима</small></span><Chevron /></summary>
      <div className="admin-stat-grid" aria-label="Состояние DeckView и кешей">
        <div><span>DeckView очередь</span><strong>{status.deckView.queued}</strong><small>{status.deckView.active} выполняется</small></div>
        <div className={status.deckView.failed ? 'needs-attention' : 'is-complete'}><span>DeckView ошибки</span><strong>{status.deckView.failed}</strong><small>{status.deckView.succeeded} успешно</small></div>
        <div><span>Превью в кеше</span><strong>{status.caches.previews?.entries ?? 0}</strong><small>{status.caches.previews?.activeJobs ?? 0} активных задач</small></div>
        <div><span>Рекомендации</span><strong>{status.caches.recommendations?.entries ?? 0}</strong><small>{status.caches.recommendations?.active ?? 0} подбирается</small></div>
      </div>
      <div className="admin-standard-operations__legacy-body">
        <div className="admin-card-heading">
          <div><h2>Данные традиционного режима</h2><p className="contest-muted">Публичные страницы, источники и очистка локальных кешей приложения.</p></div>
          <button type="button" className="contest-secondary-button" disabled={loading} onClick={() => void load()}><RefreshCw size={16} /> Обновить</button>
        </div>
        <div className="admin-standard-operations__routes">
          {status.publicRoutes.map(route => <a key={route} data-access="public" href={route} target="_blank" rel="noreferrer"><ExternalLink size={15} /> {route} · открыто</a>)}
          {status.diamondRoutes.map(route => <a key={route} data-access="diamond" href={route} target="_blank" rel="noreferrer"><ExternalLink size={15} /> {route} · Алмаз</a>)}
        </div>
        <dl className="admin-standard-operations__sources">
          <div><dt>Vicious Syndicate</dt><dd>{status.sources.viciousSyndicate || '—'}</dd></div>
          <div><dt>Карты Standard</dt><dd>{status.sources.cardStatistics.standard || '—'}</dd></div>
          <div><dt>Карты Wild</dt><dd>{status.sources.cardStatistics.wild || '—'}</dd></div>
          <div><dt>DeckView API</dt><dd>{status.sources.renderApi || '—'}</dd></div>
        </dl>
        <div className="admin-standard-operations__actions" aria-label="Очистка кеша">
          {([['meta', 'Мета'], ['recommendations', 'Сборки'], ['previews', 'Превью'], ['all', 'Весь кеш']] as const).map(([target, label]) => (
            <button key={target} type="button" disabled={Boolean(resetting)} onClick={() => void reset(target)}><RotateCcw size={15} /> {resetting === target ? 'Очищаем…' : label}</button>
          ))}
        </div>
      </div>
    </details>
  );
}

function Chevron() {
  return <span className="admin-standard-operations__legacy-chevron" aria-hidden="true">⌄</span>;
}
