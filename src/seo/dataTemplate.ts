/**
 * Metadata templates that carry live data: `Мета Hearthstone {month}: …`.
 *
 * `{token}` is replaced by a value; `[ … ]` is an optional group (no nesting)
 * that is dropped when one of its tokens has no value, and, when the whole
 * text is longer than the limit, dropped from the last group to the first
 * until it fits. A token outside a group is required: without its value the
 * text cannot be built and the caller falls back to the page's static text.
 */

const TOKEN = /\{([a-zA-Z]+)\}/g;
const GROUP = /(\[[^[\]]*\])/;

export type SeoDataValues = Readonly<Record<string, string | null | undefined>>;

function hasValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** Tokens a template names, in order of appearance. */
export function seoDataTemplateTokens(template: string): string[] {
  return [...template.matchAll(TOKEN)].map(match => match[1]);
}

/** Throws when the template names a token outside `allowed` or has unbalanced or nested brackets. */
export function assertSeoDataTemplate(template: string, allowed: readonly string[], label: string): void {
  let depth = 0;
  for (const char of template) {
    if (char === '[') depth += 1;
    if (char === ']') depth -= 1;
    if (depth < 0 || depth > 1) throw new Error(`Invalid optional group in SEO template ${label}`);
  }
  if (depth !== 0) throw new Error(`Invalid optional group in SEO template ${label}`);
  for (const token of seoDataTemplateTokens(template)) {
    if (!allowed.includes(token)) throw new Error(`Unsupported SEO data token in ${label}: {${token}}`);
  }
}

type Piece = { text: string; optional: boolean };

function fill(text: string, values: SeoDataValues): string | null {
  let complete = true;
  const filled = text.replace(TOKEN, (_match, token: string) => {
    const value = values[token];
    if (!hasValue(value)) { complete = false; return ''; }
    return value;
  });
  return complete ? filled : null;
}

function compose(pieces: readonly Piece[]): string {
  return pieces.map(piece => piece.text).join('').replace(/\s+/g, ' ').trim();
}

/**
 * Renders `template` with `values` into at most `maxLength` characters, or
 * `null` when a required token has no value or the required part alone is
 * longer than the limit.
 */
export function renderSeoDataTemplate(template: string, values: SeoDataValues, maxLength: number): string | null {
  const pieces: Piece[] = [];
  for (const part of template.split(GROUP)) {
    if (part === '') continue;
    const optional = part.startsWith('[');
    const filled = fill(optional ? part.slice(1, -1) : part, values);
    if (filled === null) {
      if (optional) continue;
      return null;
    }
    pieces.push({ text: filled, optional });
  }
  while (compose(pieces).length > maxLength) {
    let last = pieces.length - 1;
    while (last >= 0 && !pieces[last].optional) last -= 1;
    if (last === -1) return null;
    pieces.splice(last, 1);
  }
  return compose(pieces);
}
