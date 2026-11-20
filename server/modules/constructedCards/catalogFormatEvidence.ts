type CatalogFormat = 'standard' | 'wild';

function collectFormatEvidence(value: unknown, evidence: Set<CatalogFormat>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectFormatEvidence(item, evidence);
    return;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['slug', 'name', 'id', 'name_en', 'name_ru']) {
      collectFormatEvidence(record[key], evidence);
    }
    return;
  }
  if (typeof value === 'number') {
    if (value === 1) evidence.add('wild');
    if (value === 2) evidence.add('standard');
    return;
  }
  const normalized = String(value ?? '').trim().toLocaleLowerCase('en-US');
  if (normalized === '1' || normalized === 'wild' || normalized === 'вольный') evidence.add('wild');
  if (normalized === '2' || normalized === 'standard' || normalized === 'стандарт' || normalized === 'стандартный') {
    evidence.add('standard');
  }
}

/** Which formats a source card says it belongs to; an empty set is no claim. */
export function formatEvidence(card: Record<string, unknown> | null | undefined): Set<CatalogFormat> {
  const evidence = new Set<CatalogFormat>();
  collectFormatEvidence(card?.format, evidence);
  collectFormatEvidence(card?.game_format, evidence);
  collectFormatEvidence(card?.formats, evidence);
  return evidence;
}
