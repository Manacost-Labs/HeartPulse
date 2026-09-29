/** App Router `searchParams` of a page segment. */
export type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Serializes App Router search params in request order for the public URL policy. */
export function searchParamsQuery(values: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach(entry => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  return params.toString();
}
