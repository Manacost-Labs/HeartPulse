import { TWITCH_SNAPSHOT_TTL_MS, TWITCH_STATE_MIN_INTERVAL_MS } from './model.js';

type Snapshot = { envelope: string; storedAt: number; seq: number; visible: boolean };

/**
 * The last envelope of each channel, its send budget, its send order and the
 * generation of its link, in process memory: correct only while one server
 * process answers every request.
 * A restart loses them on purpose: the app sends a keepalive every 15 s, so
 * the snapshot is back within seconds, and nothing here is worth a table.
 */
export function createTwitchLiveState(now: () => number = Date.now) {
  const lastSendAt = new Map<string, number>();
  const snapshots = new Map<string, Snapshot>();
  const generations = new Map<string, number>();
  const queues = new Map<string, Promise<void>>();

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
    /** Milliseconds until the channel's one-a-second budget allows a message the site sends itself. */
    sendDelayMs(channelId: string): number {
      const previous = lastSendAt.get(channelId);
      return previous === undefined ? 0 : Math.max(0, TWITCH_STATE_MIN_INTERVAL_MS - (now() - previous));
    },
    /** Spends the channel's send slot for a message the site sends itself. */
    markSent(channelId: string): void {
      lastSendAt.set(channelId, now());
    },
    /** `seq` and `visible` (a deck, not `none`) describe what viewers were last sent. */
    store(channelId: string, envelope: string, sent: { seq: number; visible: boolean }): void {
      snapshots.set(channelId, { envelope, storedAt: now(), ...sent });
    },
    /**
     * Drops every snapshot older than the TTL and every spent send slot; the
     * owner runs it on a timer, so an idle channel's deck leaves memory on
     * time and not only when a viewer asks. Returns the snapshots still kept.
     */
    sweep(): number {
      sweep();
      return snapshots.size;
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
    /** Whether anything of the channel is in memory or on its way to Twitch. */
    tracks(channelId: string): boolean {
      return snapshots.has(channelId) || queues.has(channelId);
    },
    /** The generation of the channel's link; a state read under an older one must not be sent. */
    generation(channelId: string): number {
      return generations.get(channelId) ?? 0;
    },
    /**
     * Ends the right of the channel's current link to publish: the snapshot is
     * erased and every state accepted before this call is dropped when its
     * turn to be sent comes. Says what viewers were last sent, for the clear.
     */
    revoke(channelId: string): { visible: boolean; lastSeq: number } {
      const entry = snapshots.get(channelId);
      snapshots.delete(channelId);
      generations.set(channelId, (generations.get(channelId) ?? 0) + 1);
      return { visible: Boolean(entry?.visible), lastSeq: entry?.seq ?? 0 };
    },
    /**
     * Runs the channel's sends one after another, in the order they were
     * asked for: a clear queued at an unlink reaches Twitch before the next
     * owner's first deck and after the former owner's last one.
     */
    run<Result>(channelId: string, job: () => Promise<Result>): Promise<Result> {
      const result = (queues.get(channelId) ?? Promise.resolve()).then(job);
      const settled = result.then(() => undefined, () => undefined);
      queues.set(channelId, settled);
      void settled.then(() => {
        if (queues.get(channelId) === settled) queues.delete(channelId);
      });
      return result;
    },
    /** Resolves when everything queued for the channel so far has been sent or dropped. */
    idle(channelId: string): Promise<void> {
      return queues.get(channelId) ?? Promise.resolve();
    },
  };
}

export type TwitchLiveState = ReturnType<typeof createTwitchLiveState>;
