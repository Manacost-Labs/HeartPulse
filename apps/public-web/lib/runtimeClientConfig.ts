import 'server-only';
import { readFile } from 'node:fs/promises';
import { createRuntimeClientConfigReader, DISABLED_RUNTIME_CLIENT_CONFIG,
  type RuntimeClientConfig } from './runtimeClientConfigData';

// The deployer links `dist/runtime-config.js` of every release to the
// root-managed switch file; an empty variable turns the switches off.
const readRuntimeClientConfig = createRuntimeClientConfigReader(
  () => readFile(process.env.RUNTIME_CLIENT_CONFIG_FILE ?? 'dist/runtime-config.js', 'utf8'),
);

/**
 * Runtime switches for the document being rendered. They are also published
 * on `globalThis`, where `src/config/publicAssetDelivery.ts` reads them while
 * client components render on the server; the layout sends the same value to
 * the browser, so image URLs match on hydration.
 */
export async function loadRuntimeClientConfig(): Promise<RuntimeClientConfig> {
  // A prerendered page is built once; it must not freeze an operational
  // switch into its HTML, so the build renders with everything off.
  const config = process.env.NEXT_PHASE === 'phase-production-build'
    ? DISABLED_RUNTIME_CLIENT_CONFIG
    : await readRuntimeClientConfig();
  (globalThis as { __ARENA_RUNTIME_CONFIG__?: RuntimeClientConfig }).__ARENA_RUNTIME_CONFIG__ = config;
  return config;
}
