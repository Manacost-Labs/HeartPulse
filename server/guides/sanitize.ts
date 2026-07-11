const OLD_GUIDE_ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'figcaption', 'figure', 'h2', 'h3', 'h4', 'hr',
  'i', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
]);

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: unknown): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function htmlAttribute(attrs: string, name: string): string {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = attrs.match(pattern);
  return String(match?.[2] ?? match?.[3] ?? match?.[4] ?? '').trim();
}

export interface OldGuideSanitizer {
  normalizeAssetUrl: (value: unknown) => string;
  normalizeLink: (value: unknown) => string;
  sanitizeHtml: (value: unknown) => string;
}

export function createOldGuideSanitizer(publicUrl: string): OldGuideSanitizer {
  const normalizedPublicUrl = String(publicUrl || 'https://old.kolodahearthstone.ru').replace(/\/$/, '');

  function normalizeAssetUrl(rawValue: unknown): string {
    const raw = String(rawValue ?? '').trim();
    if (!raw) return '';
    if (raw.startsWith('//')) return `https:${raw}`;
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
      const path = raw.startsWith('/') ? raw : `/${raw}`;
      return `${normalizedPublicUrl}${path}`;
    }
  }

  function normalizeLink(rawValue: unknown): string {
    const raw = String(rawValue ?? '').trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return raw;
    if (/^javascript:/i.test(raw)) return '#';
    if (raw.startsWith('//')) return `https:${raw}`;
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '#';
    } catch {
      const path = raw.startsWith('/') ? raw : `/${raw}`;
      return `${normalizedPublicUrl}${path}`;
    }
  }

  function sanitizeGuideHtml(rawHtml: unknown): string {
    let html = String(rawHtml ?? '');
    if (!html.trim()) return '';

    html = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\s*(script|style|iframe|object|embed|form|input|button|select|textarea|canvas|svg|video|audio)\b[\s\S]*?<\/\s*\1\s*>/gi, '')
      .replace(/<\s*(script|style|iframe|object|embed|form|input|button|select|textarea|canvas|svg|video|audio)\b[^>]*\/?>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s(style|class|id|width|height|align|valign|border|cellpadding|cellspacing)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    html = html.replace(/<img\b([^>]*)>/gi, (_full, attrs) => {
      const src = normalizeAssetUrl(htmlAttribute(attrs, 'src') || htmlAttribute(attrs, 'data-src'));
      if (!src) return '';
      const normalizedSrc = src.toLowerCase();
      if (normalizedSrc.includes('/separations/') || normalizedSrc.includes('subpage-body-bg')) return '';
      const alt = htmlAttribute(attrs, 'alt');
      return `<figure><img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" loading="lazy" decoding="async"></figure>`;
    });

    html = html.replace(/<a\b([^>]*)>/gi, (_full, attrs) => {
      const href = normalizeLink(htmlAttribute(attrs, 'href'));
      if (!href || href === '#') return '<a>';
      return `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">`;
    });

    html = html.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (full, rawTag, attrs) => {
      const tag = String(rawTag).toLowerCase();
      if (!OLD_GUIDE_ALLOWED_TAGS.has(tag)) return '';
      if (full.startsWith('</')) return `</${tag}>`;
      if (tag === 'a') return full;
      if (tag === 'img') {
        const src = normalizeAssetUrl(htmlAttribute(attrs, 'src'));
        if (!src) return '';
        return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(htmlAttribute(attrs, 'alt'))}" loading="lazy" decoding="async">`;
      }
      if (tag === 'br' || tag === 'hr') return `<${tag}>`;
      return `<${tag}>`;
    });

    return html
      .replace(/<p>\s*<a href="#[^"]*"[^>]*>\s*(?:наверх|к оглавлению)\s*<\/a>\s*<\/p>/gi, '')
      .replace(/<a href="#[^"]*"[^>]*>\s*(?:наверх|к оглавлению)\s*<\/a>/gi, '')
      .replace(/^(?:\s*<\/(?:li|ul|ol)>)+/gi, '')
      .replace(/<p>\s*<\/p>/gi, '')
      .replace(/<a>\s*<\/a>/gi, '')
      .replace(/<strong>\s*<\/strong>/gi, '')
      .replace(/<span>\s*<\/span>/gi, '')
      .replace(/<p>(?:\s|&nbsp;|<strong>|<\/strong>|<span>|<\/span>|<i>|<\/i>)*<\/p>/gi, '')
      .replace(/<p>\s*<\/p>/gi, '')
      .replace(/<p>\s*<\/p>/gi, '')
      .replace(/<p>\s*(<figure>[\s\S]*?<\/figure>)\s*<\/p>/gi, '$1')
      .replace(/<p>\s*<a([^>]*)>\s*(<figure>[\s\S]*?<\/figure>)\s*<\/a>\s*<\/p>/gi, '<a$1>$2</a>')
      .replace(/<p>\s*([А-ЯA-Z])\s*<\/p>/g, '')
      .replace(/(?:<br>\s*){3,}/gi, '<br><br>')
      .trim();
  }

  return {
    normalizeAssetUrl,
    normalizeLink,
    sanitizeHtml: sanitizeGuideHtml,
  };
}
