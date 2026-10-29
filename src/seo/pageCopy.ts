import rawCopy from '../../config/public-seo-page-copy.json';
import { seoPageForExactPath } from './registry';

/**
 * The server-rendered text of pages whose data is closed to a guest: what the
 * page shows, how to read it, where the data comes from and how often it is
 * collected (`config/public-seo-page-copy.json`). It carries no statistics:
 * a number in it would be a claim about data the page does not print.
 *
 * A body block is a paragraph (a string) or a bullet list (an array of
 * strings). `[text](/path/)` in a string is a link to another registry page.
 */
export type SeoPageCopyBlock = string | readonly string[];
export type SeoPageCopySection = { question: string; body: readonly SeoPageCopyBlock[] };
export type SeoPageCopy = { sections: readonly SeoPageCopySection[] };
export type SeoCopyPiece = { text: string; href?: string };

const LINK = /\[([^\]]+)\]\(([^)\s]*)\)/g;

/** A paragraph split into plain text and links. */
export function seoCopyPieces(text: string): SeoCopyPiece[] {
  const pieces: SeoCopyPiece[] = [];
  let from = 0;
  for (const match of text.matchAll(LINK)) {
    if (match.index > from) pieces.push({ text: text.slice(from, match.index) });
    pieces.push({ text: match[1], href: match[2] });
    from = match.index + match[0].length;
  }
  if (from < text.length) pieces.push({ text: text.slice(from) });
  return pieces;
}

function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function assertLinks(text: string, where: string): void {
  for (const { href } of seoCopyPieces(text)) {
    if (href === undefined) continue;
    const target = seoPageForExactPath(href);
    if (!target || href !== `${target.pathname}/`) {
      throw new Error(`SEO page copy ${where} links to ${href}, which is not the canonical address of a registry page`);
    }
  }
}

/** Throws unless `raw` is a copy of registry pages whose sections are headed by a question. */
export function parseSeoPageCopy(raw: unknown): Readonly<Record<string, SeoPageCopy>> {
  const registry = raw as { schemaVersion?: unknown; pages?: Record<string, unknown> };
  if (registry?.schemaVersion !== 1 || !registry.pages || typeof registry.pages !== 'object') {
    throw new Error('Unsupported SEO page copy registry');
  }
  const pages: Record<string, SeoPageCopy> = {};
  for (const [pathname, page] of Object.entries(registry.pages)) {
    if (seoPageForExactPath(pathname)?.pathname !== pathname) {
      throw new Error(`SEO page copy for ${pathname}: the page is not in the SEO registry`);
    }
    const sections = (page as { sections?: unknown })?.sections;
    if (!Array.isArray(sections) || sections.length === 0) throw new Error(`SEO page copy for ${pathname} has no sections`);
    pages[pathname] = {
      sections: sections.map((section: { question?: unknown; body?: unknown }, index): SeoPageCopySection => {
        const where = `${pathname} section ${index + 1}`;
        if (!filled(section?.question) || !section.question.trim().endsWith('?')) {
          throw new Error(`SEO page copy ${where} needs a heading that is a question`);
        }
        if (!Array.isArray(section.body) || section.body.length === 0) throw new Error(`SEO page copy ${where} has no body`);
        const body = section.body.map((block: unknown): SeoPageCopyBlock => {
          const texts = Array.isArray(block) ? block : [block];
          if (texts.length === 0 || !texts.every(filled)) throw new Error(`SEO page copy ${where} has an empty block`);
          texts.forEach(text => assertLinks(text, where));
          return Array.isArray(block) ? Object.freeze([...block]) : block as string;
        });
        return Object.freeze({ question: section.question.trim(), body: Object.freeze(body) });
      }),
    };
    Object.freeze(pages[pathname]);
  }
  return Object.freeze(pages);
}

const copies = parseSeoPageCopy(rawCopy);

/** The text of a registry page, or `null` for a page without one. */
export function seoPageCopy(pathname: string): SeoPageCopy | null {
  const page = seoPageForExactPath(pathname);
  return (page && copies[page.pathname]) ?? null;
}
