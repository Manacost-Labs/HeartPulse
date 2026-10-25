/**
 * Words of HSGuru archetype names for the automatic Russian label
 * (`autoArchetypeLabel`). Keys are lower-case phrases of one to three words;
 * the longest phrase wins. `p` stands before the class («Квест Жрец»), `s`
 * after it («Воин на драконах»), `q` goes into brackets at the end. Card and
 * hero names are their ruRU names from HearthstoneJSON (25.10.2026); mechanic
 * words follow the jargon of the manual translations in the admin («Квест»,
 * «Квестлайн», «Милл», «Хэндбафф»). Expansion codes HSGuru adds for Wild
 * quests are spelled out in Russian where the expansion is certain.
 */
export type ArchetypeTerm = { p: string } | { s: string } | { q: string };

const p = (value: string): ArchetypeTerm => ({ p: value });
const s = (value: string): ArchetypeTerm => ({ s: value });
const q = (value: string): ArchetypeTerm => ({ q: value });

export const ARCHETYPE_TERMS: Readonly<Record<string, ArchetypeTerm>> = {
  // HSGuru tags: 40-card Renathal lists, singleton lists, quest expansions.
  xl: p('Ренатал'), renathal: p('Ренатал'), hl: p('Хайландер'), highlander: p('Хайландер'), higlander: p('Хайландер'),
  std: q('из Стандарта'), lc: q('Затерянный город'), jtu: q("Ун'Горо"), sou: q('Ульдум'),
  // Codes whose expansion is not certain stay as HSGuru writes them, for the admin to name.
  att: q('AtT'), bbu: q('BBU'), bu: q('BU'), lpg: q('LPG'), ffu: q('FFU'), dmh: q('DMH'),
  cta: s('с Призывом к оружию'), 'call to arms': s('с Призывом к оружию'),
  '6 7': q('6–7'), other: p('Прочий'), otk: p('ОТК'),
  // Plans and jargon, as the admin writes them.
  quest: p('Квест'), questline: p('Квестлайн'), seed: p('Квестлайн'), aggro: p('Агро'), control: p('Контроль'),
  combo: p('Комбо'), midrange: p('Мидрейндж'), tempo: p('Темпо'), token: p('Токен'), dude: p('Токен'),
  mill: p('Милл'), miracle: p('Миракл'), fatigue: p('Фатиг'), spell: p('Спелл'), 'spell damage': p('СПД'),
  'big spell': s('на больших заклинаниях'), big: p('Большой'), small: p('Малый'), handbuff: p('Хэндбафф'),
  secret: p('Секрет'), face: p('Фейс'), burn: s('на прямом уроне'), exodia: p('Экзодия'), clone: s('на копиях'),
  copy: s('на копиях'), cycle: s('на цикле'), discard: s('на сбросе'), deckless: s('без колоды'),
  'no minion': s('без существ'), 'no hand': s('без руки'), even: p('Четный'), odd: p('Нечетный'),
  pure: p('Чистый'), rainbow: p('Радужный'), aura: p('Аура'), libram: s('на манускриптах'), armor: s('на броне'),
  attack: s('на атаке'), weapon: s('на оружии'), location: s('на областях'), deathrattle: s('на предсмертных хрипах'),
  taunt: s('на провокациях'), rush: s('на натиске'), discover: s('на раскопке'), heal: s('на лечении'),
  imbue: s('на силе героя'), harold: s('на возвещении'), herald: s('на возвещении'), thief: s('на воровстве'),
  corpse: s('на трупах'), plague: s('на чуме'), blood: s('Крови'), frost: s('Льда'), unholy: s('Нечестивости'),
  shadow: s('Тьмы'), holy: s('на заклинаниях Света'), arcane: s('на тайной магии'), fel: s('на Скверне'),
  sneaky: s('на скрытности'), outcast: s('на изгое'), alignment: s('на выравнивании'), insanity: s('с Ползучим безумием'),
  masochist: s('на самоуроне'), 'end of turn': s('на конце хода'), 'spell school': s('на школах магии'),
  // Tribes.
  dragon: s('на драконах'), beast: s('на зверях'), pirate: s('на пиратах'), mech: s('на механизмах'),
  demon: s('на демонах'), elemental: s('на элементалях'), murloc: s('на мурлоках'), naga: s('на нагах'),
  undead: s('на нежити'), treant: s('на древнях'), totem: s('на тотемах'), egg: p('Кхелос'),
  boar: s('на Элвиннских вепрях'), 'elwynn boar': s('на Элвиннских вепрях'),
  // Old Gods and other cards that name archetypes (ruRU names; «К'тун», «Н'зот» as the manual rows spell them).
  "c'thun": p("К'тун"), "n'zoth": p("Н'зот"), "y'shaarj": p("И'Шарадж"), yogg: p('Йогг-Сарон'),
  "mecha'thun": p("Меха-К'тун"), ammunae: p('Аммунаэ'), deios: p('Дейос'), tyrande: p('Тиранда'), medivh: p('Медив'),
  morchie: p('Морхи'), neptulon: p('Нептулон'), magmaw: p('Магмарь'), zuramat: p('Зурамат'), "thal'ena": p("Тал'ена"),
  mug: p("Граб'Зи"), zee: p("Граб'Зи"), "mug'zee": p("Граб'Зи"), velarok: p('Веларок'), lynessa: p('Линесса'),
  rivendare: p('Ривендер'), odyn: p('Один'), murozond: p('Дорнозму'), therazane: p('Теразан'), krona: p('Крона'),
  kingsbane: s('с Погибелью Королей'), "il'gynoth": p("Ил'гинот"), wallow: p('Иводрев'), stego: p('Стегодон'),
  gaia: p('Гея'), quasar: p('Квазар'), toki: p('Токи'), raza: p('Раза'), aviana: p('Авиана'), ysera: p('Изера'),
  ysondre: p('Исондра'), maiev: p('Майев'), garona: p('Гарона'), sif: p('Сиф'), godfrey: p('Годфри'),
  octosari: p('Октосари'), hagatha: p('Хагата'), maestra: p('Маэстро'), colifero: p('Колиферо'), owlonius: p('Совухоний'),
  bwonsamdi: p('Бвонсамди'), bwomsamdi: p('Бвонсамди'), shudderwock: p('Дрыжеглот'), shudder: p('Дрыжеглот'),
  barnes: p('Барнс'), malygos: p('Малигос'), whizbang: p('Чудастер'), splendiferous: p('Чудастер'), elise: p('Элиза'),
  broxigar: p('Броксигар'), blobxigar: p('Броксигар'), reno: p('Рено'), togwaggle: p('Вихлепых'), tog: p('Вихлепых'),
  'miner togwaggle': p('Вихлепых'), arkwing: p('Каронитовый'), swiftscale: p('Рептилоид'), linecracker: p('Пробойник'),
  ashamane: p('Пеплошкурая'), vanessa: p('Ванесса'), aya: p('Айя'), ayaya: p('Айя'), nazmani: p('Назмани'),
  "ohn'ahra": p("Он'ара"), alex: p('Алекстраза'), 'loh-cky': p('Ло'), loh: p('Ло'), divergence: s('с Расхождением'),
  impfernal: p('Бес-инфернал'), securitybot: p('Охранобот'), igneous: p('Магмоед'), 'tick tock': p('Тик-Так'),
  infinity: s('с Бесконечностью'), protoss: p('Протосс'), zerg: p('Зерг'), starship: p('Звездолет'),
  chad: p('Таддиус'), leoroxx: p('Леорокс'), herenn: p('Геренн'), dungar: p('Дунгар'), hostage: p('Заложник'),
  zarimi: p('Зарими'), merithra: p('Меритра'), 'two-bit': p('Смутьян'), two: p('Смутьян'), champions: p('Защитники'),
  "lo'gosh": p("Ло'гош"), logosh: p("Ло'гош"), finja: p('Мурлиндзя'), soothsayer: p('Гадалка'), murmur: p('Рокотун'),
  "sul'thraze": p("Суль'траз"), manastorm: s('с Бурей маны'), summoner: p('Тамсин'), leyline: s('на силовых линиях'),
  astral: p('Астрал'), asteroid: p('Астероид'), animancer: p('Анимант'), gladiator: p('Гладиатор'),
  warsong: s('с Погонщицей Песни Войны'), chef: p('Шеф-повар'), 'chef nomi': p('Шеф-повар'),
  wilted: s('с Увядшей тенью'), ravenous: s('с Прожорливой сквернохотницей'), 'cliff dive': s('с Прыжком с обрыва'),
  'huddle up': p('Рамп'), hydration: s('на провокациях'), 'two coins': p('Смутьян'), contraband: s('на контрабанде'),
  tripwire: s('на растяжках'), relic: s('на реликвиях'), 'star grazer': p('Звездный'), 'astral communion': p('Астрал'),
  peddler: s('на предсмертных хрипах'), switcheroo: s('с Подменой'), tentacle: s('со щупальцами'), orb: s('со Сферой власти'),
  'kingslayer': s('с Убийцей королей'), 'divine spirit': p('Спелл'), 'bacon and eggs': p('Кхелос'), dino: p('Динопират'),
  "tol'vir": p("Тол'вир"), ashtongue: p('Пеплоуст'), automaton: p('Автоматон'), drake: p('Драконий'),
  'old murk-eye': p('Мрачноглаз'), cute: s('с Симпатичной куклой'), capriodi: p('Каприоди'), copium: p('Контроль'),
  impformant: p('Бес-информатор'), 'alternate reality': s('с Альтернативной реальностью'), 'drilling': s('на бурении'),
  'mine': s('на шахте'), 'rez': s('на воскрешении'), 'garrote': s('с Гарротой'), 'archmage': p('Чистый'),
  sanctum: p('Святилище'), mother: p('Мать выводка'), dark: s('на темных дарах'), 'dark gift': s('на темных дарах'),
  gift: s('на темных дарах'), well: s('на желаниях'), 'roll': p('Рок-н-ролл'), "'n' roll": p('Рок-н-ролл'),
  "'n'": p('Рок-н-ролл'), 'shark': p('Акулий'), 'beetle': s('на жуках'), 'amalgam': p('Слияние'), 'prepared': s('на подготовке'),
  'rock': p('Рок-н-ролл'), 'damage': p('СПД'), 'turnadin': p('Ноздорму'), 'sludge': s('на слизи'),
  void: s('Бездны'), 'void soul': s('Бездны'), soul: s('на душах'), shreds: s('на обрывках'), rafaam: p('Рафаам'),
  disco: s('на сбросе'), pig: s('с Расхождением'), freeze: s('на заморозке'), owl: s('на совах'), azshara: p('Азшара'),
  floppy: s('с Мягкой гидрой'), ogre: p('Огр'), auctioneer: p('Аукционистка'), miner: p('Рудокоп'), blaze: p('Пылающий'),
  old: q('старый список'), zoo: p('Зоо'), briarspawn: p('Шипорожденный'), enrage: s('на исступлении'),
  hand: s('на большой руке'), companion: p('Компаньон'),
  'communion': p('Астрал'), 'patron': s('с завсегдатаями'), 'curse': s('на проклятиях'), 'pain': s('на самоуроне'),
};
