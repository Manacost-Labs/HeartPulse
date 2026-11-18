import { parsePublicLegendaries, PUBLIC_LEGENDARIES_PATH } from './publicProjection';
import type { LegendariesData, LegendarySource } from './types';

/** The open groups of a source for the browser; `null` on any failure, so the page keeps what it has. */
export async function loadPublicLegendaries(source: LegendarySource, options: {
  request?: typeof fetch; signal?: AbortSignal; bust?: boolean;
} = {}): Promise<LegendariesData | null> {
  const { request = fetch, signal, bust = false } = options;
  try {
    const response = await request(`${PUBLIC_LEGENDARIES_PATH}?source=${source}`,
      { credentials: 'omit', cache: bust ? 'no-store' : 'default', signal });
    if (!response.ok) return null;
    return parsePublicLegendaries(await response.json());
  } catch { return null; }
}
