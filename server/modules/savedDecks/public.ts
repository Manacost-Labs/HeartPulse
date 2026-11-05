/**
 * The account's own saved decks (the «Мои колоды» tab): stored by deck code
 * with the owner's comment and shown with their deckview image. Private to
 * the owner; deleted with the account.
 */
export {
  MAX_DECK_COMMENT_LENGTH,
  MAX_SAVED_DECKS,
  normalizeDeckComment,
  parseDeckInput,
  serializeSavedDeck,
  type SavedDeck,
  type SavedDeckFormat,
  type SavedDeckRecord,
} from './model.js';
export { SAVED_DECK_TABLES_SQL, createSavedDeckRepository, type SavedDeckRepository } from './repository.js';
export { createSavedDecksRouter, type ResolvedSavedDeck, type SavedDecksRouterDependencies } from './routes.js';
