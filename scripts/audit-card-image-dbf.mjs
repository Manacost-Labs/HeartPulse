#!/usr/bin/env node
// Сверка cardId -> dbf из cards_ru.json с HearthstoneJSON (#472).
// Использование:
//   node scripts/audit-card-image-dbf.mjs <cards_ru.json> <hearthstonejson-cards.json>
// cards.json: https://api.hearthstonejson.com/v1/latest/enUS/cards.json (бесплатный, скачать вручную).
// Печатает JSON: wrongOtherCard (dbf указывает на карту с другим названием: картинка
// чужая), wrongTwin (на CORE-двойника, картинка та же), dbfMissing (dbf пустой: Blizzard
// не используется), unknownCard (карты нет в HearthstoneJSON).
import { readFileSync } from 'node:fs';

const [ruPath, hsjsonPath] = process.argv.slice(2);
if (!ruPath || !hsjsonPath) {
  console.error('Usage: audit-card-image-dbf.mjs <cards_ru.json> <hearthstonejson-cards.json>');
  process.exit(2);
}
const ru = JSON.parse(readFileSync(ruPath, 'utf8'));
const hsjson = JSON.parse(readFileSync(hsjsonPath, 'utf8'));
const byId = new Map(hsjson.map(card => [card.id, card]));
const byDbf = new Map(hsjson.map(card => [card.dbfId, card]));
const report = { total: Object.keys(ru).length, wrongOtherCard: [], wrongTwin: [], dbfMissing: [], unknownCard: [] };

for (const [cardId, entry] of Object.entries(ru)) {
  const real = byId.get(cardId);
  if (!real) { report.unknownCard.push(cardId); continue; }
  const dbf = Number(entry?.dbf ?? 0);
  if (dbf === real.dbfId) continue;
  if (!dbf) { report.dbfMissing.push(cardId); continue; }
  const owner = byDbf.get(dbf);
  const row = { cardId, fileDbf: dbf, realDbf: real.dbfId, pointsTo: owner?.id ?? null, pointsToName: owner?.name ?? null };
  (owner && owner.name === real.name ? report.wrongTwin : report.wrongOtherCard).push(row);
}
console.log(JSON.stringify(report, null, 2));
