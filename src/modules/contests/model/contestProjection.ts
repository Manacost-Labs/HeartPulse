import type { Contest } from './types';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid contests response');
  return value as Record<string, unknown>;
}

const string = (value: unknown): string => typeof value === 'string' ? value : '';

/** Projects only public contest fields; a viewer's entry is opt-in for private client state. */
export function contestsFromResponse(value: unknown, includeViewerEntry = false): Contest[] {
  const root = record(value);
  if (!Array.isArray(root.contests)) throw new Error('Invalid contests response');
  return root.contests.map(value => {
    const item = record(value);
    const id = string(item.id);
    const title = string(item.title);
    if (!id || !title) throw new Error('Invalid contest');
    const entry = includeViewerEntry && item.entry && typeof item.entry === 'object'
      ? { status: string((item.entry as Record<string, unknown>).status),
        createdAt: string((item.entry as Record<string, unknown>).createdAt) }
      : null;
    return {
      id, title, description: string(item.description), prize: string(item.prize),
      imageUrl: string(item.imageUrl), startsAt: string(item.startsAt), endsAt: string(item.endsAt),
      status: string(item.status), winners: Array.isArray(item.winners) ? item.winners.filter((id): id is string => typeof id === 'string') : [],
      entry,
    };
  });
}
