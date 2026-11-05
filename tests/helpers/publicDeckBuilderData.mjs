import { readFileSync } from 'node:fs';

export const cards = [
  { card_id: 'CS2_029', dbf: 315, class: 'MAGE', name: { ru: 'Огненный шар' }, mana_cost: 4, rarity: 'COMMON' },
  { card_id: 'BE_259', dbf: 129851, class: 'MAGE', name: { ru: 'Изисет' }, mana_cost: 7, rarity: 'LEGENDARY' },
  { card_id: 'CS2_120', dbf: 1368, class: 'NEUTRAL', name: { ru: 'Речной кроколиск' }, mana_cost: 2, rarity: 'COMMON' },
].map(card => ({ ...card, images: { card: `https://api.kolodahearthstone.com/uploads/${card.card_id}.png`,
  tile: `https://api.kolodahearthstone.com/uploads/card-tiles/${card.card_id}.png` } }));
export const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1WQAAAAASUVORK5CYII=', 'base64');
export const axe = readFileSync(import.meta.resolve('axe-core').replace('file://', ''), 'utf8');

