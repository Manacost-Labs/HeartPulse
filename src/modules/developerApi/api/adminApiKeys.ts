export type AdminApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: 'ACTIVE' | 'REVOKED';
};

export type CreatedAdminApiKey = {
  apiKey: string;
  key: AdminApiKey;
};

async function json<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (payload as { error?: { message?: string } }).error?.message;
    throw new Error(message || 'Не удалось выполнить запрос к API');
  }
  return payload as T;
}

export const adminApiKeysClient = {
  async list(): Promise<AdminApiKey[]> {
    const payload = await json<{ keys: AdminApiKey[] }>(await fetch('/api/admin/api-keys', {
      credentials: 'same-origin',
      headers: { 'X-CSRF-Request': '1' },
    }));
    return Array.isArray(payload.keys) ? payload.keys : [];
  },

  async create(name: string): Promise<CreatedAdminApiKey> {
    return json<CreatedAdminApiKey>(await fetch('/api/admin/api-keys', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' },
      body: JSON.stringify({ name, scopes: ['catalog.read'] }),
    }));
  },

  async revoke(id: string): Promise<void> {
    const response = await fetch(`/api/admin/api-keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Request': '1' },
    });
    if (!response.ok) await json(response);
  },
};

export type AdminApiKeysClient = typeof adminApiKeysClient;
