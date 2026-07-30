export type PublicResourceLinkOptions = {
  publicOrigin?: string;
};

export type PublicArchetypeLinks = {
  web: string;
  statistics: string;
  history: string;
  analysis: string;
  builds: string;
};

export type PublicDeckLinks = {
  archetype: string;
  statistics: string;
  builder: string;
  archetypeBuilds: string;
};

const DEFAULT_PUBLIC_ORIGIN = 'https://arena.hs-manacost.ru';

function normalizePublicOrigin(value: unknown): string {
  const raw = typeof value === 'string' && value.trim()
    ? value.trim()
    : DEFAULT_PUBLIC_ORIGIN;
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Public API origin must use HTTP or HTTPS');
  }
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = '/';
  return parsed.origin;
}

function absoluteUrl(
  origin: string,
  path: string,
  query?: Record<string, string>,
): string {
  const url = new URL(path, `${origin}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Builds only first-party URLs. Source-provider links never cross the public
 * API boundary, and callers cannot influence the configured origin.
 */
export function createPublicResourceLinks(options: PublicResourceLinkOptions = {}) {
  const origin = normalizePublicOrigin(options.publicOrigin);

  const archetype = (format: 'standard' | 'wild', slug: string): PublicArchetypeLinks => ({
    web: absoluteUrl(origin, `/standard/archetypes/${format}/${slug}`),
    statistics: absoluteUrl(origin, `/api/v1/archetypes/${slug}/statistics`, { format }),
    history: absoluteUrl(origin, `/api/v1/archetypes/${slug}/statistics/history`, { format }),
    analysis: absoluteUrl(origin, `/api/v1/archetypes/${slug}/analysis`, { format }),
    builds: absoluteUrl(origin, '/api/v1/deck-statistics', { format, archetype: slug }),
  });

  return {
    archetype,
    deck(
      format: 'standard' | 'wild',
      slug: string,
      deckId: string,
      deckCode: string,
    ): PublicDeckLinks {
      return {
        archetype: archetype(format, slug).web,
        statistics: absoluteUrl(origin, `/api/v1/decks/${deckId}/statistics`, { format }),
        builder: absoluteUrl(origin, '/deck-builder', { format, code: deckCode }),
        archetypeBuilds: archetype(format, slug).builds,
      };
    },
  };
}
