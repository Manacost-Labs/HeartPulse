import { TWITCH_SNAPSHOT_TTL_MS, TWITCH_STATE_MIN_INTERVAL_MS } from './model.js';

/**
 * The last envelope of each channel and its send budget, in process memory.
 * A restart loses them on purpose: the app sends a keepalive every 15 s, so
 * the snapshot is back within seconds, and nothing here is worth a table.
 */
export function createTwitchLiveState(now: () => number = Date.now) {
  const lastSendAt = new Map<string, number>();
  const snapshots = new Map<string, { envelope: string; storedAt: number }>();

  const sweep = () => {
    const current = now();
    for (const [channel, entry] of snapshots) {
      if (current - entry.storedAt > TWITCH_SNAPSHOT_TTL_MS) snapshots.delete(channel);
    }
    for (const [channel, at] of lastSendAt) {
      if (current - at > TWITCH_STATE_MIN_INTERVAL_MS) lastSendAt.delete(channel);
    }
  };

  return {
    /** Takes the channel's send slot; returns the seconds to wait when it is taken. */
    acquire(channelId: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
      const current = now();
      const previous = lastSendAt.get(channelId);
      if (previous !== undefined && current - previous < TWITCH_STATE_MIN_INTERVAL_MS) {
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((TWITCH_STATE_MIN_INTERVAL_MS - (current - previous)) / 1000)) };
      }
      lastSendAt.set(channelId, current);
      return { ok: true };
    },
    store(channelId: string, envelope: string): void {
      if (snapshots.size > 1_000) sweep();
      snapshots.set(channelId, { envelope, storedAt: now() });
    },
    snapshot(channelId: string): string | null {
      const entry = snapshots.get(channelId);
      if (!entry) return null;
      if (now() - entry.storedAt > TWITCH_SNAPSHOT_TTL_MS) {
        snapshots.delete(channelId);
        return null;
      }
      return entry.envelope;
    },
    forget(channelId: string): void {
      snapshots.delete(channelId);
      lastSendAt.delete(channelId);
    },
  };
}

export type TwitchLiveState = ReturnType<typeof createTwitchLiveState>;
