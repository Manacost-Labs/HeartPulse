import { Router, type RequestHandler, type Response } from 'express';
import type { PlayerGame } from '../playerGames/public.js';
import {
  CHAT_COMMANDS,
  CHAT_GAME_DELAY_SECONDS,
  CHAT_SESSION_MS,
  chatTexts,
  deckReply,
  deckstringOf,
  mmrReply,
  rankReply,
  visibleGames,
  winrateReply,
  type ChatCommand,
  type ChatDeck,
  type ChatLanguage,
} from './model.js';

/** Bots ask on every `!command` in chat; one answer per channel and command serves them all for this long. */
const ANSWER_TTL_MS = 15_000;
const MAX_ANSWERS = 2_000;
/** Twitch logins: 4–25 letters, digits and `_` (older accounts may be shorter). */
const LOGIN = /^[a-z0-9_]{1,25}$/;

export type ChatChannel = {
  userId: string;
  twitchUserId: string;
  /** The streamer switched chat commands on (Twitch section of the profile; off by default). Off answers like unlinked. */
  chatEnabled: boolean;
  /** Whether the account shows its statistics publicly (`/id/<n>/`): the further consent for !winrate, !rank and !mmr. */
  statsPublic: boolean;
};

/** The channel's latest Twitch extension snapshot, already delayed by the app. */
export type ChatSnapshot = { deck: ChatDeck | null; receivedAt: number };

export type ChatCommandsRouterDependencies = {
  /** The site account linked to a Twitch login; null when the channel is not linked. */
  findChannel: (login: string) => ChatChannel | null;
  /** The fresh snapshot of a Twitch channel id, or null (not streaming with Hearthpulse, or older than its TTL). */
  snapshot: (twitchUserId: string) => ChatSnapshot | null;
  /** The account's tracker games that started in the window, oldest first. */
  readGames: (userId: string, window: { since: number; until: number; limit: number }) => PlayerGame[];
  /** Hero card id → dbf id, for the deck code. */
  heroDbfId: (cardId: string) => Promise<number | null>;
  /** Per-channel limit (composition: express-rate-limit keyed by the channel; tests: none). */
  limiter?: RequestHandler;
  now?: () => number;
};

const sendText = (response: Response, status: number, text: string) => {
  response.status(status).type('text/plain; charset=utf-8');
  response.set('Cache-Control', status === 200 ? 'public, max-age=15' : 'no-store');
  response.set('Access-Control-Allow-Origin', '*');
  response.set('X-Robots-Tag', 'noindex');
  return response.send(text);
};

/**
 * Plain-text answers for chat bots (Nightbot `$(urlfetch)`, StreamElements `${customapi}`), only while the app is live
 * on the channel: `!deck` from the delayed extension snapshot, `!winrate`, `!rank`, `!mmr` from the streamer's games
 * that ended ten minutes ago or earlier. A channel that is unlinked or has chat commands off answers an empty 404.
 * Contract: docs/specs/chat-commands.md.
 */
export function createChatCommandsRouter(dependencies: ChatCommandsRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  const limiter: RequestHandler = dependencies.limiter ?? ((_request, _response, next) => next());
  const answers = new Map<string, { expiresAt: number; text: string }>();

  async function answer(channel: ChatChannel, command: ChatCommand, lang: ChatLanguage): Promise<string> {
    const texts = chatTexts(lang);
    const current = now();
    // Every command answers only while the app is live on the channel: no polling of a streamer who is offline.
    const snapshot = dependencies.snapshot(channel.twitchUserId);
    if (!snapshot) return texts.notSharing;
    if (command === 'deck') {
      const hero = snapshot.deck?.hero ? await dependencies.heroDbfId(snapshot.deck.hero).catch(() => null) : null;
      return deckReply(snapshot.deck, snapshot.deck ? deckstringOf(snapshot.deck, hero) : null, lang);
    }
    if (!channel.statsPublic) return texts.statsHidden;
    const session = dependencies.readGames(channel.userId, { since: current - CHAT_SESSION_MS, until: current, limit: 500 });
    const visible = visibleGames(session, current - CHAT_GAME_DELAY_SECONDS * 1000);
    if (command === 'winrate') return winrateReply(visible, lang);
    if (command === 'rank') return rankReply(visible, lang);
    return mmrReply(visible, lang);
  }

  router.get('/v1/chat/:channel/:command', limiter, async (request, response) => {
    const login = String(request.params.channel).toLowerCase();
    const command = String(request.params.command) as ChatCommand;
    const lang: ChatLanguage = request.query.lang === 'en' ? 'en' : 'ru';
    if (!LOGIN.test(login) || !CHAT_COMMANDS.includes(command)) return sendText(response, 404, '');
    const key = `${login}|${command}|${lang}`;
    const cached = answers.get(key);
    if (cached && cached.expiresAt > now()) return sendText(response, 200, cached.text);
    const channel = dependencies.findChannel(login);
    if (!channel || !channel.chatEnabled) return sendText(response, 404, '');
    try {
      const text = await answer(channel, command, lang);
      answers.set(key, { expiresAt: now() + ANSWER_TTL_MS, text });
      if (answers.size > MAX_ANSWERS) answers.delete(answers.keys().next().value as string);
      return sendText(response, 200, text);
    } catch {
      return sendText(response, 503, 'Hearthpulse: try again in a minute.');
    }
  });

  return router;
}
