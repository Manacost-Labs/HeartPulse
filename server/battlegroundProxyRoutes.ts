import { Router, type Request, type RequestHandler, type Response } from 'express';

type PayloadEnricher = (payload: any) => any;
type ProxyHandler = (request: Request, response: Response, upstreamPath: string, enrich?: PayloadEnricher) => unknown;

export type BattlegroundProxyRouterDependencies = {
  requireAccess: RequestHandler;
  proxyLegacy: ProxyHandler;
  proxyApp: ProxyHandler;
  proxyExtraLibrary: (request: Request, response: Response, library: string) => unknown;
  enrichHeroPayload: PayloadEnricher;
};

export function compactBattlegroundHeroCompositionsPayload(payload: any): any {
  const heroes = Array.isArray(payload?.heroes) ? payload.heroes : [];
  const compositions: Record<string, string> = {};
  const compositionNames: Record<string, string> = {};

  for (const hero of heroes) {
    const dbfId = Number(hero?.dbfId ?? hero?.dbf ?? hero?.dbf_id);
    const bestComposition = hero?.best_composition;
    const name = typeof bestComposition === 'string'
      ? bestComposition.trim()
      : String(bestComposition?.name || bestComposition?.composition || '').trim();
    const compositionId = Number(bestComposition?.composition_id ?? bestComposition?.id ?? hero?.best_composition_id);

    if (Number.isFinite(dbfId) && name) compositions[String(dbfId)] = name;
    if (Number.isFinite(compositionId) && name) compositionNames[String(compositionId)] = name;
  }

  return {
    ok: payload?.ok !== false,
    fetched_at: payload?.fetched_at || null,
    compositions,
    composition_names: compositionNames,
  };
}

export function createBattlegroundProxyRouter(dependencies: BattlegroundProxyRouterDependencies): Router {
  const router = Router();
  const legacyRoutes: Array<[string, string]> = [
    ['/battlegrounds-library', '/api/battlegrounds-library'],
    ['/battlegrounds-spells', '/api/battlegrounds-spells'],
    ['/battlegrounds-card-names', '/api/battlegrounds-card-names'],
    ['/bg-comps', '/api/bg-comps'],
    ['/card-art', '/api/card-art'],
    ['/remote-image', '/api/remote-image'],
  ];
  const applicationRoutes: Array<[string, string]> = [
    ['/bg/heroes', '/api/bg/heroes'],
    ['/bg/library/meta', '/api/bg/library/meta'],
    ['/bg/library/cards', '/api/bg/library/cards'],
    ['/bg/library/minion-stats', '/api/bg/library/minion-stats'],
    ['/bg/library/spell-stats', '/api/bg/library/spell-stats'],
    ['/bg/tier-lists', '/api/bg/tier-lists'],
  ];

  for (const [route, upstream] of legacyRoutes) {
    router.get(route, dependencies.requireAccess, (request, response) => dependencies.proxyLegacy(request, response, upstream));
  }
  for (const [route, upstream] of applicationRoutes) {
    router.get(route, dependencies.requireAccess, (request, response) => dependencies.proxyApp(request, response, upstream));
  }
  router.get('/bg/heroes/compositions', dependencies.requireAccess, (request, response) => dependencies.proxyApp(
    request,
    response,
    'https://api.kolodahearthstone.com/api/bg/heroes',
    compactBattlegroundHeroCompositionsPayload,
  ));
  router.get('/bg/heroes/:dbfId/details', dependencies.requireAccess, (request, response) => dependencies.proxyApp(
    request,
    response,
    `/api/bg/heroes/${encodeURIComponent(request.params.dbfId)}/details`,
    dependencies.enrichHeroPayload,
  ));
  router.get('/bg/library/cards/by-dbf/:dbfId', dependencies.requireAccess, (request, response) => dependencies.proxyApp(request, response, `/api/bg/library/cards/by-dbf/${encodeURIComponent(request.params.dbfId)}`));
  router.get('/bg/library/minions/:dbfId', dependencies.requireAccess, (request, response) => dependencies.proxyApp(request, response, `/api/bg/library/minions/${encodeURIComponent(request.params.dbfId)}`));
  router.get('/bg/library/minions/:dbfId/history', dependencies.requireAccess, (request, response) => dependencies.proxyApp(request, response, `/api/bg/library/minions/${encodeURIComponent(request.params.dbfId)}/history`));
  router.get('/bg/library/extra/:library', dependencies.requireAccess, (request, response) => dependencies.proxyExtraLibrary(request, response, request.params.library));
  return router;
}
