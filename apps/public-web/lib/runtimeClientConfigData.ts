import vm from 'node:vm';
import { PUBLIC_CARD_IMAGE_CDN_ORIGIN } from '@/shared/publicAssetDelivery';

export type RuntimeClientConfig = { cardImageCdn: { enabled: boolean; origin: string }; webVitals: { enabled: boolean } };

/** Origin delivery and no reporting: what a missing, unreadable or invalid switch file means. */
export const DISABLED_RUNTIME_CLIENT_CONFIG: RuntimeClientConfig = {
  cardImageCdn: { enabled: false, origin: PUBLIC_CARD_IMAGE_CDN_ORIGIN },
  webVitals: { enabled: false },
};

/**
 * Evaluates the `window.__ARENA_RUNTIME_CONFIG__ = {...}` script the way a
 * browser would, so the server and hydration agree on every switch. The file
 * is root-managed and as trusted as the application code.
 */
export function parseRuntimeClientConfig(source: string): RuntimeClientConfig {
  const window: { __ARENA_RUNTIME_CONFIG__?: {
    cardImageCdn?: { enabled?: unknown; origin?: unknown }; webVitals?: { enabled?: unknown };
  } } = {};
  vm.runInNewContext(source, { window }, { timeout: 50 });
  const config = window.__ARENA_RUNTIME_CONFIG__;
  if (!config) return DISABLED_RUNTIME_CLIENT_CONFIG;
  return {
    cardImageCdn: {
      enabled: config.cardImageCdn?.enabled === true,
      origin: typeof config.cardImageCdn?.origin === 'string' ? config.cardImageCdn.origin : PUBLIC_CARD_IMAGE_CDN_ORIGIN,
    },
    // A deployed switch file reports unless it says otherwise; only a runtime
    // without one (tests, local runs) stays silent.
    webVitals: { enabled: config.webVitals?.enabled !== false },
  };
}

/**
 * Reads the switches at most once per `refreshMs`, so operations can change
 * them without a release and a request never waits on the file twice.
 */
export function createRuntimeClientConfigReader(readSource: () => Promise<string>, refreshMs = 30_000) {
  let cached: { config: RuntimeClientConfig; expiresAt: number } | null = null;
  return async (now = Date.now()): Promise<RuntimeClientConfig> => {
    if (cached && cached.expiresAt > now) return cached.config;
    let config = DISABLED_RUNTIME_CLIENT_CONFIG;
    try {
      config = parseRuntimeClientConfig(await readSource());
    } catch {
      // Fail closed to origin delivery.
    }
    cached = { config, expiresAt: now + refreshMs };
    return config;
  };
}
