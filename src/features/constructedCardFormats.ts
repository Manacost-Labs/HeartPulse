export type ConstructedCardFormatMetadata = {
  slug: string;
  name_ru?: string;
  name_en?: string;
};

export function cardSupportsStandardStatistics(
  formats?: ConstructedCardFormatMetadata[],
): boolean {
  if (!formats?.length) return true;
  return formats.some(format => format.slug.trim().toLowerCase() === 'standard');
}
