import assert from 'node:assert/strict';
import {
  constructedTribeLabel,
  constructedSpellSchoolLabel,
  constructedWikiTagLabel,
  constructedWikiTranslationMap,
  mergeConstructedTranslationSources,
  localizeConstructedMediaLabel,
  localizeConstructedSoundDescription,
  translateConstructedMechanic,
} from '../shared/constructedCardTranslations.js';

assert.equal(
  translateConstructedMechanic('FRENZY'),
  'Бешенство',
  'the official Russian Frenzy label must replace the currently visible typo',
);
assert.equal(
  translateConstructedMechanic('COLOSSAL'),
  'Гигант',
  'the current official Russian card text uses the "Гигант" keyword',
);
assert.equal(translateConstructedMechanic('JADE_LOTUS'), 'Нефритовый Лотос');
assert.equal(
  translateConstructedMechanic('custom mechanic', { CUSTOM_MECHANIC: 'Новая механика' }),
  'Новая механика',
  'admin translations must work for normalized human-readable keys',
);

assert.equal(
  constructedTribeLabel('Undead'),
  'Нежить',
  'card details must never leak the raw English Undead tribe',
);
assert.equal(constructedTribeLabel('DRAGON'), 'Дракон');
assert.equal(constructedTribeLabel('QUILBOAR'), 'Свинобраз');
assert.equal(constructedTribeLabel(''), '—');
assert.equal(constructedSpellSchoolLabel('ARCANE'), 'Тайная магия');
assert.equal(constructedSpellSchoolLabel('FEL'), 'Скверна');
assert.equal(constructedSpellSchoolLabel(''), '—');

const expectedWikiTags: Record<string, string> = {
  Copy: 'Копирование',
  'Draw Cards': 'Взятие карт',
  'Deckbuilding Effect': 'Эффект при сборе колоды',
  'Hand Related': 'Связано с рукой',
  Random: 'Случайный эффект',
};
for (const [rawTag, expectedLabel] of Object.entries(expectedWikiTags)) {
  assert.equal(
    constructedWikiTagLabel(rawTag),
    expectedLabel,
    `${rawTag} must have a curated Russian label`,
  );
}
assert.equal(
  constructedWikiTagLabel('Draw Cards', { DRAW_CARDS: 'Добор карт' }),
  'Добор карт',
  'an admin-provided wiki tag translation must override the curated fallback',
);

assert.deepEqual(
  constructedWikiTranslationMap({
    wiki_mechanics_localized: [{ name_en: 'Spellburst', name_ru: 'Резонанс' }],
    wiki_tags_localized: [
      { name_en: 'Deck Related', name_ru: 'Связано с колодой' },
      { name_en: 'Empty', name_ru: '   ' },
    ],
  }),
  { SPELLBURST: 'Резонанс', DECK_RELATED: 'Связано с колодой' },
  'localized terms supplied by db.kolodahs must be normalized and reused',
);

const upstreamTranslations = {
  wiki_mechanics_localized: [{ name_en: 'Spellburst', name_ru: 'Перевод db.kolodahs' }],
};
assert.equal(
  translateConstructedMechanic('SPELLBURST', mergeConstructedTranslationSources(upstreamTranslations)),
  'Перевод db.kolodahs',
  'an upstream localized term must override the built-in fallback',
);
assert.equal(
  translateConstructedMechanic('SPELLBURST', mergeConstructedTranslationSources(upstreamTranslations, { SPELLBURST: 'Ручной перевод' })),
  'Ручной перевод',
  'an admin override must take priority over the upstream localized term',
);
assert.equal(
  translateConstructedMechanic('SPELLBURST', mergeConstructedTranslationSources({})),
  'Резонанс',
  'the official built-in label must remain the final fallback',
);

assert.equal(localizeConstructedMediaLabel('Full art', 'Арт 1'), 'Полный арт');
assert.equal(localizeConstructedMediaLabel('Golden card', 'Изображение'), 'Золотая карта');
assert.equal(localizeConstructedMediaLabel('', 'Арт 2'), 'Арт 2');
assert.equal(localizeConstructedMediaLabel('Отдельный арт', 'Арт'), 'Отдельный арт');

assert.equal(localizeConstructedSoundDescription('<music stinger>'), 'Музыкальная заставка');
assert.equal(localizeConstructedSoundDescription('<summon sound>'), 'Звук призыва');
assert.equal(localizeConstructedSoundDescription('<attack sound>'), 'Звук атаки');
assert.equal(localizeConstructedSoundDescription('<death sound>'), 'Звук смерти');
assert.equal(localizeConstructedSoundDescription('<trigger sound>'), 'Звук срабатывания');
assert.equal(localizeConstructedSoundDescription('For Azeroth!'), 'For Azeroth!', 'spoken card lines must not be machine-translated');
assert.equal(localizeConstructedSoundDescription(''), '');

console.log('constructed card Russian translation tests passed');
