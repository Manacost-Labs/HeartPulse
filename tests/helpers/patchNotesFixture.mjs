/** Two stored hs-data-api patch rows shaped like the 36.6.3 and 35.6.2 hs-manacost.ru articles. */
export const patchNotesFixture = [
  {
    version: '36.6.3.253932', hs_manacost_version: '36.6.3', match_state: 'matched',
    title: 'Обновление 36.6.3: балансные изменения Стандарта и Полей сражений',
    official_published_at: '2026-10-01T15:55:00+00:00', official_url: 'https://playhearthstone.com/en-us/blog/24303864',
    source_url: 'https://hs-manacost.ru/obnovlenie-36-6-3/',
    sections: [{ level: 'h2', title: 'Изменения Hearthstone' }, { level: 'h2', title: 'Изменения Полей сражений' }],
    content_text: [
      'Изменения Hearthstone ',
      'Змей ветреных вершин ',
      'До изменения: Боевой клич: наносит 5 ед. урона. Родня: стоит на (3) меньше. ',
      'После : Боевой клич: наносит 5 ед. урона. Родня: стоит на (2) меньше . ',
      'Паучок ',
      'До изменения: 1 атаки, 3 здоровья ',
      'После : 1 атаки, 2 здоровья ',
      'Изменения Полей сражений ',
      'ИЗМЕНЕНИЯ СТОИМОСТИ МАЛЫХ АКСЕССУАРОВ ',
      'Baleful Incense: 4 → 3 ',
      'Hammer of Twilight: 1 → 2 ',
    ].join('\n'),
  },
  {
    version: '35.6.2.245096', hs_manacost_version: '35.6.2', match_state: 'matched',
    title: 'Обновление 35.6.2 уже в игре', official_published_at: '2026-06-11T10:00:00+00:00',
    content_text: 'Изменения Hearthstone\nСейсмопод\nДо изменения: [Стоимость 9] 9 атаки, 9 здоровья\nПосле: [Стоимость 8] 8 атаки, 8 здоровья',
  },
];
