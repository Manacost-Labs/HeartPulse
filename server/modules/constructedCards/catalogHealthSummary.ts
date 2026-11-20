import { statSync } from 'node:fs';

type Format = 'standard' | 'wild';

/** What readiness needs of a stored catalog: its identity and age, not its cards. */
export type CatalogHealthSummary = { verifiedAt: string; publishedAt: string; count: number; datasetVersion: string };

export type CatalogSummaryInspection = {
  state: 'fresh' | 'stale' | 'expired' | 'missing';
  document: CatalogHealthSummary | null;
  ageMs: number | null;
  repairWarning: string | null;
};

type Options = {
  /** Both copies and the degradation marker of a format: any write to them changes their stat. */
  files: (format: Format) => string[];
  /** The full inspection: reads and compares both copies (~2 s for Wild, 2 × 33 MB). */
  inspect: (format: Format) => CatalogSummaryInspection;
  now: () => number;
  freshWindowMs: number;
  maxStaleMs: number;
};

const summaryOf = (document: CatalogHealthSummary | null): CatalogHealthSummary | null => document && {
  verifiedAt: document.verifiedAt, publishedAt: document.publishedAt, count: document.count, datasetVersion: document.datasetVersion,
};

/**
 * The stored catalog's inspection for readiness checks, read again only after
 * a copy or the marker changed on disk (inode, size, mtime). Readiness read and
 * compared both copies on every call; monitors call it about once a minute and
 * each call froze the server long enough for card pages to answer 503 (#669).
 * Age is evaluated on every call.
 */
export function createCatalogHealthSummary(options: Options) {
  const known = new Map<Format, { disk: string; document: CatalogHealthSummary | null; repairWarning: string | null }>();
  const disk = (format: Format) => options.files(format).map(pathname => {
    try {
      const stat = statSync(pathname);
      return `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    } catch {
      return '-';
    }
  }).join('|');

  return {
    /** Records a catalog this process has just written to both copies, so the next check does not read it back. */
    remember(format: Format, document: CatalogHealthSummary) {
      known.set(format, { disk: disk(format), document: summaryOf(document), repairWarning: null });
    },
    read(format: Format): CatalogSummaryInspection {
      let entry = known.get(format);
      const current = disk(format);
      if (entry?.disk !== current) {
        const inspection = options.inspect(format);
        entry = { disk: current, document: summaryOf(inspection.document), repairWarning: inspection.repairWarning };
        known.set(format, entry);
      }
      const { document, repairWarning } = entry;
      if (!document) return { state: 'missing', document: null, ageMs: null, repairWarning: null };
      const ageMs = Math.max(0, options.now() - Date.parse(document.verifiedAt));
      if (ageMs > options.maxStaleMs) return { state: 'expired', document, ageMs, repairWarning };
      return { state: repairWarning || ageMs > options.freshWindowMs ? 'stale' : 'fresh', document, ageMs, repairWarning };
    },
  };
}
