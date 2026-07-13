export type StandardMetaClassKey =
  | 'deathknight'
  | 'demonhunter'
  | 'druid'
  | 'hunter'
  | 'mage'
  | 'paladin'
  | 'priest'
  | 'rogue'
  | 'shaman'
  | 'warlock'
  | 'warrior';

const CLASS_BY_API_NAME: Record<string, StandardMetaClassKey> = {
  deathknight: 'deathknight',
  demonhunter: 'demonhunter',
  druid: 'druid',
  hunter: 'hunter',
  mage: 'mage',
  paladin: 'paladin',
  priest: 'priest',
  rogue: 'rogue',
  shaman: 'shaman',
  warlock: 'warlock',
  warrior: 'warrior',
};

export function normalizeStandardMetaClass(value: unknown): StandardMetaClassKey | null {
  const normalized = String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return CLASS_BY_API_NAME[normalized] ?? null;
}

export function inferStandardMetaClass(archetype: unknown): StandardMetaClassKey | null {
  const value = ` ${String(archetype ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const rules: Array<[RegExp, StandardMetaClassKey]> = [
    [/\b(?:death knight|deathknight|dk)\b/, 'deathknight'],
    [/\b(?:demon hunter|demonhunter|dh)\b/, 'demonhunter'],
    [/\bwarlock\b|\b[a-z0-9]*lock\b/, 'warlock'],
    [/\bpaladin\b|\b[a-z0-9]*turnadin\b/, 'paladin'],
    [/\bwarrior\b/, 'warrior'],
    [/\bshaman\b/, 'shaman'],
    [/\bhunter\b/, 'hunter'],
    [/\bdruid\b/, 'druid'],
    [/\bpriest\b/, 'priest'],
    [/\brogue\b/, 'rogue'],
    [/\bmage\b/, 'mage'],
  ];
  return rules.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}
