import { TWITCH_CHANNEL_MAX_PENDING_STATES } from './model.js';

/**
 * The send order of each channel, in process memory. `generationOf` is the
 * generation of the channel's link (`TwitchLiveState.generation`).
 */
export function createTwitchChannelQueues(generationOf: (channelId: string) => number) {
  const queues = new Map<string, Promise<void>>();
  const pendingStates = new Map<string, number>();

  const enqueue = <Result>(channelId: string, job: () => Promise<Result>): Promise<Result> => {
    const result = (queues.get(channelId) ?? Promise.resolve()).then(job);
    const settled = result.then(() => undefined, () => undefined);
    queues.set(channelId, settled);
    void settled.then(() => {
      if (queues.get(channelId) === settled) queues.delete(channelId);
    });
    return result;
  };

  return {
    /**
     * Runs the channel's sends one after another, in the order they were
     * asked for: a clear queued at an unlink reaches Twitch before the next
     * owner's first deck and after the former owner's last one. Channels do
     * not wait for each other. A job that throws does not stop the queue.
     */
    run: enqueue,
    /**
     * `run` for a state from the app, with a bound: while Twitch answers
     * slowly, one state may be on its way and one may wait behind it. Null
     * when both places are taken; the caller refuses the state, so a client
     * that keeps sending cannot pile up open requests. Clears use `run` and
     * are never refused. The places are counted per generation of the link:
     * states of a link that has just ended are dropped when their turn comes
     * and must not make the next owner's first deck wait for a free place.
     */
    runState<Result>(channelId: string, job: () => Promise<Result>): Promise<Result> | null {
      const link = `${channelId}#${generationOf(channelId)}`;
      const pending = pendingStates.get(link) ?? 0;
      if (pending >= TWITCH_CHANNEL_MAX_PENDING_STATES) return null;
      pendingStates.set(link, pending + 1);
      return enqueue(channelId, async () => {
        try {
          return await job();
        } finally {
          const left = (pendingStates.get(link) ?? 1) - 1;
          if (left > 0) pendingStates.set(link, left);
          else pendingStates.delete(link);
        }
      });
    },
    /** Resolves when everything queued for the channel so far has been sent or dropped. */
    idle(channelId: string): Promise<void> {
      return queues.get(channelId) ?? Promise.resolve();
    },
    /** Whether something of the channel is on its way to Twitch or waiting for its turn. */
    busy(channelId: string): boolean {
      return queues.has(channelId);
    },
  };
}
