import type { TwitchLiveState } from './liveState.js';
import { buildTwitchEnvelope } from './model.js';
import type { TwitchLinkRepository } from './repository.js';
import type { TwitchApi } from './twitchApi.js';

export type TwitchSendWait = (milliseconds: number) => Promise<void>;

const sleep: TwitchSendWait = milliseconds => new Promise<void>(resolve => { setTimeout(resolve, milliseconds); });

/**
 * Call in the channel's queue right before a message goes to Twitch: waits out
 * what is left of the second since the channel's previous message and takes
 * the next one. A test supplies its own `wait`.
 */
export async function paceTwitchChannelSend(live: TwitchLiveState, channelId: string, wait: TwitchSendWait = sleep): Promise<void> {
  const delay = live.sendDelayMs(channelId);
  if (delay > 0) await wait(delay);
  live.markSent(channelId);
}

export type TwitchChannelRevokerDependencies = {
  live: TwitchLiveState;
  twitch: Pick<TwitchApi, 'broadcast'> | null;
  onError?: (scope: string, error: unknown) => void;
  wait?: TwitchSendWait;
};

/**
 * `ended`: the link ended by an event that happens once (the streamer
 * unlinked, the channel moved to another site account, the account was
 * blocked or deleted); one clear is sent whatever the site remembers.
 * `detected`: a request found the channel without an active owner; requests
 * repeat, so a clear is sent only while a deck the site relayed is still in
 * memory, which the revocation erases: the next request finds nothing to clear.
 */
export type TwitchRevocationReason = 'ended' | 'detected';

/**
 * Takes a channel away from its link: the snapshot and the right to publish go
 * at once, and viewers who already have the deck on screen are sent `mode:
 * none`. That message is best effort: Twitch may refuse it, and a viewer who
 * is offline never gets it, so a failure is logged and changes nothing here.
 */
export function createTwitchChannelRevoker(dependencies: TwitchChannelRevokerDependencies) {
  return (channelId: string, reason: TwitchRevocationReason): void => {
    const { live, twitch } = dependencies;
    const { visible, lastSeq } = live.revoke(channelId);
    if (!twitch || (reason === 'detected' && !visible)) return;
    void live.run(channelId, async () => {
      // Nothing to ask again after this wait: the clear stores nothing, the link it ends cannot come back,
      // and a later owner's states are behind it in the queue.
      await paceTwitchChannelSend(live, channelId, dependencies.wait);
      // Taken now, in the queue: later than every message sent to the channel before, earlier than the next.
      const at = live.stamp(channelId);
      // Newer than anything relayed for the channel: the extension drops a frame that is not. The decks
      // that follow count from the app's own, lower `seq`; their later `at` is what lets them through.
      // One of them is lost if its `seq` happens to equal this one (docs/specs/twitch-extension.md).
      const seq = Math.max(at, lastSeq + 1);
      try {
        await twitch.broadcast(channelId, buildTwitchEnvelope({ v: 1, seq, state: { mode: 'none' } }, at));
      } catch (error) {
        dependencies.onError?.('pubsub-clear', error);
      }
    });
  };
}

/**
 * Revocation by site account, for the places that block or delete accounts.
 * The application API refuses a blocked or deleted account before any Twitch
 * route sees its request, so nothing here can wait for the app to come back.
 */
export function createTwitchAccountRevoker(dependencies: {
  links: Pick<TwitchLinkRepository, 'find' | 'all'>;
  revoke: ReturnType<typeof createTwitchChannelRevoker>;
}) {
  return {
    /** The account was blocked: its link stays, its channel is taken away. */
    account(userId: string): void {
      const link = dependencies.links.find(userId);
      if (link) dependencies.revoke(link.twitchUserId, 'ended');
    },
    /**
     * Every account but these is about to be deleted. Call it before the
     * delete: the links go by cascade, and after it nobody knows which channel
     * to clear.
     */
    accountsOutside(keepUserIds: readonly string[]): void {
      const keep = new Set(keepUserIds);
      for (const link of dependencies.links.all()) {
        if (!keep.has(link.userId)) dependencies.revoke(link.twitchUserId, 'ended');
      }
    },
  };
}
