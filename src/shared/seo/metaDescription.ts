/** Search engines show about 150–160 characters of a description snippet. */
export const META_DESCRIPTION_MAX = 160;

/**
 * Fits a meta description into the snippet length. Whitespace is collapsed and
 * a longer text is cut at the last word boundary with an ellipsis, so the
 * snippet never ends mid-word.
 */
export function fitMetaDescription(text: string, max = META_DESCRIPTION_MAX): string {
  const plain = text.replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > max * 0.6 ? cut.slice(0, boundary) : cut).replace(/[\s,.;:—–-]+$/, '')}…`;
}
