import { fetchPublicExpress } from './expressApi';

/** What the anonymous Express detail answered: its status and, for a 200, its JSON. */
export type ArchetypeDetailAnswer = { status: number; json: unknown };

const KEY = Symbol.for('hearthpulse.archetypeDetail.handoff');
const HANDOFF_MS = 5_000;
const MAX_ENTRIES = 100;

/**
 * The proxy's probe (#599) reads an archetype detail before the page does. The read is handed to the page instead of
 * repeated: a document costs Express one detail read, as before the probe. Probes of one slug share one read; the page
 * takes it (a page without a probe, or later than `HANDOFF_MS`, reads afresh). `proxy.ts` and the pages are bundled
 * apart, so the reads hang off `globalThis`.
 */
function reads() {
  const holder = globalThis as unknown as { [KEY]?: Map<string, { at: number; answer: Promise<ArchetypeDetailAnswer> }> };
  const map = (holder[KEY] ??= new Map());
  for (const [key, entry] of map) if (Date.now() - entry.at > HANDOFF_MS || map.size > MAX_ENTRIES) map.delete(key);
  return map;
}

const fetchDetail = (format: string, slug: string): Promise<ArchetypeDetailAnswer> =>
  fetchPublicExpress(`/api/constructed-archetypes/teaser/${format}/${slug}`).then(async response => {
    if (response.ok) return { status: response.status, json: await response.json() };
    await response.body?.cancel();
    return { status: response.status, json: null };
  });

/** The probe's read: a read of this slug already in hand is shared, otherwise one starts and waits for the page. */
export function probeArchetypeDetailRead(format: string, slug: string): Promise<ArchetypeDetailAnswer> {
  const map = reads();
  const key = `${format}/${slug}`;
  const held = map.get(key);
  if (held) return held.answer;
  const answer = fetchDetail(format, slug);
  map.set(key, { at: Date.now(), answer });
  answer.catch(() => { if (map.get(key)?.answer === answer) map.delete(key); });
  return answer;
}

/** The page's read: the probe's read of this request when there is one, else its own. */
export function takeArchetypeDetailRead(format: string, slug: string): Promise<ArchetypeDetailAnswer> {
  const map = reads();
  const key = `${format}/${slug}`;
  const held = map.get(key);
  map.delete(key);
  return held ? held.answer : fetchDetail(format, slug);
}
