export type PublicBattlegroundHero = {
  dbfId: number;
  cardId: string | null;
  name: string;
  image: string;
  heroPower: { name: string; text: string | null; image: string } | null;
};

function optionalText(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('Invalid public hero projection');
  return value;
}

function imageUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('https://hearthpulse.net/')) {
    throw new Error('Invalid public hero image');
  }
  return value;
}

/** Accepts only the anonymous hero identity fields; statistics never cross into HTML. */
export function publicBattlegroundHero(value: unknown, dbfId: string): PublicBattlegroundHero {
  if (!value || typeof value !== 'object' || !('hero' in value)) throw new Error('Invalid public hero projection');
  const hero = value.hero as Record<string, unknown>;
  if (hero.dbfId !== Number(dbfId) || typeof hero.name !== 'string' || !hero.name) {
    throw new Error('Invalid public hero identity');
  }
  const power = hero.heroPower;
  if (power !== null && (!power || typeof power !== 'object')) throw new Error('Invalid public hero power');
  const powerRecord = power as Record<string, unknown> | null;
  if (powerRecord && (typeof powerRecord.name !== 'string' || !powerRecord.name)) {
    throw new Error('Invalid public hero power');
  }
  return {
    dbfId: hero.dbfId as number,
    cardId: optionalText(hero.cardId),
    name: hero.name,
    image: imageUrl(hero.image),
    heroPower: powerRecord ? {
      name: powerRecord.name as string,
      text: optionalText(powerRecord.text),
      image: imageUrl(powerRecord.image),
    } : null,
  };
}
