/**
 * Crash reports from the Hearthpulse desktop app (plan 0.5, docs/specs/crash-reports.md). The player chose to send
 * them; the app already scrubs every message and stack. The server accepts only the app's shape, with fixed lists and
 * lengths, and scrubs the text again: no name, e-mail, address or long number is kept, and no IP is stored.
 */

export const CRASH_REPORT_MAX_BYTES = 32 * 1024;
/** Reports are kept this long, then deleted. */
export const CRASH_REPORT_KEEP_DAYS = 90;
/** At most this many reports are kept at once; past it the oldest go, so a flood cannot shut real reports out. */
export const CRASH_REPORT_MAX_ROWS = 20_000;

const WHERE = new Set(['UI error', 'Fatal error', 'Unhandled error', 'Background error']);
const UI = new Set(['wpf', 'avalonia']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION = /^[0-9A-Za-z.+-]{1,32}$/;
const LANGUAGE = /^[A-Za-z-]{0,16}$/;
const TYPE = /^[A-Za-z_][\w.`+<>[\],]{0,199}$/;
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export type CrashError = { type: string; message: string; stack: string[] };
export type CrashReport = {
  v: 1;
  id: string;
  app: 'hearthpulse';
  version: string;
  ui: string;
  os: string;
  runtime: string;
  language: string;
  where: string;
  uptimeSeconds: number;
  at: string;
  errors: CrashError[];
};

/**
 * Text the app sends, scrubbed again with the app's rules: control characters, e-mails, BattleTags, quoted values,
 * key=value pairs, every absolute path whole (spaces included, to a quote or the end), IP addresses, long numbers.
 */
export function scrubCrashText(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || value.length > max + 1) return null;
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/[\p{L}\p{N}_]{2,24}#\d{3,6}/gu, '<name>')
    // Paths whole before quoted values: an apostrophe ends one only before a space, punctuation or the end.
    .replace(/(?:file:\/\/\/|[A-Za-z]:[\\/]|\\\\|%USERPROFILE%(?=[\\/]|$)|\/(?:home|Users|tmp|var|private|mnt|media|root|Volumes|opt|srv)\/)(?:[^"'<>|«»“”„]|'(?![\s.,;:!?)\]]|$))*/g, '<path>')
    .replace(/('|"|«|“|„)(?:(?<=')(?:[^']|'(?![\s.,;:!?)\]]|$))+(?='(?:[\s.,;:!?)\]]|$))|(?<=")[^"]+(?=")|(?<=«)[^»]+(?=»)|(?<=[“„])[^”“]+(?=[”“]))('|"|»|”|“)/g, '$1<value>$2')
    .replace(/\b([A-Za-z_][A-Za-z0-9_]{0,40})=[^\s,;)\]]+/g, '$1=<value>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<ip>')
    .replace(/\d{7,}/g, '<number>');
}

const integer = (value: unknown, max: number): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : null;

/** The report in the app's shape, scrubbed; null when it is not one. */
export function readCrashReport(body: unknown): CrashReport | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (input.v !== 1 || input.app !== 'hearthpulse') return null;
  if (typeof input.id !== 'string' || !UUID.test(input.id)) return null;
  if (typeof input.version !== 'string' || !VERSION.test(input.version)) return null;
  if (typeof input.ui !== 'string' || !UI.has(input.ui)) return null;
  if (typeof input.where !== 'string' || !WHERE.has(input.where)) return null;
  if (typeof input.language !== 'string' || !LANGUAGE.test(input.language)) return null;
  if (typeof input.at !== 'string' || !AT.test(input.at)) return null;
  const os = scrubCrashText(input.os, 120);
  const runtime = scrubCrashText(input.runtime, 60);
  const uptimeSeconds = integer(input.uptimeSeconds, 2_147_483_647);
  if (os === null || runtime === null || uptimeSeconds === null) return null;
  if (!Array.isArray(input.errors) || input.errors.length < 1 || input.errors.length > 5) return null;

  const errors: CrashError[] = [];
  for (const item of input.errors) {
    const error = item as Record<string, unknown> | null;
    if (!error || typeof error !== 'object' || typeof error.type !== 'string' || !TYPE.test(error.type)) return null;
    const message = scrubCrashText(error.message, 300);
    if (message === null || !Array.isArray(error.stack) || error.stack.length > 40) return null;
    const stack: string[] = [];
    for (const line of error.stack) {
      const frame = scrubCrashText(line, 300);
      if (frame === null) return null;
      stack.push(frame);
    }
    errors.push({ type: error.type, message, stack });
  }

  return {
    v: 1, id: input.id, app: 'hearthpulse', version: input.version, ui: input.ui, os, runtime, language: input.language,
    where: input.where, uptimeSeconds, at: input.at, errors,
  };
}
