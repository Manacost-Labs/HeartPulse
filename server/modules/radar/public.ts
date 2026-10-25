import { createRadarRouter } from './routes.js';
import { createRadarService, type RadarServiceDependencies } from './service.js';

export { createRadarRouter, type RadarRouterDependencies } from './routes.js';
export { createRadarService, type RadarServiceDependencies } from './service.js';

/** `/api/radar` поверх одного проверенного снимка радара hs-data-api (или демо-фикстуры). */
export function createRadarApi(dependencies: RadarServiceDependencies) {
  return createRadarRouter({ load: createRadarService(dependencies).load });
}
