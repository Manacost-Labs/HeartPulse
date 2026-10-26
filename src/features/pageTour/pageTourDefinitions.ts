import type { PageTourLike, PageTourMediaKind, TourPlacement } from './pageTourModel';

export type PageTourAccess = {
  authenticated: boolean;
  admin: boolean;
  standard: boolean;
  arena: boolean;
  battlegrounds: boolean;
};

export type PageTourAudience = 'all' | 'authenticated' | 'non-admin' | 'admin' | 'standard' | 'arena' | 'battlegrounds';

export type PageTourStep = {
  id: string;
  target: string;
  title: string;
  description: string;
  mobileDescription?: string;
  audience?: PageTourAudience;
  preferredPlacement?: Exclude<TourPlacement, 'bottom-sheet'>;
  /** Shown on wider screens only: a phone sheet keeps the target visible instead. */
  media?: PageTourMediaKind;
};

export type PageTourDefinition = PageTourLike & {
  title: string;
  steps: readonly PageTourStep[];
};

export function isTourStepEligible(step: PageTourStep, access: PageTourAccess): boolean {
  switch (step.audience ?? 'all') {
    case 'authenticated': return access.authenticated;
    case 'non-admin': return access.authenticated && !access.admin;
    case 'admin': return access.admin;
    case 'standard': return access.standard || access.admin;
    case 'arena': return access.arena || access.admin;
    case 'battlegrounds': return access.battlegrounds || access.admin;
    default: return true;
  }
}

export const PAGE_TOURS: readonly PageTourDefinition[] = [
  {
    id: 'profile', version: 1, paths: ['/profile'], title: 'Как устроен ваш профиль',
    steps: [
      { id: 'summary', target: 'profile-summary', title: 'Ваш профиль', description: 'Здесь имя, основной контакт и ссылка на публичный профиль, которой можно поделиться.', preferredPlacement: 'bottom' },
      { id: 'contacts', target: 'profile-contacts', title: 'Контакты и рассылка', description: 'Контакты нужны, только чтобы передать приз победителю конкурса. Здесь же включается рассылка. Эти поля не подтверждают подписку.', preferredPlacement: 'bottom' },
      { id: 'access', target: 'profile-access-status', title: 'Доступ к разделам', description: 'Есть ли у вас подписка. Что она открывает и когда её проверяли — в разделе «Подписка» ниже; «Проверить снова» заново спрашивает Boosty, Patreon и Telegram.', audience: 'authenticated', preferredPlacement: 'bottom' },
      { id: 'telegram', target: 'profile-telegram-access', title: 'Привязка Telegram', description: 'Привяжите Telegram, чтобы входить через него и получать доступ по VIP-каналу. Поле @username в контактах привязкой не считается.', audience: 'non-admin', preferredPlacement: 'top' },
      { id: 'boosty', target: 'profile-boosty-access', title: 'Подтверждение Boosty', description: 'Введите почту из Boosty-профиля и шестизначный код из письма: сайт откроет разделы вашего уровня.', audience: 'non-admin', preferredPlacement: 'top' },
      { id: 'contests', target: 'profile-contests', title: 'Ваши конкурсы', description: 'Здесь появляются ваши заявки, их статус, призы и отметка победы.', preferredPlacement: 'top' },
      { id: 'actions', target: 'profile-account-actions', title: 'Меню аккаунта', description: 'В меню «⋯» — контакты для призов и выход из аккаунта на этом устройстве.', audience: 'admin', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'standard-matchups', version: 6, paths: ['/standard/matchups'], title: 'Как читать матчапы',
    steps: [
      { id: 'rank', target: 'matchups-rank', title: 'Формат', description: 'Переключайте Стандарт и Вольный: у каждого формата своя матрица. Ранг выборки указан в заголовке таблицы ниже.', audience: 'standard' },
      { id: 'views', target: 'matchups-views', title: 'Матрица или один архетип', description: '«Полная матрица» показывает все пары сразу. «Обзор архетипа» — одна колода против каждого соперника: полоса от 50%, группы «Хорошие» (52% и выше), «Ровные» (48–52%) и «Сложные» (ниже 48%), плюс средний винрейт по классам.', audience: 'standard', preferredPlacement: 'bottom' },
      { id: 'matrix', target: 'matchups-grid', title: 'Как читать цвет', description: 'Строка — ваш архетип, столбец — соперник, последний столбец — винрейт против всей меты. Зелёный — выгодно, красный — нет; цвет насыщается к ±8 п. от 50%. Бледная клетка — редкая пара, «·» — источник не публикует винрейт. Наведите на клетку, чтобы увидеть винрейт и точность.', mobileDescription: 'Выберите архетип, которым играете: на телефоне матрица становится списком его соперников, от худших к лучшим. Бледные строки — редкие пары с неточным винрейтом.', audience: 'standard', preferredPlacement: 'top', media: 'heat' },
      { id: 'summary', target: 'matchups-summary', title: 'Сильнейшие архетипы', description: 'Лидеры по винрейту против меты, у каждого — самая удобная и самая сложная пара. Нажмите архетип, чтобы открыть его обзор.', audience: 'standard', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'standard-meta', version: 4, paths: ['/standard/meta'], title: 'Как читать мету',
    steps: [
      { id: 'filters', target: 'meta-filters', title: 'Срез данных', description: 'Формат, диапазон рейтинга, период и «Минимум игр» задают выборку. Карточки, тиры, таблица и карта ниже пересчитываются под этот срез; архетипы с меньшим числом игр скрыты.', audience: 'standard', preferredPlacement: 'bottom', media: 'filters' },
      { id: 'view', target: 'meta-view-switcher', title: 'Карточки, тиры или таблица', description: 'Карточки — быстрый обзор: винрейт, популярность, длина матча и звёзды в час. Тиры группируют архетипы от S до D. Таблицу можно сортировать по любому столбцу, в ней видно изменение винрейта и тренд.', audience: 'standard', media: 'views' },
      { id: 'winrate', target: 'meta-results', title: 'Винрейт и «мало»', description: 'Винрейт — доля побед. Полоса в таблице — 95% интервал: чем меньше игр, тем она шире. «мало» — меньше 500 игр, такой винрейт ещё сдвинется. Тир считается по осторожной нижней оценке: S от 53%, A от 51%, B от 49%, C от 47%.', audience: 'standard', preferredPlacement: 'bottom', media: 'interval' },
      { id: 'chart', target: 'meta-chart', title: 'Карта меты и доли', description: 'Нажмите «Показать». Правее — популярнее, выше — больше побед, размер точки — число игр, пунктир — 50%; клик открывает архетип. Во вкладке «Доли» площадь плитки — доля игр; рядом список архетипов с фильтром по классу.', audience: 'standard', preferredPlacement: 'bottom', media: 'scatter' },
      { id: 'deck', target: 'meta-deck-action', title: 'Страница архетипа', description: 'Кнопка «Архетип» в карточке или название в таблице ведут к сборкам, муллигану, матчапам и истории архетипа.', audience: 'standard', preferredPlacement: 'left' },
    ],
  },
  {
    id: 'constructed-archetypes', version: 3, paths: ['/standard/archetypes'], title: 'Как найти актуальный архетип',
    steps: [
      { id: 'format', target: 'archetypes-format', title: 'Стандарт или Вольный', description: 'Выберите игровой формат — сводка, список и число доступных сборок сразу обновятся для нужной меты.', audience: 'standard', preferredPlacement: 'bottom' },
      { id: 'class', target: 'archetypes-class-filter', title: 'Выберите класс', description: 'Нажмите иконку героя, чтобы оставить архетипы одного класса. Значок Hearthstone возвращает полный каталог.', audience: 'standard', preferredPlacement: 'bottom' },
      { id: 'search', target: 'archetypes-search', title: 'Быстрый поиск', description: 'Введите русское или английское название архетипа, чтобы уточнить выдачу без перезагрузки страницы.', audience: 'standard' },
      { id: 'sort', target: 'archetypes-sort', title: 'Что важнее', description: 'Отсортируйте каталог по популярности, винрейту, числу игр или количеству найденных сборок.', audience: 'standard' },
      { id: 'results', target: 'archetypes-results', title: 'Откройте досье', description: 'В каждой строке видны ключевые показатели. Нажмите её, чтобы перейти к сборкам, матчапам, муллигану и истории архетипа.', audience: 'standard', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'constructed-archetype-detail', version: 2, paths: ['/standard/archetypes/:format/:slug', '/standard/meta/:format/:slug'], title: 'Как читать страницу архетипа',
    steps: [
      { id: 'summary', target: 'archetype-summary', title: 'Досье и показатели', description: 'Винрейт, популярность, игры, сборки, средняя длина матча и средний ход по данным HSGuru за текущий патч. Стрелка — изменение за сутки в процентных пунктах, мини-график — последние 7 дней.', audience: 'standard', preferredPlacement: 'bottom', media: 'trend' },
      { id: 'builds', target: 'archetype-builds', title: 'Сборки', description: 'Сборки идут по числу игр за 30 дней: первая — самая проверенная. Откройте состав или скопируйте код для импорта в Hearthstone.', audience: 'standard' },
      { id: 'compare', target: 'archetype-compare', title: 'Сравнение сборок', description: 'Нажмите «Сравнить сборки» и отметьте A и Б: винрейт с 95% интервалом, число игр (надёжность выборки), средняя стоимость карты, кривая маны и карты, которыми они отличаются.', audience: 'standard', preferredPlacement: 'top' },
      { id: 'analysis', target: 'archetype-analysis', title: 'Матчапы и муллиган', description: 'Фильтры сверху выбирают срез HSGuru: период (включая «Баны»), ранг, очерёдность хода и класс соперника. Матчапы против классов — сложные сверху. Влияния карты: «Муллиган» — пришла в стартовую руку, «Добор» — взята за игру, «Не пришла» — так и не пришла, «Оставлена» — оставлена в муллигане. Влияние — винрейт таких игр минус средний винрейт колоды; меньше 100 игр — ненадёжно.', audience: 'standard', preferredPlacement: 'top', media: 'impact' },
      { id: 'ranks', target: 'archetype-ranks', title: 'Винрейт по рангам', description: 'Строки — ранги, столбцы — периоды от суток до всего дополнения. Зелёный — выше 50%, красный — ниже, полный цвет при ±10 п. Бледная клетка — мало игр, пустая — меньше 100. Наведите на клетку: игры и интервал.', audience: 'standard', preferredPlacement: 'top', media: 'heat' },
      { id: 'radar', target: 'archetype-radar', title: 'Сравнение с другим архетипом', description: 'Найдите архетип в поле «Сравнить с»: радар ставит оба на шкалы от 0 до 100 — место среди всех архетипов по винрейту, популярности, длине матча, среднему ходу и подъёму по ладдеру. Ниже — кто впереди и их очный матчап.', audience: 'standard', preferredPlacement: 'top' },
      { id: 'history', target: 'archetype-history', title: 'История с полосой', description: 'Срез сохраняется каждые 12 часов. Полоса вокруг винрейта — 95% интервал: узкая, когда игр много. Пунктир — новый период HSGuru (патч или дополнение), после него счётчики начинаются заново.', audience: 'standard', preferredPlacement: 'top', media: 'band' },
    ],
  },
  {
    id: 'standard-fun-decks', version: 2, paths: ['/standard/fun-decks'], title: 'Как пользоваться фан-колодами',
    steps: [
      { id: 'method', target: 'fun-decks-method', title: 'Как считаются оценки', description: 'Здесь объясняется разница между дистанцией от меты и индексом фана, а также указаны минимальные пороги попадания в подборку.', preferredPlacement: 'bottom' },
      { id: 'filters', target: 'fun-decks-filters', title: 'Формат и быстрый поиск', description: 'Переключайтесь между Стандартом и Вольным режимом или найдите колоду по названию, классу, стримеру либо ближайшему архетипу.', preferredPlacement: 'bottom' },
      { id: 'metrics', target: 'fun-decks-card-metrics', title: 'Главные показатели', description: 'В карточке видны винрейт, размер выборки, отличие от ближайшей мета-колоды и итоговый индекс фана.', preferredPlacement: 'bottom' },
      { id: 'deck', target: 'fun-decks-deck-list', title: 'Полный состав и код колоды', description: 'В компактном списке показаны все карты основной колоды и сайдборда. Три сборки можно сравнивать в одном ряду, а deck code — сразу скопировать для импорта в Hearthstone.', mobileDescription: 'Показан полный компактный состав колоды и кнопка копирования deck code.', preferredPlacement: 'top' },
      { id: 'access', target: 'subscription-paywall', title: 'Полная подборка', description: 'В бесплатном превью показаны три лидера выбранного формата. Тариф «Алмаз» открывает остальные колоды и будущие обновления.', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'standard-vicious-gold', version: 3, paths: ['/standard/vicious-gold'], title: 'Как читать Vicious Syndicate Gold',
    steps: [
      { id: 'power', target: 'vicious-power', title: 'Power Tier List', description: 'Ожидаемый винрейт колоды против меты выбранного диапазона рангов. Колоды сгруппированы по тирам S–D, полоса показывает отклонение от 50%.', audience: 'standard', preferredPlacement: 'top' },
      { id: 'power-filters', target: 'vicious-power-filters', title: 'Ранги и класс', description: 'Выберите диапазон рангов и класс. В диапазоне рядом с винрейтом видна разница с той же колодой на всех рангах.', audience: 'standard' },
      { id: 'classes', target: 'vicious-classes', title: 'Доли меты', description: 'Полоса класса делится на его архетипы: оттенок — архетип, подпись — его доля в партиях. Нажмите на класс, чтобы оставить в списке ниже только его колоды.', audience: 'standard' },
      { id: 'decks', target: 'vicious-decks', title: 'Колоды и сборки', description: 'Архетипы заметной популярности со ссылками на их страницы. Поиск и фильтр класса помогают найти нужную колоду.', audience: 'standard' },
      { id: 'build', target: 'vicious-build-action', title: 'Код и состав колоды', description: 'Сборки догружаются отдельно. Скопируйте код колоды или откройте «Колода», чтобы увидеть состав.', audience: 'standard', preferredPlacement: 'left' },
    ],
  },
  {
    id: 'standard-cards', version: 2, paths: ['/standard/cards', '/standard/cards/:format'], title: 'Как пользоваться библиотекой карт',
    steps: [
      { id: 'format', target: 'cards-format', title: 'Стандарт или Вольный', description: 'Переключайте формат, чтобы видеть только карты, разрешённые в Стандарте, либо полную библиотеку Вольного режима.' },
      { id: 'search', target: 'cards-search', title: 'Поиск по названию', description: 'Введите русское или оригинальное название карты. Результаты обновятся вместе с выбранными фильтрами.' },
      { id: 'filters', target: 'cards-filters', title: 'Точные фильтры', description: 'Отберите карты по классу, дополнению, мане, атаке, здоровью, механике, типу и редкости. Ранг и период статистики — в дополнительных фильтрах.', mobileDescription: 'Нажмите «Ещё фильтры», чтобы открыть класс, дополнение, ману, механики, ранг и период статистики. Тур не меняет их сам.', media: 'filters' },
      { id: 'sort', target: 'cards-sort', title: 'Сортировка карт', description: 'Без подписки доступны игровые признаки и новые дополнения; статистические сортировки открываются с тарифом «Алмаз».' },
      { id: 'view', target: 'cards-view-switcher', title: 'Галерея или таблица', description: 'Галерея показывает полноценные карты, а таблица упрощает сравнение характеристик и статистики.' },
      { id: 'statistics', target: 'cards-statistics', title: 'Что значат цифры', description: '«В % колод» — доля колод с этой картой, «Победы колод» — винрейт этих колод, «Партий» — объём выборки. Меньше 100 партий — винрейт не показываем. По умолчанию ранг Легенда; закрытые значения отмечены замком.', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'standard-patches', version: 1, paths: ['/standard/patches'], title: 'Как читать патчноут',
    steps: [
      { id: 'versions', target: 'patch-versions', title: 'Выбор патча', description: 'Переключатель версий открывает другой патч. Выбранная версия попадает в адрес страницы — такой ссылкой можно поделиться.' },
      { id: 'toc', target: 'patch-toc', title: 'Оглавление', description: 'Разделы патча и классы внутри них. Нажмите строку, чтобы перейти к ней; текущий раздел подсвечен.', mobileDescription: 'На телефоне оглавление — список «Перейти к…»: выберите раздел или класс, и страница перейдёт к нему.' },
      { id: 'highlights', target: 'patch-highlights', title: 'Главное в патче', description: 'Самые крупные изменения патча. Короткие разделы, до трёх карт, читаются целиком ниже.', preferredPlacement: 'top' },
      { id: 'flow', target: 'patch-flow', title: 'Карты → архетипы', description: 'Слева изменённые карты, справа самые популярные архетипы на момент выхода патча. Толщина потока — сколько сборок архетипа содержат карту, цвет карты — усиление, ослабление или переработка. Нажмите карту или архетип, чтобы открыть его страницу.', mobileDescription: 'На телефоне диаграмма становится списком: у каждой изменённой карты — архетипы, в сборках которых она встречается.', preferredPlacement: 'top', media: 'sankey' },
      { id: 'filters', target: 'patch-filters', title: 'Поиск и фильтры', description: 'Найдите карту по названию или тексту изменения либо оставьте только бафы, нерфы или прочие изменения. Ниже карты сгруппированы по режимам и классам: было → стало.', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'standard-card-detail', version: 2, paths: ['/standard/cards/:format/:cardId'], title: 'Что есть на странице карты',
    steps: [
      { id: 'art', target: 'card-art', title: 'Версии изображения', description: 'Эти кнопки переключают обычную, золотую, сигнатурную или алмазную версию. Нажмите большую карту выше, чтобы открыть её полностью.' },
      { id: 'identity', target: 'card-identity', title: 'Основная информация', description: 'Под названием собраны стоимость, класс, тип, редкость, дополнение, характеристики и официальное описание карты.' },
      { id: 'statistics', target: 'card-statistics', title: 'Статистика карты', description: 'Формат, ранг и период задают срез: доля колод с картой, винрейт этих колод, средний ход розыгрыша, среднее число копий и сыгранные партии — объём выборки. Данные доступны с тарифом «Алмаз».' },
      { id: 'dynamics', target: 'card-dynamics', title: 'Динамика карты', description: 'Раскройте блок и выберите показатель и период 30, 90 или 180 дней — доступны те, что покрыты данными. Плитки — сейчас, минимум, максимум и длина истории. «Сравнить» добавляет класс или формат, у винрейта при розыгрыше полоса — 95% интервал.', audience: 'standard', media: 'trend' },
      { id: 'patches', target: 'card-patches', title: 'История изменений', description: 'Патчи расположены от новых к старым; для доступных записей можно открыть русскую публикацию на HS-Manacost.' },
      { id: 'pools', target: 'card-pools', title: 'Пулы генерации', description: 'Если карта создаёт другие карты, здесь показан её реальный пул. Кнопка «Показать все» раскрывает оставшиеся варианты.' },
      { id: 'decks', target: 'card-decks', title: 'Колоды с этой картой', description: 'Откройте изображение DeckView, изучите состав и скопируйте код подходящей колоды для импорта в игру.', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'arena-classes', version: 2, paths: ['/classes'], title: 'Как читать рейтинг классов Арены',
    steps: [
      { id: 'ranking', target: 'arena-classes-ranking', title: 'Рейтинг классов', description: 'Классы расположены по проценту побед; длина полосы помогает быстро увидеть разницу между лидерами.', audience: 'arena', preferredPlacement: 'top' },
      { id: 'details', target: 'arena-classes-details', title: 'Как читать строку класса', description: 'Место задаёт порядок рейтинга, шкала и процент показывают винрейт, а справа указано число учтённых игр, если оно доступно.', audience: 'arena', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'arena-tier-list', version: 1, paths: ['/tierlist'], title: 'Как пользоваться тир-листом Арены',
    steps: [
      { id: 'source', target: 'arena-tier-source', title: 'Выберите источник', description: 'HSReplay, HearthArena и Firestone используют разные выборки и оценки, поэтому их результаты можно сравнивать.', audience: 'arena' },
      { id: 'class', target: 'arena-tier-class', title: 'Класс героя', description: 'Выберите класс или общий список. При смене класса дополнительные фильтры сбрасываются, чтобы не скрыть карты случайно.', audience: 'arena' },
      { id: 'filters', target: 'arena-tier-filters', title: 'Фильтры тир-листа', description: 'Редкость и стоимость маны помогают оставить только карты, подходящие под конкретный выбор на драфте.', audience: 'arena' },
      { id: 'view', target: 'arena-tier-view', title: 'Способ представления', description: 'Доступные источнику режимы позволяют переключаться между наглядной галереей и компактным сравнением.', audience: 'arena' },
      { id: 'cards', target: 'arena-tier-results', title: 'Оценки карт', description: 'Наведите курсор или сфокусируйте карту, чтобы увидеть полное изображение и статистику, не покидая список.', mobileDescription: 'Нажмите карту, чтобы открыть полное изображение и подробные показатели — наведение на сенсорном экране не требуется.', audience: 'arena', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'arena-legendaries', version: 1, paths: ['/legendaries'], title: 'Как сравнивать легендарные карты',
    steps: [
      { id: 'source', target: 'arena-legendaries-source', title: 'Источник данных', description: 'Переключайте HSReplay и Firestone: источники используют разные выборки, поэтому группы и показатели могут различаться.', audience: 'arena' },
      { id: 'class', target: 'arena-legendaries-class', title: 'Фильтр класса', description: 'Выберите нужный класс или нейтральные карты, чтобы сравнивать только доступные вашему герою легендарные карты.', audience: 'arena' },
      { id: 'results', target: 'arena-legendaries-results', title: 'Результаты легендарок', description: 'Карты упорядочены по выбранной статистике; размер выборки помогает отличать устойчивый результат от редкого случая.', audience: 'arena', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'battlegrounds-heroes', version: 1, paths: ['/heroes'], title: 'Как выбрать героя Полей сражений',
    steps: [
      { id: 'metrics', target: 'bg-heroes-metrics', title: 'Основные показатели', description: 'Среднее место показывает результат героя, а частота выбора — насколько часто игроки предпочитают его альтернативам.', audience: 'battlegrounds' },
      { id: 'search', target: 'bg-heroes-search', title: 'Поиск героя', description: 'Введите русское или английское имя, чтобы быстро найти героя среди полного актуального списка.', audience: 'battlegrounds' },
      { id: 'results', target: 'bg-heroes-results', title: 'Карточки героев', description: 'Карточка показывает силу героя и статистику; откройте её для подробного распределения мест и связанных данных.', audience: 'battlegrounds', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'battlegrounds-hero-detail', version: 1, paths: ['/heroes/:dbfId'], title: 'Как читать досье героя',
    steps: [
      { id: 'summary', target: 'bg-hero-detail-summary', title: 'Главное о герое', description: 'В верхнем блоке собраны имя, броня, тир, среднее место, частота выбора и ссылки на справочники.', audience: 'battlegrounds' },
      { id: 'media', target: 'bg-hero-detail-media', title: 'Сила героя и компаньон', description: 'Изучите актуальную силу героя, её официальный текст и компаньона, если он доступен в текущем пуле.', audience: 'battlegrounds' },
      { id: 'placement', target: 'bg-hero-detail-placement', title: 'Обзор статистики', description: 'Вкладка «Обзор» показывает места в партиях и винрейт боёв по раундам. Переключайте разделы, чтобы видеть нужный график без длинной ленты.', audience: 'battlegrounds' },
      { id: 'compositions', target: 'bg-hero-detail-compositions', title: 'Лучшие составы', description: 'Откройте вкладку «Составы», чтобы увидеть финальный стол, сравнить составы героя и ключевых существ финала.', audience: 'battlegrounds', preferredPlacement: 'top' },
      { id: 'tables', target: 'bg-hero-detail-tables', title: 'Сила героя и таверна', description: 'Во вкладке «Сила героя» — график по ходам и таблица по уровням таверны. Соседняя вкладка «Таверна» показывает темп улучшений.', audience: 'battlegrounds', preferredPlacement: 'top' },
      { id: 'patches', target: 'bg-hero-detail-patches', title: 'История изменений', description: 'Патчи объясняют, когда характеристики героя менялись и почему старые показатели могли отличаться.', audience: 'battlegrounds', preferredPlacement: 'top' },
      { id: 'gallery', target: 'bg-hero-detail-gallery', title: 'Галерея и звуки', description: 'Дополнительные изображения и реплики появляются только при наличии данных; элементы можно открыть в полном размере.', audience: 'battlegrounds', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'battlegrounds-library', version: 1, paths: ['/library', '/library/:section', '/library/archive/:section'], title: 'Как пользоваться библиотекой Полей сражений',
    steps: [
      { id: 'directory', target: 'bg-library-directory', title: 'Раздел библиотеки', description: 'Переключайтесь между существами, заклинаниями и архивом, чтобы работать только с нужным пулом данных.', audience: 'battlegrounds' },
      { id: 'search', target: 'bg-library-search', title: 'Поиск', description: 'Поиск учитывает названия и текст карт и работает одновременно с остальными выбранными фильтрами.', audience: 'battlegrounds' },
      { id: 'filters', target: 'bg-library-filters', title: 'Фильтры библиотеки', description: 'Отберите карты по тиру таверны, типу существа, режиму, механике и другим доступным признакам.', audience: 'battlegrounds' },
      { id: 'results', target: 'bg-library-results', title: 'Результаты', description: 'Счётчик показывает фактическое число найденных карт; каждая карточка открывает подробное досье.', audience: 'battlegrounds', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'battlegrounds-library-detail', version: 1, paths: ['/library/:kind/:slug', '/library/archive/:kind/:slug'], title: 'Как читать досье карты Полей сражений',
    steps: [
      { id: 'dossier', target: 'bg-library-detail-dossier', title: 'Карточка и свойства', description: 'Здесь собраны изображение, официальный текст, тип, уровень таверны и остальные базовые свойства объекта.', audience: 'battlegrounds' },
      { id: 'statistics', target: 'bg-library-detail-statistics', title: 'Статистика использования', description: 'Для актуальных существ и заклинаний блок показывает доступные игровые показатели и размер выборки.', audience: 'battlegrounds' },
      { id: 'rounds', target: 'bg-library-detail-rounds', title: 'Динамика по ходам', description: 'Срез по ходам помогает понять, когда объект обычно появляется и на каких этапах приносит лучший результат.', audience: 'battlegrounds', preferredPlacement: 'top' },
      { id: 'strategies', target: 'bg-library-detail-strategies', title: 'Связанные стратегии', description: 'Подборки показывают, в каких игровых планах карта используется и с какими элементами сочетается.', audience: 'battlegrounds', preferredPlacement: 'top' },
      { id: 'similar', target: 'bg-library-detail-similar', title: 'Похожие карты', description: 'Похожие объекты помогают быстро сравнить альтернативы и продолжить изучение библиотеки без нового поиска.', audience: 'battlegrounds', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'battlegrounds-strategy-builder', version: 1, paths: ['/battlegrounds/strategies'], title: 'Как собрать стратегию Полей сражений',
    steps: [
      { id: 'presets', target: 'bg-strategy-builder-presets', title: 'Готовые мета-сборки', description: 'Выберите сборку HSReplay или Firestone, изучите её состав и при желании перенесите карты на полотно. Обучение само ничего не добавляет.', audience: 'battlegrounds' },
      { id: 'search', target: 'bg-strategy-builder-search', title: 'Поиск по библиотеке', description: 'Ищите героев, существ, заклинания и аксессуары по русскому или английскому названию и игровым признакам.', audience: 'battlegrounds' },
      { id: 'filters', target: 'bg-strategy-builder-filters', title: 'Источник и фильтры', description: 'Сначала ограничьте источник карт, затем при необходимости уточните тип существа, уровень таверны или размер аксессуара в соседних секциях.', audience: 'battlegrounds' },
      { id: 'library', target: 'bg-strategy-builder-library', title: 'Библиотека карт', description: 'Счётчик показывает найденные карты, а ползунок меняет плотность библиотеки. На компьютере карту можно перетащить на полотно или добавить нажатием.', mobileDescription: 'Счётчик показывает найденные карты, а ползунок меняет плотность библиотеки. На телефоне нажмите карту, чтобы добавить её на полотно.', audience: 'battlegrounds' },
      { id: 'canvas', target: 'bg-strategy-builder-canvas', title: 'Полотно стратегии', description: 'Счётчик помогает контролировать состав, а на расположенном ниже полотне можно свободно размещать и переставлять выбранные карты.', mobileDescription: 'Счётчик помогает контролировать состав. Добавленные карты появляются на полотне ниже; их можно перемещать касанием и перетаскиванием.', audience: 'battlegrounds', preferredPlacement: 'top' },
      { id: 'tools', target: 'bg-strategy-builder-tools', title: 'Настройки и экспорт', description: 'Очистите полотно, выберите фон и сетку либо сохраните готовую схему в PNG или WebP. Во время обучения эти кнопки заблокированы.', audience: 'battlegrounds', preferredPlacement: 'top' },
      { id: 'annotations', target: 'bg-strategy-builder-annotations', title: 'Аннотации', description: 'Панель аннотаций добавляет на полотно стрелки, связи, подписи и другие пояснения. Обучение не изменяет вашу схему.', audience: 'battlegrounds', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'battlegrounds-tier-builder', version: 2, paths: ['/battlegrounds/tier-builder'], title: 'Как собрать свой тир-лист',
    steps: [
      { id: 'search', target: 'bg-tier-builder-search', title: 'Поиск карт', description: 'Введите русское или английское название, тип существа либо игровую механику, чтобы сократить исходный пул.', audience: 'battlegrounds' },
      { id: 'source', target: 'bg-tier-builder-source', title: 'Источник объектов', description: 'Оставьте только нужные категории: героев, существ, заклинания или аксессуары Полей сражений.', audience: 'battlegrounds' },
      { id: 'filters', target: 'bg-tier-builder-filters', title: 'Точные фильтры', description: 'Тип существа, уровень таверны и размер аксессуара работают вместе с поиском. На телефоне этот блок свёрнут — откройте его, когда нужно сузить пул.', audience: 'battlegrounds' },
      { id: 'reset', target: 'bg-tier-builder-reset', title: 'Быстрый сброс', description: '«Сбросить» возвращает фильтры к исходным, а «Все в пул» снимает карты со всех тиров. Обучение не нажимает эти кнопки.', audience: 'battlegrounds' },
      { id: 'library', target: 'bg-tier-builder-library', title: 'Пул карт', description: 'Счётчик показывает, сколько карт осталось в пуле по текущим фильтрам. Сам пул — нижний ряд тир-листа: перетащите карту мышью в нужный тир или выберите её и перенесите клавишами (пробел и стрелки).', mobileDescription: 'Счётчик показывает, сколько карт осталось в пуле по текущим фильтрам. Сам пул — нижний ряд тир-листа: зажмите карту и перетащите её в нужный тир.', audience: 'battlegrounds' },
      { id: 'board', target: 'bg-tier-builder-board', title: 'Ваш тир-лист', description: 'Ряды S–D и счётчик распределённых карт. Порядок внутри ряда тоже меняется перетаскиванием; «Копировать текстом» и «Скачать JSON» сохраняют список без картинок.', audience: 'battlegrounds', preferredPlacement: 'top' },
      { id: 'export', target: 'bg-tier-builder-export', title: 'Оформление и экспорт', description: 'Выберите фон и сохраните весь готовый тир-лист в PNG или WebP. Во время обучения экспорт не запускается.', audience: 'battlegrounds', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'battlegrounds-tier-list', version: 1, paths: ['/battlegrounds/tier-list'], title: 'Как читать тир-лист Полей сражений',
    steps: [
      { id: 'list', target: 'bg-tier-list-switcher', title: 'Выберите тип тир-листа', description: 'Переключайтесь между существами, стратегиями, заклинаниями и аксессуарами — у каждого списка свои данные и фильтры.', audience: 'battlegrounds' },
      { id: 'filters', target: 'bg-tier-list-filters', title: 'Настройка выборки', description: 'Фильтры помогают сравнивать элементы одного тира, типа или другой общей игровой категории.', audience: 'battlegrounds' },
      { id: 'tiers', target: 'bg-tier-list-results', title: 'Распределение по тирам', description: 'Чем выше группа, тем полезнее элемент в актуальной мете. Внутри группы можно сравнивать соседние позиции.', audience: 'battlegrounds', preferredPlacement: 'top' },
      { id: 'strategy', target: 'bg-tier-list-strategy', title: 'Стратегии и источники', description: 'Откройте стратегии, чтобы сравнить готовые игровые планы. Внутри раздела можно переключать данные Firestone и HSReplay.', audience: 'battlegrounds', preferredPlacement: 'top' },
    ],
  },
];
