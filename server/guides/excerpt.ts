import { createOldGuideSanitizer, type OldGuideSanitizer } from './sanitize.js';

/**
 * The open part of a guide and everything derived from the same text: the table
 * of contents, whether a paid remainder exists and whether the page may be
 * indexed. One definition of the open part serves the anonymous projection and
 * the sitemap, so "too short" means the same in both.
 */

export const GUIDE_EXCERPT_MIN_WORDS = 150;
export const GUIDE_EXCERPT_MAX_WORDS = 200;
const MAX_TOC_ENTRIES = 120;
const MAX_TOC_TEXT = 160;

export type GuideTocEntry = { id: string; text: string; level: 2 | 3 };

export type GuideExcerpt = {
  html: string;
  /** Words of the open part; never published, only compared with the threshold. */
  words: number;
  /** Something of the guide (text, deck pictures or codes) is left out of `html`. */
  hasPaid: boolean;
};

export type GuideTextRow = { free_html?: unknown; body_html?: unknown; short_html?: unknown };

type Token = { kind: 'text' | 'open' | 'close' | 'void'; raw: string; tag: string };

const VOID_TAGS = new Set(['br', 'hr', 'img']);
// A cut after one of these keeps every open wrapper valid: the stack is closed at the cut.
const BOUNDARY_TAGS = new Set(['p', 'li', 'blockquote', 'pre', 'tr', 'ul', 'ol', 'table', 'div']);
const HEADING_TAGS = new Set(['h2', 'h3', 'h4']);
// Deck pictures and codes are the paid payload; they never enter the open part.
const PAID_ONLY_TAGS = new Set(['figure', 'code']);
const TOKEN_PATTERN = /<\/([a-z][a-z0-9]*)\s*>|<([a-z][a-z0-9]*)((?:\s+[a-z][\w-]*(?:="[^"]*")?)*)\s*(\/?)>|[^<]+|</gi;

/** The same source the full route reads: the legacy free and paid parts, else the short anons. */
export function guideHtmlSource(row: GuideTextRow): string {
  return [row.free_html, row.body_html].filter(value => String(value ?? '').trim()).join('\n')
    || String(row.short_html ?? '');
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  for (const match of html.matchAll(TOKEN_PATTERN)) {
    const [raw, closing, opening, , selfClosing] = match;
    if (closing) tokens.push({ kind: 'close', raw, tag: closing.toLowerCase() });
    else if (opening) {
      const tag = opening.toLowerCase();
      tokens.push({ kind: VOID_TAGS.has(tag) || selfClosing ? 'void' : 'open', raw, tag });
    } else tokens.push({ kind: 'text', raw: raw === '<' ? '&lt;' : raw, tag: '' });
  }
  return tokens;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeGuideEntities(value: string): string {
  return value.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/gi, (whole, dec, hex, name) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
    const code = dec ? Number(dec) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

function countWords(rawText: string): number {
  return decodeGuideEntities(rawText).split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length;
}

const attributeValue = (raw: string, name: string): string | null => raw.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;

/** Gives every h2/h3 an anchor, so the table of contents and the full text agree on ids. */
export function addGuideHeadingIds(html: string): string {
  let index = 0;
  return html.replace(/<h([23])((?:\s[^>]*)?)>/g, (whole, level: string, attributes: string) => {
    index += 1;
    return /\sid="/.test(attributes) ? whole : `<h${level}${attributes} id="guide-heading-${index}">`;
  });
}

/** Headings of the whole guide, paid part included: the owner opens the outline on purpose. */
export function guideToc(html: string): GuideTocEntry[] {
  const entries: GuideTocEntry[] = [];
  let current: { level: 2 | 3; id: string; text: string } | null = null;
  for (const token of tokenize(html)) {
    if (token.kind === 'open' && (token.tag === 'h2' || token.tag === 'h3')) {
      current = { level: token.tag === 'h2' ? 2 : 3, id: attributeValue(token.raw, 'id') ?? '', text: '' };
    } else if (token.kind === 'close' && current && token.tag === `h${current.level}`) {
      const text = decodeGuideEntities(current.text).replace(/\s+/g, ' ').trim().slice(0, MAX_TOC_TEXT);
      if (text && current.id && /^[\w-]{1,120}$/.test(current.id)) entries.push({ id: current.id, text, level: current.level });
      current = null;
    } else if (current && token.kind === 'text') current.text += token.raw;
    else if (current && token.kind === 'void' && token.tag === 'br') current.text += ' ';
  }
  return entries.slice(0, MAX_TOC_ENTRIES);
}

function isInlineIcon(token: Token): boolean {
  return token.tag === 'img' && /\sclass="guide-inline-image"/.test(token.raw);
}

function hasContentAfter(tokens: Token[], from: number): boolean {
  return tokens.slice(from).some(token => (token.kind === 'text' && /\S/.test(token.raw))
    || (token.kind === 'open' && PAID_ONLY_TAGS.has(token.tag))
    || (token.kind === 'void' && token.tag === 'img' && !isInlineIcon(token)));
}

function removeEmptyElements(html: string): string {
  let previous: string;
  do {
    previous = html;
    html = html.replace(/<(p|div|span|em|i|b|strong|li|ul|ol|blockquote|table|tr|td|th)>\s*<\/\1>/gi, '');
    // A heading that held only a picture is left with its anchor: nothing to read, nothing to keep.
    html = html.replace(/<(h[2-4])(?:\s[^>]*)?>(?:\s|<a(?:\s[^>]*)?><\/a>)*<\/\1>/gi, '');
  } while (html !== previous);
  return html.trim();
}

type Snapshot = { length: number; stack: string[]; words: number };

/**
 * Cuts the sanitized guide to its open part: 150-200 words, ending at a block
 * boundary when one falls in that range, else at a sentence, else at a word. A
 * wrapper left open is closed, so the result stays valid HTML. Deck pictures,
 * deck codes and figures are left out and count as the paid remainder.
 */
export function buildGuideExcerpt(html: string): GuideExcerpt {
  const tokens = tokenize(html);
  const out: string[] = [];
  const stack: string[] = [];
  let words = 0;
  let omitted = false;
  let cut = false;
  let safe: Snapshot = { length: 0, stack: [], words: 0 };
  const finish = (): GuideExcerpt => {
    const closing = [...stack].reverse().map(tag => `</${tag}>`).join('');
    return { html: removeEmptyElements(out.join('') + closing), words, hasPaid: cut || omitted };
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === 'open' && PAID_ONLY_TAGS.has(token.tag)) {
      omitted = true;
      for (let depth = 1; depth > 0 && index + 1 < tokens.length;) {
        index += 1;
        if (tokens[index].tag === token.tag) depth += tokens[index].kind === 'open' ? 1 : tokens[index].kind === 'close' ? -1 : 0;
      }
      continue;
    }
    if (token.kind === 'void') {
      if (token.tag === 'img' && !isInlineIcon(token)) { omitted = true; continue; }
      out.push(token.raw);
      continue;
    }
    if (token.kind === 'open') { out.push(token.raw); stack.push(token.tag); continue; }
    if (token.kind === 'close') {
      const position = stack.lastIndexOf(token.tag);
      if (position < 0) continue;
      stack.length = position;
      out.push(token.raw);
      if (BOUNDARY_TAGS.has(token.tag) || HEADING_TAGS.has(token.tag)) safe = { length: out.length, stack: [...stack], words };
      if (BOUNDARY_TAGS.has(token.tag) && words >= GUIDE_EXCERPT_MIN_WORDS && hasContentAfter(tokens, index + 1)) {
        cut = true;
        return finish();
      }
      continue;
    }

    const count = countWords(token.raw);
    if (words + count <= GUIDE_EXCERPT_MAX_WORDS) { out.push(token.raw); words += count; continue; }

    cut = true;
    if (stack.some(tag => HEADING_TAGS.has(tag))) {
      // A heading is never cut: the open part ends before it.
      out.length = safe.length; stack.length = 0; stack.push(...safe.stack); words = safe.words;
      return finish();
    }
    let fitted = 0;
    let fittedWords = 0;
    for (const sentence of token.raw.matchAll(/[.!?…]+["»”’)\]]*(?=\s|$)/g)) {
      const end = sentence.index + sentence[0].length;
      const total = countWords(token.raw.slice(0, end));
      if (words + total > GUIDE_EXCERPT_MAX_WORDS) break;
      fitted = end; fittedWords = total;
    }
    if (fitted > 0 && words + fittedWords >= GUIDE_EXCERPT_MIN_WORDS) {
      out.push(token.raw.slice(0, fitted).trimEnd());
      words += fittedWords;
      return finish();
    }
    // No sentence ends inside the range: cut at the last word that fits.
    let taken = 0;
    let end = 0;
    for (const word of token.raw.matchAll(/\S+/g)) {
      if (countWords(word[0]) > 0) taken += 1;
      if (words + taken > GUIDE_EXCERPT_MAX_WORDS) break;
      end = word.index + word[0].length;
    }
    out.push(`${token.raw.slice(0, end).trimEnd()}…`);
    words = Math.min(GUIDE_EXCERPT_MAX_WORDS, words + countWords(token.raw.slice(0, end)));
    return finish();
  }
  return finish();
}

export type PreparedGuide = {
  excerptHtml: string;
  toc: GuideTocEntry[];
  hasPaid: boolean;
  indexable: boolean;
};

export function prepareGuide(row: GuideTextRow, sanitizer: OldGuideSanitizer): PreparedGuide {
  const fullHtml = addGuideHeadingIds(sanitizer.sanitizeHtml(guideHtmlSource(row)));
  const excerpt = buildGuideExcerpt(fullHtml);
  return {
    excerptHtml: excerpt.html, toc: guideToc(fullHtml), hasPaid: excerpt.hasPaid,
    indexable: excerpt.words >= GUIDE_EXCERPT_MIN_WORDS,
  };
}

// Word counts do not depend on the asset host, so one sanitizer serves the sitemap.
const defaultSanitizer = createOldGuideSanitizer('');

/** A guide is indexed (page and sitemap alike) only when its open part has enough own words. */
export function isGuideArchiveIndexable(row: GuideTextRow, sanitizer: OldGuideSanitizer = defaultSanitizer): boolean {
  return buildGuideExcerpt(sanitizer.sanitizeHtml(guideHtmlSource(row))).words >= GUIDE_EXCERPT_MIN_WORDS;
}

type IndexabilityEntry = { signature: string; indexable: boolean };
const indexabilityCache = new Map<string, IndexabilityEntry>();

/**
 * The same predicate, remembered per slug while the text signature (lengths of the three text
 * columns) is unchanged. `loadText` runs only on a miss, so a repeat sitemap build never reads
 * or sanitizes the guide texts of an archive that is frozen.
 */
export function isGuideArchiveIndexableCached(
  slug: string, signature: string, loadText: () => GuideTextRow | undefined,
  cache: Map<string, IndexabilityEntry> = indexabilityCache,
): boolean {
  const known = cache.get(slug);
  if (known && known.signature === signature) return known.indexable;
  const row = loadText();
  const indexable = row ? isGuideArchiveIndexable(row) : false;
  if (row) cache.set(slug, { signature, indexable });
  return indexable;
}
