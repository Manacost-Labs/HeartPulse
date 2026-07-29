import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, RefreshCw, ShieldX, X } from 'lucide-react';
import {
  adminApiKeysClient,
  type AdminApiKey,
  type AdminApiKeysClient,
  type CreatedAdminApiKey,
} from '../api/adminApiKeys';
import '../developerApi.css';

const formatDate = (value: string | null) => value
  ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
  : 'ещё не использовался';

export function AdminApiKeys({ client = adminApiKeysClient }: { client?: AdminApiKeysClient }) {
  const [keys, setKeys] = useState<AdminApiKey[]>([]);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<CreatedAdminApiKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      setKeys(await client.list());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось загрузить ключи');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const result = await client.create(name);
      setCreated(result);
      setKeys(current => [result.key, ...current]);
      setName('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось создать ключ');
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.apiKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage('Не удалось скопировать ключ. Выделите его и скопируйте вручную.');
    }
  };

  const revoke = async (key: AdminApiKey) => {
    if (!window.confirm(`Отозвать ключ «${key.name}»? Приложение сразу потеряет доступ.`)) return;
    setMessage('');
    try {
      await client.revoke(key.id);
      setKeys(current => current.map(item => item.id === key.id
        ? { ...item, status: 'REVOKED', revokedAt: new Date().toISOString() }
        : item));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось отозвать ключ');
    }
  };

  return (
    <section className="admin-api-keys" aria-labelledby="admin-api-keys-title">
      <div className="admin-api-keys-intro">
        <div><h2 id="admin-api-keys-title"><KeyRound size={22} /> Ключи приложений</h2>
          <p>Создавайте отдельный ключ для каждого приложения. Секрет повторно не показывается.</p></div>
        <a href="/developers/api/" target="_blank" rel="noreferrer">Документация API</a>
      </div>

      <form className="admin-api-key-form" onSubmit={create}>
        <label htmlFor="api-key-name">Название приложения</label>
        <div><input id="api-key-name" value={name} minLength={3} maxLength={80}
          onChange={event => setName(event.target.value)} placeholder="Например, Manacost Tracker" required />
          <button type="submit" disabled={saving}>{saving ? 'Создаём…' : 'Создать ключ'}</button></div>
        <small>Разрешение первого релиза: <code>catalog.read</code></small>
      </form>

      {created && (
        <div className="admin-api-key-secret" role="status" aria-live="polite">
          <div><strong>Скопируйте ключ сейчас</strong><span>После закрытия восстановить его нельзя.</span></div>
          <code>{created.apiKey}</code>
          <div className="admin-api-key-secret-actions">
            <button type="button" onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? 'Скопировано' : 'Скопировать'}</button>
            <button type="button" onClick={() => { setCreated(null); setCopied(false); }}><X />Закрыть</button>
          </div>
        </div>
      )}

      {message && <p className="admin-api-key-message" role="alert">{message}</p>}
      <div className="admin-api-key-list-heading">
        <h3>Выданные ключи</h3>
        <button type="button" onClick={() => void load()} disabled={loading}><RefreshCw />Обновить</button>
      </div>
      {loading ? <p role="status">Загружаем ключи…</p> : keys.length === 0 ? (
        <p className="admin-api-key-empty">Ключей пока нет. Создайте первый ключ для приложения.</p>
      ) : (
        <div className="admin-api-key-list">
          {keys.map(key => <article key={key.id} className={key.status === 'REVOKED' ? 'is-revoked' : ''}>
            <div><strong>{key.name}</strong><code>{key.prefix}••••</code></div>
            <dl><div><dt>Scope</dt><dd>{key.scopes.join(', ')}</dd></div>
              <div><dt>Последнее использование</dt><dd>{formatDate(key.lastUsedAt)}</dd></div>
              <div><dt>Статус</dt><dd>{key.status === 'ACTIVE' ? 'Активен' : 'Отозван'}</dd></div></dl>
            {key.status === 'ACTIVE' && <button type="button" onClick={() => void revoke(key)}><ShieldX />Отозвать</button>}
          </article>)}
        </div>
      )}
    </section>
  );
}
