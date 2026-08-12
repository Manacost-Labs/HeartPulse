import { evaluateDataHealth, type DatasetHealthState, type HealthDatasetInput } from './health.js';

type ConstructedFormat = 'standard' | 'wild';

interface LoadedDataset {
  data?: Record<string, unknown>;
}

interface ConstructedCatalogHealth {
  dataStatus: string;
  verifiedAt?: unknown;
  records?: number;
  state?: DatasetHealthState | 'expired';
  cacheSource?: unknown;
  warning?: unknown;
}

interface CriticalDataHealthDependencies {
  loadDataset: (filename: string) => LoadedDataset | null | undefined;
  getConstructedCatalogHealth: (format: ConstructedFormat) => ConstructedCatalogHealth;
  getUpstreamInput: () => HealthDatasetInput;
}

export function createCriticalDataHealth(dependencies: CriticalDataHealthDependencies) {
  return () => {
    const staticDatasets = [
      { name: 'winrates', file: 'winrates.json', collection: 'classes' },
      { name: 'tierlist', file: 'tierlist.json', collection: 'sections' },
      { name: 'legendaries', file: 'legendaries.json', collection: 'groups' },
    ].map(definition => {
      const entry = dependencies.loadDataset(definition.file);
      const collection = entry?.data?.[definition.collection];
      return {
        name: definition.name,
        updatedAt: entry?.data?.updatedAt,
        source: entry?.data?.source,
        records: Array.isArray(collection) ? collection.length : undefined,
      };
    });
    const constructedCards = (['standard', 'wild'] as const).map(format => {
      const health = dependencies.getConstructedCatalogHealth(format);
      return {
        name: `constructed-cards-${format}`,
        updatedAt: health.dataStatus === 'unavailable' ? null : health.verifiedAt,
        source: health.cacheSource === 'LKG'
          ? 'api.kolodahearthstone.com:last-known-good'
          : 'api.kolodahearthstone.com',
        records: health.records,
        state: health.dataStatus === 'unavailable'
          ? 'missing' as const
          : health.state === 'expired' ? 'stale' as const : health.state,
        dataStatus: health.dataStatus,
        cacheSource: health.cacheSource,
        warning: health.warning,
      };
    });
    return evaluateDataHealth([
      ...staticDatasets,
      ...constructedCards,
      dependencies.getUpstreamInput(),
    ]);
  };
}
