import type { Application, Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { createChatCommandsRouter, type ChatCommandsRouterDependencies } from '../modules/chatCommands/public.js';
import { getTrustedClientIp } from '../networkBoundary.js';

const channelKey = (request: Request) => `${String(request.params.channel ?? '').toLowerCase()}|${String(request.params.command ?? '')}`;

/**
 * `GET /api/v1/chat/<login>/<command>` for Nightbot and StreamElements. The site-wide API limiter skips it: the bots
 * fetch for every channel from a few shared addresses. Instead: 600 a minute per address, 30 a minute per channel and
 * command (the 15-second answer cache serves the rest).
 */
export function registerChatCommands(app: Application, dependencies: Omit<ChatCommandsRouterDependencies, 'limiter'>): void {
  app.use('/api/v1/chat', rateLimit({
    windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false,
    keyGenerator: request => ipKeyGenerator(getTrustedClientIp(request) || 'unknown'),
    message: 'Hearthpulse: too many requests.',
  }));
  app.use('/api', createChatCommandsRouter({
    ...dependencies,
    limiter: rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false, keyGenerator: channelKey,
      message: 'Hearthpulse: too many requests.' }),
  }));
}
