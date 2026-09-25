import { sameOriginPublicResourceUrl } from '../../../shared/publicResourceUrl';

export type PublicBattlegroundLibraryCard = {
  dbfId: number;
  kind: 'minion' | 'spell';
  name: string;
  typeName: string;
  text: string | null;
  image: string;
  canonicalPath: string;
};

/** Keeps only verified anonymous card identity in Next HTML and hydration. */
export function publicBattlegroundLibraryCard(value: unknown, kindPath: 'minions' | 'spells', dbfId: string): PublicBattlegroundLibraryCard {
  if (!value || typeof value !== 'object' || !('card' in value) || !('canonicalPath' in value)) {
    throw new Error('Invalid public Battleground card projection');
  }
  const root = value as { card: unknown; canonicalPath: unknown };
  if (!root.card || typeof root.card !== 'object') throw new Error('Invalid public Battleground card');
  const card = root.card as Record<string, unknown>;
  const kind = kindPath === 'minions' ? 'minion' : 'spell';
  if (card.dbfId !== Number(dbfId) || card.kind !== kind
    || typeof card.nameRu !== 'string' || !card.nameRu.trim()
    || typeof card.typeName !== 'string' || !card.typeName.trim()) {
    throw new Error('Invalid public Battleground card identity');
  }
  const canonicalPath = root.canonicalPath;
  if (typeof canonicalPath !== 'string'
    || !new RegExp(`^/library/${kindPath}/[a-zа-я0-9-]{1,80}-${dbfId}/$`, 'u').test(canonicalPath)) {
    throw new Error('Invalid public Battleground card canonical path');
  }
  const images = card.images && typeof card.images === 'object' ? card.images as Record<string, unknown> : {};
  const image = sameOriginPublicResourceUrl(images.card ?? images.framed, 'https://hearthpulse.net')
    ?? 'https://hearthpulse.net/assets/og-preview.png';
  if (card.textRu !== null && typeof card.textRu !== 'string') throw new Error('Invalid public Battleground card text');
  return {
    dbfId: card.dbfId as number, kind, name: card.nameRu,
    typeName: card.typeName, text: card.textRu as string | null,
    image, canonicalPath,
  };
}
