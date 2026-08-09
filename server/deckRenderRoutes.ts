import { Router } from 'express';

export type DeckRenderResult = {
  imageUrl: string | null;
  previewImageUrl?: string | null;
  ready: boolean;
};

export type DeckRenderRouterDependencies = {
  renderDeck: (deckCode: string, deckName: string, refresh: boolean) => Promise<DeckRenderResult>;
};

const DECK_CODE_PATTERN = /^[A-Za-z0-9+/=]+$/;

function normalizedDeckCode(value: unknown): string | null {
  const code = String(value ?? '').replace(/\s+/g, '').trim();
  if (code.length < 16 || code.length > 2_048 || !DECK_CODE_PATTERN.test(code)) return null;
  return code;
}

function normalizedDeckName(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
    || 'Колода';
}

export function createDeckRenderRouter(dependencies: DeckRenderRouterDependencies): Router {
  const router = Router();

  router.post('/deck/render', async (request, response) => {
    const deckCode = normalizedDeckCode(request.body?.deckCode ?? request.body?.deck_code);
    if (!deckCode) {
      return response.status(400).json({ ok: false, error: 'Некорректный код колоды' });
    }
    const deckName = normalizedDeckName(request.body?.deckName ?? request.body?.deck_name);
    const refresh = request.body?.refresh === true;
    const startedAt = performance.now();
    try {
      const result = await dependencies.renderDeck(deckCode, deckName, refresh);
      if (!result.ready || !result.imageUrl) throw new Error('DECKVIEW_RENDER_FAILED');
      response.setHeader('Cache-Control', 'private, max-age=60');
      response.setHeader('Server-Timing', `deck-render;dur=${(performance.now() - startedAt).toFixed(1)}`);
      return response.json({
        ok: true,
        ready: true,
        renderer: 'rust',
        style: 'parchment',
        imageUrl: result.imageUrl,
        previewImageUrl: result.previewImageUrl || result.imageUrl,
      });
    } catch (error) {
      const timeout = error instanceof Error && error.message === 'DECKVIEW_TIMEOUT';
      return response.status(timeout ? 504 : 502).json({
        ok: false,
        error: timeout ? 'Рендер колоды занял слишком много времени' : 'Не удалось собрать изображение колоды',
      });
    }
  });

  return router;
}
