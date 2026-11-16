import type { TwitchLiveState } from './liveState.js';
import { buildTwitchEnvelope } from './model.js';
import type { TwitchApi } from './twitchApi.js';

export type TwitchChannelRevokerDependencies = {
  live: TwitchLiveState;
  twitch: Pick<TwitchApi, 'broadcast'> | null;
  onError?: (scope: string, error: unknown) => void;
  /** Waits out the channel's one-a-second budget; a test supplies its own. */
  wait?: (milliseconds: number) => Promise<void>;
};

/**
 * `unlinked`: the streamer unlinked the channel or it moved to another site
 * account; one clear is sent whatever the site remembers. `detected`: a request
 * found the owner blocked or gone; requests repeat, so a clear is sent only
 * while a deck the site relayed is still in memory, which the revocation
 * erases: the next request finds nothing to clear.
 */
export type TwitchRevocationReason = 'unlinked' | 'detected';

/**
 * Takes a channel away from its link: the snapshot and the right to publish go
 * at once, and viewers who already have the deck on screen are sent `mode:
 * none`. That message is best effort: Twitch may refuse it, and a viewer who
 * is offline never gets it, so a failure is logged and changes nothing here.
 */
export function createTwitchChannelRevoker(dependencies: TwitchChannelRevokerDependencies) {
  const wait = dependencies.wait
    ?? ((milliseconds: number) => new Promise<void>(resolve => { setTimeout(resolve, milliseconds); }));
  return (channelId: string, reason: TwitchRevocationReason): void => {
    const { live, twitch } = dependencies;
    const { visible, lastSeq } = live.revoke(channelId);
    if (!twitch || (reason === 'detected' && !visible)) return;
    void live.run(channelId, async () => {
      const delay = live.sendDelayMs(channelId);
      if (delay > 0) await wait(delay);
      live.markSent(channelId);
      // Taken now, in the queue: later than every message sent to the channel before, earlier than the next.
      const at = live.stamp(channelId);
      // Newer than anything relayed for the channel: the extension drops a frame that is not. The decks
      // that follow count from the app's own, lower `seq`; their later `at` is what lets them through.
      const seq = Math.max(at, lastSeq + 1);
      try {
        await twitch.broadcast(channelId, buildTwitchEnvelope({ v: 1, seq, state: { mode: 'none' } }, at));
      } catch (error) {
        dependencies.onError?.('pubsub-clear', error);
      }
    });
  };
}
