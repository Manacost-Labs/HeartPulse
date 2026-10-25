import 'server-only';
import { cache } from 'react';
import { isRadarReport, type RadarReport } from '@/src/modules/radar/public';
import { fetchPublicExpress } from './expressApi';
import { FIRST_PAINT_READ_BUDGET_MS, readFirstPaintJson } from './publicFirstPaintRead';

export type PublicRadar = {
  /** Радар для первого кадра; `null` — его загрузит браузер. */
  report: RadarReport | null;
  /** Express ответил ошибкой, то есть радара сейчас нет вовсе, а не просто не успели прочитать. */
  unavailable: boolean;
};

/**
 * Радар, прочитанный анонимно один раз на запрос: его читают и метаданные,
 * и страница. Не успел за общий бюджет первого кадра — `report: null`, и
 * радар загрузит браузер.
 */
export const loadPublicRadar = cache(async (): Promise<PublicRadar> => {
  let status = 0;
  const value = await readFirstPaintJson(async signal => {
    const response = await fetchPublicExpress('/api/radar', signal);
    status = response.status;
    return response;
  }, Date.now() + FIRST_PAINT_READ_BUDGET_MS);
  const report = isRadarReport(value) ? value : null;
  return { report, unavailable: !report && status >= 500 };
});
