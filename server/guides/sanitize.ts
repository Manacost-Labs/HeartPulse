import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'figcaption', 'figure', 'h2', 'h3', 'h4', 'hr',
  'i', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
];
const NON_TEXT_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'button', 'select', 'textarea', 'canvas', 'svg', 'video', 'audio'];

function sectionId(value: string): string {
  return value && /^[\w-]{1,100}$/.test(value) ? `guide-section-${value}` : '';
}

function isDecoration(src: string): boolean {
  const path = new URL(src).pathname.toLowerCase().replace(/%20/g, ' ');
  return path.includes('/separations/') || path.includes('subpage-body-bg')
    || /\/design\/user\/(?:bolt[\w ()-]*|fire|ashes_bulletpoint)\.png$/.test(path);
}

// Remove only empty wrappers, preserving named anchors, images and single-letter text.
function removeEmptyWrappers(html: string): string {
  let previous: string;
  do {
    previous = html;
    html = html.replace(/<(p|div|span|em|i|b|strong|a)>(?:\s|&nbsp;|<br\s*\/?>)*<\/\1>/gi, '');
    html = html.replace(/<a(?:\s+(?:href|target|rel)="[^"]*")*>\s*<\/a>/gi, '');
  } while (html !== previous);
  return html.replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>').trim();
}

export interface OldGuideSanitizer {
  normalizeAssetUrl: (value: unknown) => string;
  normalizeLink: (value: unknown) => string;
  sanitizeHtml: (value: unknown) => string;
}

export function createOldGuideSanitizer(publicUrl: string): OldGuideSanitizer {
  const base = String(publicUrl || 'https://old.kolodahearthstone.ru').replace(/\/$/, '') + '/';
  function normalizeAssetUrl(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, base);
      if (['kolodahearthstone.ru', 'www.kolodahearthstone.ru'].includes(url.hostname) && url.pathname.startsWith('/design/')) {
        return new URL(url.pathname + url.search, base).href;
      }
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }
  function normalizeLink(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!raw || /^(?:#|mailto:|tel:)/i.test(raw)) return raw;
    return normalizeAssetUrl(raw) || '#';
  }
  return {
    normalizeAssetUrl, normalizeLink,
    sanitizeHtml: value => sanitizeGuideHtml(String(value ?? ''), normalizeAssetUrl, normalizeLink),
  };
}

function sanitizeGuideHtml(html: string, assetUrl: OldGuideSanitizer['normalizeAssetUrl'], link: OldGuideSanitizer['normalizeLink']): string {
  return removeEmptyWrappers(sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      '*': ['id'], a: ['href', 'target', 'rel'], img: ['src', 'alt', 'loading', 'decoding'],
      td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'],
    },
    allowedClasses: { code: ['guide-deck-code'], img: ['guide-inline-image'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    nonTextTags: NON_TEXT_TAGS,
    parseStyleAttributes: false,
    transformTags: {
      h1: 'h2',
      '*': (tagName, attribs) => {
        const id = sectionId(attribs.id || (tagName === 'a' ? attribs.name : '') || '');
        const { id: _id, name: _name, ...rest } = attribs;
        return { tagName, attribs: { ...rest, ...(id ? { id } : {}) } };
      },
      img: (_tag, attrs) => {
        const code = attrs['data-clipboard-text']?.trim();
        if (code && /^[A-Za-z0-9+/=]{20,2048}$/.test(code)) {
          return { tagName: 'code', attribs: { class: 'guide-deck-code' }, text: code };
        }
        const src = assetUrl(attrs.src || attrs['data-src']);
        if (!src || isDecoration(src)) return { tagName: 'span', attribs: {} };
        const width = Number(attrs.width || attrs.style?.match(/(?:^|;)\s*width:\s*(\d+)px/i)?.[1]);
        return { tagName: 'img', attribs: {
          src, alt: attrs.alt?.trim() || 'Иллюстрация к гайду', loading: 'lazy', decoding: 'async',
          ...(width > 0 && width <= 64 ? { class: 'guide-inline-image' } : {}),
        } };
      },
      a: (_tag, attrs) => {
        const href = link(attrs.href);
        const id = attrs.id || attrs.name;
        const attribs: Record<string, string> = id ? { id } : {};
        if (href.startsWith('#')) {
          const target = sectionId(href.slice(1));
          if (target) attribs.href = `#${target}`;
        } else if (href) {
          Object.assign(attribs, { href, target: '_blank', rel: 'noopener noreferrer' });
        }
        return { tagName: 'a', attribs };
      },
    },
  }));
}
