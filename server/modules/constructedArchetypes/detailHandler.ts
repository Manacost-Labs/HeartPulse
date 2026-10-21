import type { RequestHandler } from 'express';

type Format = 'standard' | 'wild';
type Catalog = {
  format: Format; formatLabel: string; patch: string; minimumGames: number; updatedAt: string | null;
  items: { slug: string; archetype: string }[];
};
type DetailDependencies<C extends Catalog, H, A, R> = {
  loadCatalog: (format: Format) => Promise<C>;
  loadHistory: (format: Format, archetype: string) => Promise<H>;
  loadAnalysis: (format: Format, archetype: string) => Promise<A>;
  /** Winrate by rank and period; only the `ranks` section reads it. */
  loadRanks?: (format: Format, archetype: string) => Promise<R>;
  onError?: (scope: 'detail' | 'history' | 'analysis' | 'ranks', error: unknown) => void;
};

/** Mount only after the entitlement and private-response guards. Default reads retain the full API. */
export function createArchetypeDetailHandler<C extends Catalog, H, A, R = never>(dependencies: DetailDependencies<C, H, A, R>): RequestHandler {
  return async (request, response) => {
    const format = request.params.format;
    const slug = String(request.params.slug ?? '').trim().toLowerCase();
    const section = request.query.section ?? 'full';
    if ((format !== 'standard' && format !== 'wild') || !/^[a-z0-9-]{1,90}$/.test(slug)) {
      response.status(400).json({ error: 'Некорректный адрес архетипа' }); return;
    }
    const sections = dependencies.loadRanks ? ['full', 'core', 'history', 'analysis', 'ranks'] : ['full', 'core', 'history', 'analysis'];
    if (typeof section !== 'string' || !sections.includes(section)) {
      response.status(400).json({ error: 'Неизвестный раздел архетипа' }); return;
    }
    try {
      const catalog = await dependencies.loadCatalog(format);
      const item = catalog.items.find(row => row.slug === slug);
      if (!item) { response.status(404).json({ error: 'Архетип не найден в текущей мете' }); return; }
      if (section === 'history') {
        response.json({ history: await dependencies.loadHistory(format, item.archetype) }); return;
      }
      if (section === 'analysis') {
        response.json({ analysis: await dependencies.loadAnalysis(format, item.archetype) }); return;
      }
      if (section === 'ranks' && dependencies.loadRanks) {
        response.json({ ranks: await dependencies.loadRanks(format, item.archetype) }); return;
      }
      const [history, analysis] = section === 'core' ? [[], null] : await Promise.all([
        dependencies.loadHistory(format, item.archetype),
        dependencies.loadAnalysis(format, item.archetype).catch(error => {
          dependencies.onError?.('analysis', error); return null;
        }),
      ]);
      response.json({ format: catalog.format, formatLabel: catalog.formatLabel, patch: catalog.patch,
        minimumGames: catalog.minimumGames, updatedAt: catalog.updatedAt, item, history, analysis });
    } catch (error) {
      dependencies.onError?.(section === 'history' || section === 'analysis' || section === 'ranks' ? section : 'detail', error);
      response.status(502).json({ error: section === 'history' ? 'История архетипа временно недоступна'
        : section === 'analysis' ? 'Аналитика архетипа временно недоступна'
          : section === 'ranks' ? 'Винрейт по рангам временно недоступен' : 'Страница архетипа временно недоступна' });
    }
  };
}
