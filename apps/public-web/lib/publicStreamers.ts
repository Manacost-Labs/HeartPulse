import 'server-only';
import { cache } from 'react';
import { isStreamerPage, isStreamersPage, type StreamerPage, type StreamersPage } from '@/src/modules/streamers/public';
import { readPublicJson } from './firstPaintStore';
import { STREAMERS_PATH, streamerPath } from './publicDataPaths';
import { isPublicDataMissing } from './publicCatalogCache';

export type PublicStreamers = {
  /** Первая страница каталога и эфиры; `null` — их загрузит браузер. */
  page: StreamersPage | null;
  /** Express ответил ошибкой: раздела сейчас нет вовсе. */
  unavailable: boolean;
};

export type PublicStreamer = {
  page: StreamerPage | null;
  /** У HSGuru нет такого стримера (404). */
  missing: boolean;
  unavailable: boolean;
};

/** `status`: 200, 4xx (404 — у HSGuru такого нет) или 503 (данных нет ни свежих, ни запасных). */
async function readStatus(path: string): Promise<{ value: unknown; status: number }> {
  try {
    return { value: await readPublicJson(path), status: 200 };
  } catch (error) {
    return { value: null, status: isPublicDataMissing(error) ? (error as { status: number }).status : 503 };
  }
}

/** Каталог стримеров, прочитанный анонимно один раз на запрос (метаданные и страница). */
export const loadPublicStreamers = cache(async (): Promise<PublicStreamers> => {
  const { value, status } = await readStatus(STREAMERS_PATH);
  const page = isStreamersPage(value) ? value : null;
  return { page, unavailable: !page && status >= 500 };
});

/** Страница стримера; `missing` — у HSGuru нет такого стримера (404). */
export const loadPublicStreamer = cache(async (slug: string): Promise<PublicStreamer> => {
  const { value, status } = await readStatus(streamerPath(slug));
  const page = isStreamerPage(value) ? value : null;
  return { page, missing: status === 404, unavailable: !page && status >= 500 };
});
