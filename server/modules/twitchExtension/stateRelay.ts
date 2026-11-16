import type { TwitchLiveState } from './liveState.js';
import { buildTwitchEnvelope, type TwitchStateInput } from './model.js';
import type { TwitchLinkRepository } from './repository.js';
import { paceTwitchChannelSend, type TwitchRevocationReason, type TwitchSendWait } from './revocation.js';
import type { TwitchApi } from './twitchApi.js';

export type TwitchStateRelayDependencies = {
  twitch: Pick<TwitchApi, 'broadcast'>;
  links: Pick<TwitchLinkRepository, 'find'>;
  live: TwitchLiveState;
  accountActive: (userId: string) => boolean;
  revoke: (channelId: string, reason: TwitchRevocationReason) => void;
  onError?: (scope: string, error: unknown) => void;
  wait?: TwitchSendWait;
};

/**
 * `full`: the channel already has a state at Twitch and one waiting.
 * `revoked`: the link ended or changed while the state waited. `inactive`: its
 * account was blocked meanwhile. `unavailable`: Twitch refused the message.
 */
export type TwitchStateRelayOutcome = 'sent' | 'full' | 'revoked' | 'inactive' | 'unavailable';

/**
 * Sends one validated state of `userId` to `channelId`, the channel linked to
 * that account when the request was read. The send waits its turn behind the
 * channel's earlier messages; if the link is unlinked, moved or blocked
 * meanwhile, the state belongs to the old link and must not follow its clear.
 */
export async function relayTwitchState(
  dependencies: TwitchStateRelayDependencies,
  userId: string,
  channelId: string,
  state: TwitchStateInput,
): Promise<TwitchStateRelayOutcome> {
  const { live, twitch } = dependencies;
  const generation = live.generation(channelId);
  const sending = live.runState<TwitchStateRelayOutcome>(channelId, async () => {
    // Asked again when the turn comes, not only by generation: a block or a delete that reached the
    // database without a revocation must still stop a state that was already accepted.
    if (live.generation(channelId) !== generation || dependencies.links.find(userId)?.twitchUserId !== channelId) return 'revoked';
    if (!dependencies.accountActive(userId)) {
      dependencies.revoke(channelId, 'detected');
      return 'inactive';
    }
    await paceTwitchChannelSend(live, channelId, dependencies.wait);
    // Built here, with the time the message is sent: see `TwitchLiveState.stamp`.
    const envelope = buildTwitchEnvelope(state, live.stamp(channelId));
    // Stored before the broadcast: a viewer who opens the stream gets it even when one PubSub send failed.
    live.store(channelId, envelope, { seq: state.seq, visible: state.state.mode !== 'none' });
    try {
      await twitch.broadcast(channelId, envelope);
      return 'sent';
    } catch (error) {
      dependencies.onError?.('pubsub', error);
      return 'unavailable';
    }
  });
  // Twitch is slow and the channel's two places are taken: no third open request.
  return sending ?? 'full';
}
