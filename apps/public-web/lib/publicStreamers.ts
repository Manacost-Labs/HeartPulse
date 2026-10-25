import 'server-only';
import { cache } from 'react';
import { isStreamerPage, isStreamersPage, type StreamerPage, type StreamersPage } from '@/src/modules/streamers/public';
import { fetchPublicExpress } from './expressApi';
import { FIRST_PAINT_READ_BUDGET_MS, readFirstPaintJson } from './publicFirstPaintRead';

export type PublicStreamers = {
  /** Первая страница каталога и эфиры; `null` — их загрузит браузер. */
  page: StreamersPage | null;
  /** Express ответил ошибкой: раздела сейчас нет вовсе. */
  unavailable: boolean;
};

export type PublicStreamer = PublicStreamers & { page: StreamerPage | null; missing: boolean };

async function readStatus(path: string): Promise<{ value: unknown; status: number }> {
  let status = 0;
  const value = await readFirstPaintJson(async signal => {
    const response = await fetchPublicExpress(path, signal);
    status = response.status;
    return response;
  }, Date.now() + FIRST_PAINT_READ_BUDGET_MS);
  return { value, status };
}

/** Каталог стримеров, прочитанный анонимно один раз на запрос (метаданные и страница). */
export const loadPublicStreamers = cache(async (): Promise<PublicStreamers> => {
  const { value, status } = await readStatus('/api/streamers');
  const page = isStreamersPage(value) ? value : null;
  return { page, unavailable: !page && status >= 500 };
});

/** Страница стримера; `missing` — у HSGuru нет такого стримера (404). */
export const loadPublicStreamer = cache(async (slug: string): Promise<PublicStreamer> => {
  const { value, status } = await readStatus(`/api/streamers/${encodeURIComponent(slug)}`);
  const page = isStreamerPage(value) ? value : null;
  return { page, missing: status === 404, unavailable: !page && status >= 500 };
});
