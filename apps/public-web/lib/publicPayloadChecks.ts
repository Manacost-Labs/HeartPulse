import type { ArchetypeCatalog } from '@/src/features/ConstructedArchetypes';
import type { CosmeticKind } from '@/src/modules/cosmetics/public';
import type { PublicPayloadCheck } from './firstPaintStore';
import { publicArchetypeCatalog } from './publicArchetypeCatalogTeaserData';
import { cosmeticsCatalogSeed } from './publicCosmeticsCatalogData';
import { articlesData } from './articlesData';
import { homeSummaryData } from './homeSummaryData';
import { publicFunDecksPreview } from './publicFunDecksPreviewData';

/**
 * What each data page needs from the answer of its Express path. The store
 * keeps an answer only if the check holds, so a 200 with another shape
 * (a changed contract, an error body) is a failed read and the last good
 * copy stays (the type guards of the leaderboards and streamers are checks as
 * they are). The page loaders and the probe of `proxy.ts` pass the same check.
 */
const usable = (convert: (raw: unknown) => unknown): PublicPayloadCheck => raw => {
  try {
    return convert(raw) !== null;
  } catch {
    return false; // the data modules throw on a field outside the contract
  }
};

export const homeSummaryCheck = usable(homeSummaryData);
export const homeArticlesCheck = usable(raw => articlesData(raw));
export const funDecksCheck = usable(publicFunDecksPreview);
export const archetypeTeaserCheck = (format: ArchetypeCatalog['format']) => usable(raw => publicArchetypeCatalog(raw, format));
export const cosmeticsCatalogCheck = (kind: CosmeticKind, url: string) => usable(raw => cosmeticsCatalogSeed(kind, url, raw));
