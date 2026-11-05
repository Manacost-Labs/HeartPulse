import type { DatabaseSync } from 'node:sqlite';
import type { Application, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { publicResourceUrl } from '../../shared/publicResourceUrl.js';
import {
  createSavedDeckRepository,
  createSavedDecksRouter,
  type ResolvedSavedDeck,
} from '../modules/savedDecks/public.js';

type RegisterSavedDecksDependencies = {
  app: Application;
  getDatabase: () => DatabaseSync;
  userAuth: (request: Request) => { id: string } | null;
  csrfAllowed: (request: Request) => boolean;
  setPrivateNoStore: (response: Response) => void;
  isDeckCode: (deckCode: string) => boolean;
  resolveDeck: (deckCode: string) => Promise<ResolvedSavedDeck | null>;
  renderDeck: (deckCode: string, deckName: string) => Promise<{ imageUrl: string | null; previewImageUrl?: string | null }>;
};

/**
 * «Мои колоды». Adding a deck and retrying its image start a deckview render,
 * so those requests are budgeted per client before any work starts.
 */
export function registerSavedDecks(dependencies: RegisterSavedDecksDependencies): void {
  const renderLimiter = rateLimit({
    windowMs: 10 * 60_000, max: 30, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Слишком много колод за раз. Попробуйте через несколько минут.' },
    // A cross-site request is refused anyway; it must not spend the visitor's budget.
    skip: request => !dependencies.csrfAllowed(request),
  });
  dependencies.app.use('/api', createSavedDecksRouter({
    renderLimiter,
    isDeckCode: dependencies.isDeckCode,
    repository: createSavedDeckRepository(dependencies.getDatabase),
    userAuth: dependencies.userAuth,
    csrfAllowed: dependencies.csrfAllowed,
    setPrivateNoStore: dependencies.setPrivateNoStore,
    resolveDeck: dependencies.resolveDeck,
    renderDeck: dependencies.renderDeck,
    // deckview images load through the site's proxy, like the meta pages' deck images.
    imageUrl: publicResourceUrl,
  }));
}
