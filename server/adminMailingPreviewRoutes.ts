import { Router, type Request, type Response } from 'express';

export type AdminMailingDraft = {
  subject: string;
  preheader: string;
  htmlBody: string;
  textBody: string;
  segment: 'all-consented' | 'active' | 'former';
  templateKey: string;
};

export type AdminMailingPreviewDependencies = {
  adminAuth: (request: Request) => unknown | null;
  csrfAllowed: (request: Request) => boolean;
  signingSecretConfigured: () => boolean;
  normalizeDraft: (value: unknown) => AdminMailingDraft;
  eligibleContacts: (segment: AdminMailingDraft['segment']) => Array<{ id?: unknown }>;
  renderPreview: (draft: AdminMailingDraft) => string;
  previewDigest: (draft: AdminMailingDraft, contacts: Array<{ id?: unknown }>) => string;
  setPrivateNoStore: (response: Response) => void;
};

export class AdminMailingValidationError extends Error {}

export function createAdminMailingPreviewRouter(dependencies: AdminMailingPreviewDependencies): Router {
  const router = Router();
  router.post('/admin/mailings/preview', (request, response) => {
    dependencies.setPrivateNoStore(response);
    if (!dependencies.adminAuth(request)) return response.status(403).json({ error: 'Недостаточно прав' });
    if (!dependencies.csrfAllowed(request)) {
      return response.status(403).json({ error: 'Запрос отклонён: обновите страницу' });
    }
    if (!dependencies.signingSecretConfigured()) {
      return response.status(503).json({ error: 'На сервере не настроена безопасная подпись предпросмотра' });
    }
    try {
      const draft = dependencies.normalizeDraft(request.body);
      const contacts = dependencies.eligibleContacts(draft.segment);
      return response.json({
        subject: draft.subject,
        html: dependencies.renderPreview(draft),
        text: draft.textBody,
        recipientCount: contacts.length,
        previewDigest: dependencies.previewDigest(draft, contacts),
        sanitizedHtmlBody: draft.htmlBody,
      });
    } catch (error) {
      if (error instanceof AdminMailingValidationError) return response.status(400).json({ error: error.message });
      return response.status(500).json({ error: 'Не удалось подготовить предпросмотр' });
    }
  });
  return router;
}
