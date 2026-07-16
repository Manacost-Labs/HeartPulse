import React, { useCallback, useEffect, useState } from 'react';
import type { AdminMessage } from './adminWorkspaceState';

type MechanicItem = {
  key: string;
  nameEn: string;
  nameRu: string;
  source: 'manual' | 'default' | 'missing';
  cardCount: number;
  updatedAt: string | null;
  kind: 'mechanic' | 'tag' | 'both';
  example: null | {
    cardId: string;
    name?: { ru?: string | null; en?: string | null };
    imageUrl?: string | null;
    type?: string;
  };
};

type MechanicResponse = {
  items: MechanicItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  stats: { total: number; manual: number; default: number; missing: number; mechanics: number; tags: number };
};

const EMPTY_RESPONSE: MechanicResponse = {
  items: [], total: 0, page: 1, pageSize: 40, pages: 1,
  stats: { total: 0, manual: 0, default: 0, missing: 0, mechanics: 0, tags: 0 },
};

function headers(): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' };
}

function exampleName(item: MechanicItem): string {
  return item.example?.name?.ru || item.example?.name?.en || item.example?.cardId || 'Пример не найден';
}

export function ContestAdminMechanicTranslations({ onMessage }: { onMessage: (message: AdminMessage | null) => void }) {
  const [data, setData] = useState<MechanicResponse>(EMPTY_RESPONSE);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '40' });
    if (query.trim()) params.set('q', query.trim());
    if (status) params.set('status', status);
    if (kind) params.set('kind', kind);
    try {
      const response = await fetch(`/api/admin/mechanic-translations?${params}`, {
        headers: headers(), cache: 'no-store', credentials: 'same-origin', signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить механики');
      const next = payload as MechanicResponse;
      setData(next);
      setDrafts(current => next.items.reduce((result, item) => {
        result[item.key] = current[item.key] ?? item.nameRu;
        return result;
      }, {} as Record<string, string>));
    } catch (error) {
      if (signal?.aborted) return;
      onMessage({ type: 'err', text: error instanceof Error ? error.message : 'Не удалось загрузить механики' });
      setData(EMPTY_RESPONSE);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [kind, onMessage, page, query, status]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), query.trim() ? 220 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);

  const save = async (item: MechanicItem) => {
    setSavingKey(item.key);
    try {
      const response = await fetch(`/api/admin/mechanic-translations/${encodeURIComponent(item.key)}`, {
        method: 'PUT', headers: headers(), credentials: 'same-origin',
        body: JSON.stringify({ nameEn: item.nameEn, nameRu: drafts[item.key] || '' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить перевод');
      onMessage({ type: 'ok', text: `Перевод «${item.nameEn}» сохранён.` });
      await load();
    } catch (error) {
      onMessage({ type: 'err', text: error instanceof Error ? error.message : 'Не удалось сохранить перевод' });
    } finally {
      setSavingKey('');
    }
  };

  return (
    <div className="admin-translation-workspace admin-mechanic-workspace">
      <div className="admin-stat-grid admin-translation-stats" aria-label="Сводка переводов механик">
        <div className={data.stats.missing ? 'needs-attention' : 'is-complete'}><span>Механики и теги</span><strong>{data.stats.total}</strong><small>{data.stats.mechanics} механик · {data.stats.tags} тегов</small></div>
        <div className={data.stats.missing ? 'needs-attention' : 'is-complete'}><span>Без перевода</span><strong>{data.stats.missing}</strong><small>{data.stats.missing ? 'нужно заполнить' : 'всё переведено'}</small></div>
        <div><span>Ручные переводы</span><strong>{data.stats.manual}</strong><small>сохранены администраторами</small></div>
        <div><span>Базовые переводы</span><strong>{data.stats.default}</strong><small>можно переопределить</small></div>
      </div>

      <section className="contest-admin-card admin-translation-list-card" aria-labelledby="mechanic-translation-title">
        <div className="admin-card-heading">
          <div>
            <h2 id="mechanic-translation-title">Переводы механик</h2>
            <p className="contest-muted">Английская механика, пример карты и русский перевод. Для примера в первую очередь выбирается существо.</p>
          </div>
        </div>
        <div className="admin-list-toolbar admin-translation-toolbar admin-mechanic-toolbar">
          <label htmlFor="admin-mechanic-search">Поиск<input id="admin-mechanic-search" type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Механика или карта" /></label>
          <label htmlFor="admin-mechanic-status">Статус<select id="admin-mechanic-status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Все</option><option value="missing">Без перевода</option><option value="manual">Ручные</option><option value="default">Базовые</option></select></label>
          <label htmlFor="admin-mechanic-kind">Тип<select id="admin-mechanic-kind" value={kind} onChange={event => { setKind(event.target.value); setPage(1); }}><option value="">Все</option><option value="mechanic">Механики</option><option value="tag">Теги</option><option value="both">Оба типа</option></select></label>
        </div>

        <div className="admin-translation-table-wrap" aria-busy={loading}>
          <table className="admin-translation-table admin-mechanic-table">
            <caption className="sr-only">Переводы механик карт</caption>
            <thead><tr><th>English</th><th>Пример карты</th><th>Русский перевод</th><th aria-label="Действия" /></tr></thead>
            <tbody>{data.items.map(item => (
              <tr key={item.key}>
                <td><strong>{item.nameEn}</strong><small>{item.key} · {item.cardCount} карт · {item.kind === 'mechanic' ? 'механика' : item.kind === 'tag' ? 'тег' : 'механика + тег'}</small><span className={`admin-source-badge ${item.source === 'manual' ? 'is-manual' : ''}`}>{item.source === 'manual' ? 'Ручной' : item.source === 'default' ? 'Базовый' : 'Нет перевода'}</span></td>
                <td><div className="admin-mechanic-example">{item.example?.imageUrl && <img src={item.example.imageUrl} alt="" loading="lazy" />}<span><strong>{exampleName(item)}</strong><small>{item.example?.type || ''}</small></span></div></td>
                <td><label className="sr-only" htmlFor={`mechanic-${item.key}`}>Русский перевод для {item.nameEn}</label><input id={`mechanic-${item.key}`} value={drafts[item.key] ?? ''} onChange={event => setDrafts(current => ({ ...current, [item.key]: event.target.value }))} placeholder="Введите перевод" maxLength={120} /></td>
                <td><button type="button" className="contest-primary-button admin-mechanic-save" disabled={savingKey === item.key || !(drafts[item.key] || '').trim()} onClick={() => void save(item)}>{savingKey === item.key ? 'Сохраняем…' : 'Сохранить'}</button></td>
              </tr>
            ))}</tbody>
          </table>
          {!loading && !data.items.length && <p className="contest-muted admin-translation-empty" role="status">Механики не найдены.</p>}
          {loading && <p className="contest-muted admin-translation-empty" role="status">Загружаем механики и примеры карт…</p>}
        </div>
        {data.pages > 1 && <div className="admin-pagination"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Назад</button><span>Страница {data.page} из {data.pages}</span><button type="button" disabled={page >= data.pages || loading} onClick={() => setPage(value => value + 1)}>Дальше</button></div>}
      </section>
    </div>
  );
}
