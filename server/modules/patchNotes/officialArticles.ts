import { shortPatchVersion } from './contract.js';
import { parsePatchArticle, type PatchCardResolver } from './parser.js';

type Row = Record<string, unknown>;

export function buildNumber(value: unknown): number {
  const match = String(value ?? '').match(/\d+\.\d+\.\d+\.(\d+)/);
  return match ? Number(match[1]) : 0;
}


/** Official transcriptions fill only the latest build's missing or unparseable article. */
export function supplementOfficialArticles(rows: Row[], officialArticles: readonly Row[], resolve: PatchCardResolver): Row[] {
  let articles = rows;
  for (const official of officialArticles) {
    const version = shortPatchVersion(official.version);
    const newest = articles.filter(row => shortPatchVersion(row.version) === version)
      .sort((left, right) => buildNumber(right.version) - buildNumber(left.version))[0];
    if (newest?.match_state === 'matched'
      && parsePatchArticle(String(newest.content_text ?? ''), Array.isArray(newest.sections) ? newest.sections : [], resolve).entries.length > 0) continue;
    articles = [...articles.filter(row => shortPatchVersion(row.version) !== version), official];
  }
  return articles;
}
