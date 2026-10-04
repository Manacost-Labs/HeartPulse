// Catalog text carries a few HTML references at most. The `entities` package
// decodes all 2,000+ names but ships 15 KiB of gzip tables to every card page,
// so this decoder knows only the references card text uses and leaves any
// other name as written. tests/html-plain-text.test.ts checks it against
// `entities` for every name below and for numeric references.
const NAMED_REFERENCES = new Map(Object.entries({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '­',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  sbquo: '‚',
  bdquo: '„',
  bull: '•',
  middot: '·',
  times: '×',
  minus: '−',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  hearts: '♥',
}));

// Code points 128–159 name Windows-1252 characters in HTML; 0 keeps the code point.
const WINDOWS_1252 = [
  8364, 0, 8218, 402, 8222, 8230, 8224, 8225, 710, 8240, 352, 8249, 338, 0, 381, 0,
  0, 8216, 8217, 8220, 8221, 8226, 8211, 8212, 732, 8482, 353, 8250, 339, 0, 382, 376,
];

function numericReference(codePoint: number): string {
  if (!Number.isFinite(codePoint) || codePoint === 0 || (codePoint >= 0xd800 && codePoint <= 0xdfff) || codePoint > 0x10ffff) {
    return '�';
  }
  return String.fromCodePoint(codePoint >= 128 && codePoint <= 159 ? WINDOWS_1252[codePoint - 128] || codePoint : codePoint);
}

function decodeReferences(text: string): string {
  return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/g, (reference, decimal?: string, hex?: string, name?: string) => {
    if (decimal !== undefined) return numericReference(Number.parseInt(decimal, 10));
    if (hex !== undefined) return numericReference(Number.parseInt(hex, 16));
    return NAMED_REFERENCES.get(name ?? '') ?? reference;
  });
}

/** Decode catalog text consistently in server rendering and browser presentation. */
export function htmlPlainText(value: string | null | undefined): string {
  if (!value) return '';
  return decodeReferences(value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim();
}
