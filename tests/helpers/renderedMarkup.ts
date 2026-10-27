import { registerHooks } from 'node:module';
import { decodeHTML } from 'entities';

/**
 * Reads server-rendered markup the way a visitor or an assistive technology
 * meets it: visible text, links, buttons, headings and ARIA roles. Tests built
 * on it assert on what the page shows, not on how the component is written.
 *
 * The parser covers React's `renderToStaticMarkup` output only: well-formed,
 * quoted attributes, no comments or scripts in the rendered tree.
 */

/** Imports a module whose components import `.css` files Node cannot load. */
export async function importWithoutStyles<T>(url: URL): Promise<T> {
  const hooks = registerHooks({ resolve(target, context, nextResolve) {
    return target.endsWith('.css')
      ? { url: 'data:text/javascript,export{}', shortCircuit: true }
      : nextResolve(target, context);
  } });
  try { return await import(url.href) as T; }
  finally { hooks.deregister(); }
}

/**
 * `text` is what a sighted visitor reads inside the element; `name` is what
 * assistive technology reads: the same text without `aria-hidden` or `hidden`
 * descendants (decorative marks, icons, duplicated captions).
 */
export type RenderedElement = { tag: string; attrs: Record<string, string>; text: string; name: string };

const VOID_TAGS = new Set(['area', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TAG_PATTERN = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;

/** Text a visitor reads: tags removed, entities decoded, whitespace collapsed. */
export function visibleText(html: string): string {
  return decodeHTML(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(/([^\s=/>]+)(?:="([^"]*)")?/g)) attrs[match[1]] = decodeHTML(match[2] ?? '');
  return attrs;
}

const isHidden = (attrs: Record<string, string>) =>
  'hidden' in attrs || ('aria-hidden' in attrs && attrs['aria-hidden'] !== 'false');

type Tag = { closing: boolean; tag: string; attrs: Record<string, string>; start: number; end: number; selfClosing: boolean };

function tags(html: string): Tag[] {
  return [...html.matchAll(TAG_PATTERN)].map(match => ({
    closing: Boolean(match[1]), tag: match[2].toLowerCase(), attrs: parseAttrs(match[3]),
    start: match.index ?? 0, end: (match.index ?? 0) + match[0].length,
    selfClosing: Boolean(match[4]) || VOID_TAGS.has(match[2].toLowerCase()),
  }));
}

/** The markup with every hidden subtree blanked out, keeping each offset in place. */
function withoutHidden(html: string, parsed: Tag[]): string {
  let result = html;
  const open: Array<{ tag: string; start: number; hidden: boolean }> = [];
  for (const tag of parsed) {
    if (tag.closing) {
      const entry = open.pop();
      if (!entry || entry.tag !== tag.tag) throw new Error(`Unbalanced </${tag.tag}> in rendered markup`);
      if (entry.hidden && !open.some(parent => parent.hidden)) {
        result = result.slice(0, entry.start) + ' '.repeat(tag.end - entry.start) + result.slice(tag.end);
      }
      continue;
    }
    if (!tag.selfClosing) open.push({ tag: tag.tag, start: tag.start, hidden: isHidden(tag.attrs) });
  }
  if (open.length) throw new Error(`Unclosed <${open.at(-1)?.tag}> in rendered markup`);
  return result;
}

/** Every element exposed to readers, in document order, with decoded attributes, text and name. */
export function elements(html: string): RenderedElement[] {
  const parsed = tags(html);
  const accessible = withoutHidden(html, parsed);
  const found: RenderedElement[] = [];
  const open: Array<{ element: RenderedElement; start: number; hidden: boolean }> = [];
  for (const tag of parsed) {
    if (tag.closing) {
      const entry = open.pop()!;
      entry.element.text = visibleText(html.slice(entry.start, tag.start));
      entry.element.name = visibleText(accessible.slice(entry.start, tag.start));
      continue;
    }
    const hidden = open.some(entry => entry.hidden) || isHidden(tag.attrs);
    const element = { tag: tag.tag, attrs: tag.attrs, text: '', name: '' };
    if (!hidden) found.push(element);
    if (!tag.selfClosing) open.push({ element, start: tag.end, hidden });
  }
  return found;
}

/** Links a visitor can follow: their accessible name and destination. */
export function links(html: string): Array<{ name: string; href: string }> {
  return elements(html).filter(element => element.tag === 'a' && 'href' in element.attrs)
    .map(element => ({ name: element.attrs['aria-label'] || element.name, href: element.attrs.href }));
}

/** Buttons by accessible name; `disabled` reflects both the attribute and aria-disabled. */
export function buttons(html: string): Array<{ name: string; disabled: boolean }> {
  return elements(html).filter(element => element.tag === 'button' || element.attrs.role === 'button')
    .map(element => ({
      name: element.attrs['aria-label'] || element.name,
      disabled: 'disabled' in element.attrs || element.attrs['aria-disabled'] === 'true',
    }));
}

/** Headings in document order, as "h2 Title". */
export function headings(html: string): string[] {
  return elements(html).filter(element => /^h[1-6]$/.test(element.tag))
    .map(element => `${element.tag} ${element.name}`);
}

/** Elements exposing an explicit ARIA role, as "role: accessible name". */
export function roles(html: string): string[] {
  return elements(html).filter(element => element.attrs.role)
    .map(element => `${element.attrs.role}: ${element.attrs['aria-label'] || element.name}`);
}

/** The element a label names (aria-label), or undefined. */
export function labelled(html: string, label: string): RenderedElement | undefined {
  return elements(html).find(element => element.attrs['aria-label'] === label);
}
