import { Router, type Request, type Response } from 'express';
import { streamerClassKey, streamerFormat, streamerSlug } from './parsing.js';
import { StreamerNotFoundError, type createStreamersService } from './service.js';
import type { StreamerFilters } from './types.js';

export type StreamersRouterDependencies = Pick<ReturnType<typeof createStreamersService>, 'loadList' | 'loadStreamer'>;

// Эфиры меняются каждые пять минут: минута в браузере и на краю, ещё две — устаревшее.
const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=120';

function filters(request: Request): StreamerFilters | null {
  const { format, class: classKey } = request.query;
  const parsedFormat = format === undefined || format === '' ? null : streamerFormat(format);
  const parsedClass = classKey === undefined || classKey === '' ? null : streamerClassKey(classKey);
  if (parsedFormat === null && format) return null;
  if (parsedClass === null && classKey) return null;
  return { format: parsedFormat, classKey: parsedClass };
}

function offset(request: Request): number | null {
  const raw = request.query.offset;
  if (raw === undefined || raw === '') return 0;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 && value <= 5_000 ? value : null;
}

function unavailable(response: Response) {
  response.set('Cache-Control', 'no-store');
  response.status(502).json({ error: 'Раздел стримеров временно недоступен' });
}

/** Анонимные страницы «Стримеры»: каталог HSGuru и эфиры, без данных зрителя. */
export function createStreamersRouter(dependencies: StreamersRouterDependencies): Router {
  const router = Router();

  router.get('/streamers', async (request, response) => {
    const parsed = filters(request);
    const at = offset(request);
    if (!parsed || at === null) {
      response.status(400).json({ error: 'Неверный фильтр' });
      return;
    }
    try {
      const page = await dependencies.loadList(parsed, at);
      response.set('Cache-Control', PUBLIC_CACHE).json(page);
    } catch {
      unavailable(response);
    }
  });

  router.get('/streamers/:slug', async (request, response) => {
    const slug = streamerSlug(request.params.slug.toLowerCase());
    const parsed = filters(request);
    const at = offset(request);
    if (!slug || !parsed || at === null) {
      response.status(slug ? 400 : 404).json({ error: slug ? 'Неверный фильтр' : 'Стример не найден' });
      return;
    }
    try {
      const page = await dependencies.loadStreamer(slug, parsed, at);
      response.set('Cache-Control', PUBLIC_CACHE).json(page);
    } catch (error) {
      if (error instanceof StreamerNotFoundError) {
        response.set('Cache-Control', 'public, max-age=60').status(404).json({ error: 'Стример не найден' });
        return;
      }
      unavailable(response);
    }
  });

  return router;
}
