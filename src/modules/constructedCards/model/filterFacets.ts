/** Providers emit both upper- and lower-case codes for the same facet. */
export function constructedFacetValues(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim().toUpperCase()).filter(Boolean))];
}
