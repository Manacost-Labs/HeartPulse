/**
 * Карты, у которых до #472 в кеш картинок могла попасть чужая картинка:
 * dbf в устаревшем cards_ru.json (июнь 2026) указывал на другую карту.
 * Список получен сравнением cards_ru.json с HearthstoneJSON
 * (scripts/audit-card-image-dbf.mjs). Только эти карты получают новый ?v= и
 * один раз перекачиваются сервером, остальной кеш не трогается.
 */
export const CARD_IMAGE_REPAIR_REVISION = 'dbf472';

export const CARD_IMAGE_REPAIR_CARD_IDS: readonly string[] = [
  'CORE_DRG_037',
  'ICC_206',
  'ICC_469',
  'TIME_005t3',
  'TIME_005t4',
  'TIME_005t7',
  'TIME_005t8',
  'TIME_020t1',
  'TIME_020t2',
  'TIME_609',
  'TIME_609t1',
  'TIME_609t2',
  'TIME_852t1',
  'TIME_852t3',
  'TIME_890t',
  'TIME_890t2',
];

const REPAIR_IDS = new Set(CARD_IMAGE_REPAIR_CARD_IDS);

export function isCardImageRepairCard(cardId: unknown): boolean {
  return REPAIR_IDS.has(String(cardId ?? '').trim());
}

/** Суффикс версии URL: меняет адрес картинки только у исправленных карт. */
export function withCardImageRepairVersion(version: string, cardId: unknown): string {
  return isCardImageRepairCard(cardId) ? `${version}-${CARD_IMAGE_REPAIR_REVISION}` : version;
}
