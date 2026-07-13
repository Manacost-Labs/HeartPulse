import { Router, type Request, type RequestHandler, type Response } from 'express';
import { AdminMailingValidationError, type AdminMailingDraft } from './adminMailingPreviewRoutes.js';

export class AdminMailingDeliveryError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export type AdminMailingDeliveryDependencies = {
  adminGuard: RequestHandler;
  testLimiter: RequestHandler;
  sendLimiter: RequestHandler;
  adminAuth: (request: Request) => { id: string; email: string } | null;
  csrfAllowed: (request: Request) => boolean;
  signingSecretConfigured: () => boolean;
  normalizeDraft: (value: unknown) => AdminMailingDraft;
  isRealEmail: (email: string) => boolean;
  sendTest: (admin: { id: string; email: string }, draft: AdminMailingDraft) => Promise<void>;
  queueCampaign: (admin: { id: string; email: string }, draft: AdminMailingDraft, expectedRecipients: number, previewDigest: string) => { campaign: unknown; recipientCount: number };
  recordAudit: (admin: { id: string; email: string }, action: string, entityType: string, entityId: string, details: Record<string, unknown>) => void;
  scheduleCampaign: (campaignId: string) => void;
  setPrivateNoStore: (response: Response) => void;
  onSideEffectError?: (error: unknown, operation: string) => void;
};

export function createAdminMailingDeliveryRouter(dependencies: AdminMailingDeliveryDependencies): Router {
  const router = Router();
  const privateResponse: RequestHandler = (_request, response, next) => {
    dependencies.setPrivateNoStore(response);
    next();
  };
  const authorize = (request: Request, response: Response) => {
    const admin = dependencies.adminAuth(request);
    if (!admin) response.status(403).json({ error: 'Недостаточно прав' });
    return admin;
  };
  const requireCsrf = (request: Request, response: Response) => {
    if (dependencies.csrfAllowed(request)) return true;
    response.status(403).json({ error: 'Запрос отклонён: обновите страницу' });
    return false;
  };

  router.post('/admin/mailings/test', privateResponse, dependencies.adminGuard, dependencies.testLimiter, async (request, response) => {
    const admin = authorize(request, response);
    if (!admin || !requireCsrf(request, response)) return;
    if (!dependencies.signingSecretConfigured()) {
      return response.status(503).json({ error: 'На сервере не настроена безопасная ссылка отписки' });
    }
    if (!dependencies.isRealEmail(admin.email)) {
      return response.status(400).json({ error: 'У администратора нет подтверждённой почты для теста' });
    }
    let draft: AdminMailingDraft;
    try {
      draft = dependencies.normalizeDraft(request.body);
    } catch (error) {
      if (error instanceof AdminMailingValidationError) return response.status(400).json({ error: error.message });
      return response.status(500).json({ error: 'Не удалось подготовить тестовое письмо' });
    }
    try {
      await dependencies.sendTest(admin, draft);
    } catch {
      return response.status(502).json({ error: 'Почтовый транспорт не принял тестовое письмо' });
    }
    try {
      dependencies.recordAudit(admin, 'mailing.test-sent', 'mailing', 'test', { templateKey: draft.templateKey });
    } catch (error) {
      dependencies.onSideEffectError?.(error, 'test-audit');
    }
    return response.json({ success: true, message: `Тестовое письмо принято для ${admin.email}` });
  });

  router.post('/admin/mailings/send', privateResponse, dependencies.adminGuard, dependencies.sendLimiter, (request, response) => {
    const admin = authorize(request, response);
    if (!admin || !requireCsrf(request, response)) return;
    if (String(request.body?.confirmation || '') !== 'SEND') {
      return response.status(400).json({ error: 'Подтвердите массовую отправку' });
    }
    if (!dependencies.signingSecretConfigured()) {
      return response.status(503).json({ error: 'На сервере не настроена безопасная ссылка отписки' });
    }
    let draft: AdminMailingDraft;
    try {
      draft = dependencies.normalizeDraft(request.body);
    } catch (error) {
      if (error instanceof AdminMailingValidationError) return response.status(400).json({ error: error.message });
      return response.status(500).json({ error: 'Не удалось подготовить рассылку' });
    }
    const expectedRecipients = Number(request.body?.expectedRecipients);
    const previewDigest = String(request.body?.previewDigest || '').trim();
    let queued: { campaign: unknown; recipientCount: number };
    try {
      queued = dependencies.queueCampaign(admin, draft, expectedRecipients, previewDigest);
    } catch (error) {
      if (error instanceof AdminMailingDeliveryError) return response.status(error.status).json({ error: error.message });
      return response.status(500).json({ error: 'Не удалось поставить рассылку в очередь' });
    }
    const campaignId = String((queued.campaign as { id?: unknown } | null)?.id || '');
    try {
      dependencies.recordAudit(admin, 'mailing.queued', 'mailing_campaign', campaignId, {
        segment: draft.segment, recipientCount: queued.recipientCount, templateKey: draft.templateKey,
      });
    } catch (error) {
      dependencies.onSideEffectError?.(error, 'queue-audit');
    }
    try {
      dependencies.scheduleCampaign(campaignId);
    } catch (error) {
      dependencies.onSideEffectError?.(error, 'queue-schedule');
    }
    return response.status(202).json({ success: true, campaign: queued.campaign });
  });

  return router;
}
