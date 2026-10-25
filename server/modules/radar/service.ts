import { parseRadarReport, type RadarParseOptions, type RadarReport } from './contract.js';
import { RADAR_FIXTURE } from './fixture.js';

export type RadarServiceDependencies = {
  /** Читает JSON радара hs-data-api; ошибка транспорта или статуса — исключение. По умолчанию `fetchRadarJson`. */
  fetchJson?: (url: string) => Promise<unknown>;
  radarUrl: string;
  /** Русские имена архетипов HSGuru и их замена в текстах модели; без них остаются английские имена. */
  loadNaming?: () => Promise<Pick<RadarParseOptions, 'nameArchetype' | 'localizeFor'>>;
  /** `true` — отдавать встроенную демо-фикстуру вместо hs-data-api. */
  fixture: boolean;
  ttlMs: number;
  retryMs?: number;
  now?: () => number;
  /** Сообщает о каждой неудачной попытке чтения, а не о каждом запросе, пришедшем во время паузы. */
  onError?: (error: unknown) => void;
};

/** Анонимное чтение hs-data-api: пока прогонов нет, он отвечает `503`, и это ошибка чтения. */
export async function fetchRadarJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`balance radar HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Один проверенный снимок радара на процесс. Радар пересчитывается редко
 * (дважды в сутки), поэтому истёкший снимок отдаётся сразу, а в фоне идёт
 * одно обновление. Неудачное чтение повторяется не раньше `retryMs`, в том
 * числе пока снимка ещё нет: иначе, пока hs-data-api не готов, каждый
 * просмотр страницы (сервер и браузер) ходил бы к нему заново. Ответ, не
 * прошедший проверку, не заменяет последний хороший снимок.
 */
export function createRadarService(dependencies: RadarServiceDependencies) {
  const now = dependencies.now ?? Date.now;
  const retryMs = dependencies.retryMs ?? 60_000;
  let snapshot: { value: RadarReport; expiresAt: number } | null = null;
  let failure: { error: unknown; until: number } | null = null;
  let pending: Promise<RadarReport> | null = null;

  const naming = async (): Promise<Pick<RadarParseOptions, 'nameArchetype' | 'localizeFor'>> => {
    try {
      return (await dependencies.loadNaming?.()) ?? {};
    } catch {
      return {};
    }
  };
  const read = async (demo: boolean) => {
    const [payload, names] = await Promise.all([
      demo ? RADAR_FIXTURE : (dependencies.fetchJson ?? fetchRadarJson)(dependencies.radarUrl), naming(),
    ]);
    return parseRadarReport(payload, { demo, ...names });
  };
  const start = () => {
    pending ??= read(dependencies.fixture).then(value => {
      snapshot = { value, expiresAt: now() + dependencies.ttlMs };
      failure = null;
      return value;
    }, error => {
      dependencies.onError?.(error);
      failure = { error, until: now() + retryMs };
      if (snapshot) snapshot = { ...snapshot, expiresAt: failure.until };
      throw error;
    }).finally(() => { pending = null; });
    return pending;
  };

  return {
    async load(): Promise<RadarReport> {
      if (!snapshot) {
        if (failure && failure.until > now()) throw failure.error;
        return start();
      }
      if (snapshot.expiresAt <= now()) void start().catch(() => undefined);
      return snapshot.value;
    },
  };
}
