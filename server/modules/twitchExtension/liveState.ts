import { createTwitchChannelQueues } from './channelQueue.js';
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
  const lastAcceptedAt = new Map<string, number>();
  const lastSentAt = new Map<string, number>();
  const lastStamp = new Map<string, number>();
  const snapshots = new Map<string, Snapshot>();
  const generations = new Map<string, number>();
  const queue = createTwitchChannelQueues(channelId => generations.get(channelId) ?? 0);

  const sweep = () => {
    const current = now();
    for (const [channel, entry] of snapshots) {
      if (current - entry.storedAt > TWITCH_SNAPSHOT_TTL_MS) snapshots.delete(channel);
    }
    for (const times of [lastAcceptedAt, lastSentAt]) {
      for (const [channel, at] of times) {
        if (current - at > TWITCH_STATE_MIN_INTERVAL_MS) times.delete(channel);
      }
    }
    // A stamp in the past no longer shapes the next one: the clock alone is already later.
    for (const [channel, at] of lastStamp) {
      if (at < current) lastStamp.delete(channel);
    }
  };

  return {
    /** Takes the channel's one-a-second slot for a state; returns the seconds to wait when it is taken. */
    acquire(channelId: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
      const current = now();
      const previous = lastAcceptedAt.get(channelId);
      if (previous !== undefined && current - previous < TWITCH_STATE_MIN_INTERVAL_MS) {
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((TWITCH_STATE_MIN_INTERVAL_MS - (current - previous)) / 1000)) };
      }
      lastAcceptedAt.set(channelId, current);
      return { ok: true };
    },
    /**
     * Milliseconds until the channel may be sent its next message: Twitch
     * allows one a second, and messages that waited behind a slow one would
     * otherwise leave back to back.
     */
    sendDelayMs(channelId: string): number {
      const previous = lastSentAt.get(channelId);
      return previous === undefined ? 0 : Math.max(0, TWITCH_STATE_MIN_INTERVAL_MS - (now() - previous));
    },
    /** Records that a message is leaving for the channel now. */
    markSent(channelId: string): void {
      lastSentAt.set(channelId, now());
    },
    /**
     * The `at` of the channel's next message: the clock, but always later than
     * the previous message's. The extension keeps a frame whose `seq` is lower
     * than the last one only when its `at` is later (a restarted app, a new
     * owner after a clear), so `at` must follow the order the messages are
     * sent in. Call it inside the channel's queue, when the message is about
     * to go: a time taken when the request arrived can be earlier than that of
     * a clear sent before it.
     */
    stamp(channelId: string): number {
      const at = Math.max(now(), (lastStamp.get(channelId) ?? 0) + 1);
      lastStamp.set(channelId, at);
      return at;
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
      return snapshots.has(channelId) || queue.busy(channelId);
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
    /** The channel's send order: see `createTwitchChannelQueues`. */
    run: queue.run,
    runState: queue.runState,
    idle: queue.idle,
  };
}

export type TwitchLiveState = ReturnType<typeof createTwitchLiveState>;
