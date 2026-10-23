/**
 * Public nickname policy: what a person may choose as `/u/<nickname>/` and the
 * key that decides uniqueness. The display form keeps the person's casing;
 * the key folds case, Unicode compatibility forms and look-alike letters, so
 * two nicknames that read the same on screen cannot both exist.
 */

export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 24;

const LATIN_LETTER = /[a-z]/;
const CYRILLIC_LETTER = /[а-яёіїєґў]/;
const ALLOWED_CHARACTERS = /^[a-zа-яёіїєґў0-9_-]+$/;

/**
 * Cyrillic letters (and digits) that render like a Latin letter in the
 * display font, mapped to one representative. The fold is deliberately
 * coarse: a false collision only makes a nickname unavailable, while a missed
 * one lets someone impersonate another player.
 */
const LOOK_ALIKE_FOLD: Readonly<Record<string, string>> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', є: 'e', з: '3', к: 'k', м: 'm', н: 'h',
  о: 'o', р: 'p', с: 'c', т: 't', у: 'y', ў: 'y', х: 'x', і: 'l', ї: 'l',
  б: '6', ч: '4', п: 'n', г: 'r', ґ: 'r',
  i: 'l', '1': 'l', '0': 'o', '-': '_',
};

/**
 * Whole nicknames that collide with site routes, staff roles or system words.
 * `tests/public-profile-nickname.test.ts` fails when a top-level route segment
 * of the site is missing here, so a new section cannot be shadowed by `/u/`.
 */
export const RESERVED_NICKNAMES: readonly string[] = [
  'about', 'account', 'admin', 'administrator', 'api', 'app', 'arena', 'archetypes',
  'articles', 'assets', 'auth', 'battlegrounds', 'blog', 'bot', 'cards', 'cdn',
  'classes', 'connect', 'contact', 'contests', 'cosmetics', 'dashboard', 'deck-builder',
  'decks', 'developers', 'docs', 'error', 'faq', 'gallery', 'guest', 'guides',
  'guides-archive', 'health', 'help', 'heroes', 'home', 'id', 'identity', 'jobs',
  'legendaries', 'library', 'login', 'logout', 'mail', 'me', 'meta', 'mod',
  'news', 'nobody', 'null', 'owner', 'privacy', 'profile', 'profiles', 'r',
  'register', 'root', 'security', 'settings', 'signin', 'signup', 'standard',
  'staff', 'static', 'stats', 'support', 'system', 'telegram', 'terms', 'tierlist',
  'u', 'undefined', 'uploads', 'user', 'users', 'wallpaper', 'webmaster', 'www',
  'анонимус', 'гость', 'профиль', 'система',
];

/** Words that may not appear anywhere in a nickname: brand and staff impersonation. */
export const BLOCKED_NICKNAME_FRAGMENTS: readonly string[] = [
  'admin', 'moderator', 'hearthpulse', 'manacost', 'official', 'support',
  'админ', 'модератор', 'манакост', 'поддержка',
];

export type NicknameRejection =
  | 'length'
  | 'characters'
  | 'mixed-script'
  | 'needs-letter'
  | 'reserved'
  | 'content';

export type NicknameValidation =
  | { ok: true; display: string; key: string }
  | { ok: false; reason: NicknameRejection; message: string };

/**
 * Optional content filter (profanity and the like). It receives the folded
 * key and the display form and returns false to refuse the nickname.
 */
export type NicknameContentCheck = (key: string, display: string) => boolean;

const MESSAGES: Record<NicknameRejection, string> = {
  length: `Ник должен быть от ${NICKNAME_MIN_LENGTH} до ${NICKNAME_MAX_LENGTH} символов`,
  characters: 'В нике можно использовать только латинские или русские буквы, цифры, «_» и «-»',
  'mixed-script': 'Используйте в нике буквы одного алфавита: только латиницу или только кириллицу',
  'needs-letter': 'Ник должен содержать хотя бы одну букву',
  reserved: 'Этот ник зарезервирован, выберите другой',
  content: 'Этот ник нельзя использовать, выберите другой',
};

function reject(reason: NicknameRejection): NicknameValidation {
  return { ok: false, reason, message: MESSAGES[reason] };
}

/** Folds an already lower-cased nickname to its uniqueness key. */
export function nicknameKey(lowerCased: string): string {
  let key = '';
  for (const character of lowerCased) key += LOOK_ALIKE_FOLD[character] ?? character;
  return key;
}

const RESERVED_KEYS = new Set(RESERVED_NICKNAMES.map(word => nicknameKey(word.normalize('NFKC').toLowerCase())));
const BLOCKED_FRAGMENT_KEYS = BLOCKED_NICKNAME_FRAGMENTS.map(word => nicknameKey(word.normalize('NFKC').toLowerCase()));

type ParsedNickname =
  | { ok: true; display: string; key: string }
  | { ok: false; reason: NicknameRejection };

/**
 * The structural rules shared by saving and looking up. NFKC turns full-width
 * and other compatibility spellings into plain letters before any rule runs,
 * so `ａｄｍｉｎ` is judged as `admin`.
 */
function parseNickname(raw: unknown): ParsedNickname {
  if (typeof raw !== 'string') return { ok: false, reason: 'length' };
  const display = raw.normalize('NFKC').trim();
  const length = [...display].length;
  if (length < NICKNAME_MIN_LENGTH || length > NICKNAME_MAX_LENGTH) return { ok: false, reason: 'length' };
  const lower = display.toLowerCase();
  if (!ALLOWED_CHARACTERS.test(lower)) return { ok: false, reason: 'characters' };
  const latin = LATIN_LETTER.test(lower);
  const cyrillic = CYRILLIC_LETTER.test(lower);
  if (latin && cyrillic) return { ok: false, reason: 'mixed-script' };
  if (!latin && !cyrillic) return { ok: false, reason: 'needs-letter' };
  return { ok: true, display, key: nicknameKey(lower) };
}

/** Validates a nickname a person wants to save, exactly as the server stores it. */
export function validateNickname(
  raw: unknown,
  contentAllowed: NicknameContentCheck = () => true,
): NicknameValidation {
  const parsed = parseNickname(raw);
  if (parsed.ok === false) return reject(parsed.reason);
  const { display, key } = parsed;
  if (RESERVED_KEYS.has(key) || BLOCKED_FRAGMENT_KEYS.some(fragment => key.includes(fragment))) {
    return reject('reserved');
  }
  if (!contentAllowed(key, display)) return reject('content');
  return { ok: true, display, key };
}

/**
 * The lookup key for a `/u/<nickname>/` address, or null when the address
 * cannot name any nickname. It skips the reserved and content rules, so a
 * nickname saved before a word was reserved keeps resolving.
 */
export function nicknameLookupKey(raw: unknown): string | null {
  const parsed = parseNickname(raw);
  return parsed.ok ? parsed.key : null;
}
