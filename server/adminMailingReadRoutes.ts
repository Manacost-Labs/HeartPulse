import { Router, type Request, type Response } from 'express';

export type AdminMailingReadDependencies = {
  adminAuth: (request: Request) => unknown | null;
  overview: () => unknown;
  getCampaign: (campaignId: string) => unknown | null;
  serializeCampaign: (row: unknown) => unknown;
  setPrivateNoStore: (response: Response) => void;
};

function campaignId(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  return raw && raw.length <= 160 && /^[a-z0-9_-]+$/i.test(raw) ? raw : null;
}

export function createAdminMailingReadRouter(dependencies: AdminMailingReadDependencies): Router {
  const router = Router();
  const authorize = (request: Request, response: Response) => {
    dependencies.setPrivateNoStore(response);
    const admin = dependencies.adminAuth(request);
    if (!admin) response.status(403).json({ error: 'Недостаточно прав' });
    return Boolean(admin);
  };

  router.get('/admin/mailings/overview', (request, response) => {
    if (!authorize(request, response)) return;
    try {
      return response.json(dependencies.overview());
    } catch {
      return response.status(500).json({ error: 'Не удалось загрузить данные рассылок' });
    }
  });

  router.get('/admin/mailings/:campaignId', (request, response) => {
    if (!authorize(request, response)) return;
    const id = campaignId(request.params.campaignId);
    if (!id) return response.status(400).json({ error: 'Некорректный ID рассылки' });
    try {
      const row = dependencies.getCampaign(id);
      if (!row) return response.status(404).json({ error: 'Рассылка не найдена' });
      return response.json({ campaign: dependencies.serializeCampaign(row) });
    } catch {
      return response.status(500).json({ error: 'Не удалось загрузить рассылку' });
    }
  });

  return router;
}
