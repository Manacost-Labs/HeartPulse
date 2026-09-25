import { sameOriginPublicResourceUrl } from '../../../shared/publicResourceUrl';
import { battlegroundLibraryDetailKind, type BattlegroundLibraryPool } from './battlegroundLibraryDetailKinds';

export type PublicBattlegroundLibraryCard = {
  dbfId: number;
  kind: 'minion' | 'spell' | 'anomaly' | 'dark_gift' | 'quest' | 'reward' | 'darkmoon_prize' | 'trinket' | 'timewarped';
  name: string;
  typeName: string;
  text: string | null;
  image: string;
  canonicalPath: string;
};

/** Keeps only verified anonymous card identity in Next HTML and hydration. */
export function publicBattlegroundLibraryCard(value: unknown, kindPath: string, dbfId: string,
  pool: BattlegroundLibraryPool = 'current'): PublicBattlegroundLibraryCard {
  if (!value || typeof value !== 'object' || !('card' in value) || !('canonicalPath' in value)) {
    throw new Error('Invalid public Battleground card projection');
  }
  const root = value as { card: unknown; canonicalPath: unknown };
  if (!root.card || typeof root.card !== 'object') throw new Error('Invalid public Battleground card');
  const card = root.card as Record<string, unknown>;
  const config = battlegroundLibraryDetailKind(kindPath, pool);
  if (!config || card.dbfId !== Number(dbfId) || card.kind !== config.kind
    || typeof card.nameRu !== 'string' || !card.nameRu.trim()
    || typeof card.typeName !== 'string' || !card.typeName.trim()) {
    throw new Error('Invalid public Battleground card identity');
  }
  const canonicalPath = root.canonicalPath;
  const prefix = pool === 'archive' ? '/library/archive' : '/library';
  if (typeof canonicalPath !== 'string'
    || !new RegExp(`^${prefix}/${kindPath}/[a-zа-я0-9-]{1,80}-${dbfId}/$`, 'u').test(canonicalPath)) {
    throw new Error('Invalid public Battleground card canonical path');
  }
  const images = card.images && typeof card.images === 'object' ? card.images as Record<string, unknown> : {};
  const image = sameOriginPublicResourceUrl(images.card ?? images.framed, 'https://hearthpulse.net')
    ?? 'https://hearthpulse.net/assets/og-preview.png';
  if (card.textRu !== null && typeof card.textRu !== 'string') throw new Error('Invalid public Battleground card text');
  return {
    dbfId: card.dbfId as number, kind: config.kind, name: card.nameRu,
    typeName: card.typeName, text: card.textRu as string | null,
    image, canonicalPath,
  };
}
