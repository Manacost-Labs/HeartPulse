import type { PatchNotesPoolGroup, PatchNotesPoolItem } from '../../contract.js';

const spellRef = (name: string, sourceName: string, tier: number): PatchNotesPoolItem => ({
  name,
  sourceName,
  tier,
});

const spellAdded = (
  name: string,
  sourceName: string,
  tier: number,
  cost: number,
  text: string,
): PatchNotesPoolItem => ({ name, sourceName, tier, cost, text });

const trinketRef = (name: string, sourceName: string, tribe: string): PatchNotesPoolItem => ({
  name,
  sourceName,
  tribe,
});

export const SPELLS_POOL_GROUP: PatchNotesPoolGroup = {
  id: 'bg-spells',
  mode: 'battlegrounds',
  title: 'Заклинания таверны',
  removed: [
    spellRef('Флаг Альянса', 'Alliance Flag', 1),
    spellRef('Безграничные возможности', 'Boundless Potential', 4),
    spellRef('Благословение жуков', 'Boon of Beetles', 4),
    spellRef('Кровавый обстрел', 'Blood Gem Barrage', 4),
    spellRef('Могучее дыхание дракона', 'Mighty Dragonbreath', 4),
    spellRef('Разъедающая жижа', 'Sludge Corrosion', 4),
    spellRef('Заряжающая камера', 'Energizing Chamber', 5),
    spellRef('Разделка туши', 'Butchering', 5),
    spellRef('Дар Фэндрала', 'Fandral\'s Fortune', 6),
  ],
  added: [
    spellAdded('Воззвание земли', 'Invocation of Earth', 2, 1, 'Дает существу +3/+3. Если это элементаль, также дает ему «Провокацию» до следующего хода.'),
    spellAdded('Воззвание огня', 'Invocation of Fire', 3, 1, 'Дает существу +4/+4. Если это элементаль, также дает ему «Перерождение» до следующего хода.'),
    spellAdded('Нечестивый ритуал', 'Unholy Ritual', 3, 1, 'Дает нежити «Предсмертный хрип: призывает двух скелетов 1/1».'),
    spellAdded('Благословение Голдринна', 'Goldrinn\'s Blessing', 4, 1, 'Ваши звери получают +1/+1 до конца матча (где бы они ни находились).'),
    spellAdded('Бурный рост', 'Tumultuous Growth', 4, 2, 'Выберите существо. Применяет 2 случайных заклинания таверны (по возможности нацеленных на него).'),
    spellAdded('Воззвание воздуха', 'Invocation of Air', 4, 1, 'Дает существу +5/+5. Если это элементаль, также дает ему «Неистовство ветра» до следующего хода.'),
    spellAdded('Воззвание воды', 'Invocation of Water', 5, 1, 'Дает существу +6/+6. Если это элементаль, также дает ему «Божественный щит» до следующего хода.'),
    spellAdded('Повеление стихиями', 'Command the Elements', 5, 3, 'Вы получаете все 4 Элементальных воззвания.'),
    spellAdded('Драконья буря', 'Dragonstorm', 6, 3, 'Дает вашим драконам эффект «В конце вашего хода получает +2/+2».'),
  ],
  returning: [
    spellRef('Заостренная стрела', 'Pointy Arrow', 1),
    spellRef('Глубоководный клан', 'Deepwater Clan', 4),
  ],
};

export const TRINKETS_POOL_GROUP: PatchNotesPoolGroup = {
  id: 'bg-trinkets',
  mode: 'battlegrounds',
  title: 'Аксессуары',
  note: 'Аксессуары уходят из основного пула, но остаются доступны героям вроде Марина Менеджера и Баттонса.',
  removed: [
    trinketRef('Бокал свежего взгляда', 'Glass of Perspective', 'Малый аксессуар'),
    trinketRef('Жучиное кольцо', 'Beetle Band', 'Малый аксессуар'),
    trinketRef('Зачарованный ключ', 'Spell-powered Wrench', 'Малый аксессуар'),
    trinketRef('Портрет вечности', 'Eternal Portrait', 'Малый аксессуар'),
    trinketRef('Портрет звукорегулятора', 'Volumizer Portrait', 'Малый аксессуар'),
    trinketRef('Портрет лев-рыбы', 'Lionfish Portrait', 'Малый аксессуар'),
    trinketRef('Портрет рассекателя разума', 'Mindslasher Portrait', 'Малый аксессуар'),
    trinketRef('Бокал свежего взгляда', 'Glass of Perspective', 'Большой аксессуар'),
    trinketRef('Жучиное кольцо', 'Beetle Band', 'Большой аксессуар'),
    trinketRef('Злой портрет', 'Snarky Portrait', 'Большой аксессуар'),
    trinketRef('Изображение жижи', 'Sludge Portrait', 'Большой аксессуар'),
    trinketRef('Наклейка со следопытом', 'Trailblazer Sticker', 'Большой аксессуар'),
    trinketRef('Портрет беглеца', 'Escapee Portrait', 'Большой аксессуар'),
    trinketRef('Портрет вечности', 'Eternal Portrait', 'Большой аксессуар'),
    trinketRef('Портрет впередсмотрящего', 'Surveyor Portrait', 'Большой аксессуар'),
    trinketRef('Портрет звукорегулятора', 'Volumizer Portrait', 'Большой аксессуар'),
    trinketRef('Портрет небесного голема', 'Sky Golem Portrait', 'Большой аксессуар'),
    trinketRef('Портрет преобразователя', 'Converter Portrait', 'Большой аксессуар'),
    trinketRef('Портрет царицы', 'Czarina Portrait', 'Большой аксессуар'),
    trinketRef('Серп мясника', 'Butcher\'s Sickle', 'Большой аксессуар'),
  ],
  returning: [
    trinketRef('Портрет ара', 'Macaw Portrait', 'Малый аксессуар'),
  ],
};
