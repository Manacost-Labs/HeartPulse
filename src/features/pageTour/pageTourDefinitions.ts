import type { PageTourLike, TourPlacement } from './pageTourModel';

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
      { id: 'summary', target: 'profile-summary', title: 'Ваш профиль', description: 'Здесь собраны имя, основной контакт, ID профиля, роль и текущий статус доступа. ID пригодится при обращении в поддержку.', preferredPlacement: 'bottom' },
      { id: 'contacts', target: 'profile-contacts', title: 'Контакты и уведомления', description: 'Укажите удобные способы связи для конкурсов, призов и важных уведомлений. Эти поля не подтверждают Telegram-подписку.', preferredPlacement: 'bottom' },
      { id: 'access', target: 'profile-access-status', title: 'Доступ к разделам', description: 'Проверьте, какие закрытые разделы открыты и когда обновлялась подписка. Кнопка обновления повторно проверяет источники доступа.', audience: 'authenticated', preferredPlacement: 'bottom' },
      { id: 'telegram', target: 'profile-telegram-access', title: 'Проверка Telegram', description: 'Создайте ID-код и отправьте его боту. Обычное поле @username в контактах не подтверждает членство в VIP-канале.', audience: 'non-admin', preferredPlacement: 'top' },
      { id: 'boosty', target: 'profile-boosty-access', title: 'Подтверждение Boosty', description: 'Введите именно почту из Boosty-профиля. После шестизначного кода сайт обновит доступ к разделам вашего уровня.', audience: 'non-admin', preferredPlacement: 'top' },
      { id: 'contests', target: 'profile-contests', title: 'Ваши конкурсы', description: 'Здесь появляются отправленные заявки, их статус, призы и отметка победителя. Счётчик показывает количество участий и побед.', preferredPlacement: 'top' },
      { id: 'actions', target: 'profile-account-actions', title: 'Быстрые действия', description: 'Здесь находятся доступные вашей роли переходы и безопасный выход из текущей сессии.', audience: 'admin', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'standard-matchups', version: 4, paths: ['/standard/matchups'], title: 'Как читать матчапы',
    steps: [
      { id: 'rank', target: 'matchups-rank', title: 'Выберите формат', description: 'Переключайтесь между Стандартом и Вольным режимом. Обе матрицы собраны для ранга Легенда.', audience: 'standard' },
      { id: 'picker', target: 'matchups-picker', title: 'Найдите свою колоду', description: 'Выберите здесь архетип, которым играете. Быстрый обзор ниже покажет его результаты против остальных колод меты.', audience: 'standard', preferredPlacement: 'bottom' },
      { id: 'matrix', target: 'matchups-matrix', title: 'Интерактивная матрица', description: 'Откройте полную матрицу: строка — ваша колода, столбец — соперник. Нажмите на любую цветную ячейку, чтобы увидеть подробности матчапа. Названия соперников повторены в нижней строке, а листать таблицу помогает верхняя полоса.', mobileDescription: 'Откройте полную матрицу и нажмите на цветную ячейку — появится карточка матчапа. Нижняя строка повторяет названия соперников, а верхняя полоса помогает листать таблицу.', audience: 'standard', preferredPlacement: 'top' },
      { id: 'summary', target: 'matchups-summary', title: 'Сильные и слабые соперники', description: 'В итоговой сводке ниже автоматически выделены лучшие и худшие встречи, чтобы быстрее выбрать колоду или подготовить план игры.', audience: 'standard', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'standard-meta', version: 3, paths: ['/standard/meta'], title: 'Как пользоваться разделом «Мета»',
    steps: [
      { id: 'controls', target: 'meta-controls', title: 'Диапазон рейтинга', description: 'Выберите нужный ранг — все показатели, график и список архетипов обновятся под этот срез. Формат меняется соседним переключателем.', audience: 'standard', preferredPlacement: 'bottom' },
      { id: 'search', target: 'meta-search', title: 'Поиск архетипа', description: 'Начните вводить название класса или колоды, чтобы быстро оставить в результатах только нужные архетипы.', audience: 'standard' },
      { id: 'chart', target: 'meta-chart', title: 'Карта меты', description: 'Карта по умолчанию свернута. Нажмите «Показать»: чем правее точка, тем выше винрейт; чем выше — тем популярнее архетип.', audience: 'standard', preferredPlacement: 'bottom' },
      { id: 'view', target: 'meta-view-switcher', title: 'Галерея или таблица', description: 'Галерея удобна для быстрого обзора, а таблица — для точного сравнения винрейта, популярности и скорости набора рейтинга.', audience: 'standard' },
      { id: 'results', target: 'meta-results', title: 'Актуальные архетипы', description: 'Счётчик показывает объём текущей выдачи. Результаты ниже содержат размер выборки, популярность и винрейт каждого архетипа.', audience: 'standard', preferredPlacement: 'top' },
      { id: 'deck', target: 'meta-deck-action', title: 'Рекомендуемая сборка', description: 'Откройте актуальный состав архетипа, изучите карты и скопируйте код, чтобы сразу импортировать колоду в Hearthstone.', audience: 'standard', preferredPlacement: 'left' },
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
    id: 'constructed-archetype-detail', version: 1, paths: ['/standard/archetypes/:format/:slug', '/standard/meta/:format/:slug'], title: 'Как читать страницу архетипа',
    steps: [
      { id: 'summary', target: 'archetype-summary', title: 'Сводка архетипа', description: 'В верхнем досье собраны винрейт, популярность, размер выборки, темп матчей и количество найденных сборок.', audience: 'standard', preferredPlacement: 'bottom' },
      { id: 'main-build', target: 'archetype-main-build', title: 'Главная сборка', description: 'Первая сборка выбрана по самой большой подтверждённой выборке. Откройте карты или скопируйте код для импорта в Hearthstone.', audience: 'standard' },
      { id: 'analysis', target: 'archetype-analysis', title: 'Матчапы и муллиган', description: 'Сравните результат против классов, затем изучите влияние стартовой руки, добора и оставления каждой карты.', audience: 'standard', preferredPlacement: 'top' },
      { id: 'history', target: 'archetype-history', title: 'История меты', description: 'Графики накапливают срезы каждые 12 часов и показывают, как меняются винрейт, популярность и объём игр.', audience: 'standard', preferredPlacement: 'top' },
      { id: 'builds', target: 'archetype-other-builds', title: 'Другие сборки', description: 'Сравните альтернативные варианты по винрейту и размеру выборки, раскройте состав и скопируйте подходящий код.', audience: 'standard', preferredPlacement: 'top' },
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
    id: 'standard-vicious-gold', version: 2, paths: ['/standard/vicious-gold'], title: 'Как читать Vicious Syndicate Gold',
    steps: [
      { id: 'classes', target: 'vicious-classes', title: 'Распределение классов', description: 'Диаграмма показывает, какую долю текущей меты занимает каждый класс в доступной выборке Vicious Syndicate.', audience: 'standard' },
      { id: 'decks', target: 'vicious-decks', title: 'Распределение колод', description: 'Здесь оставлены архетипы заметной популярности. Фильтр класса помогает быстро найти нужную колоду и её долю.', audience: 'standard' },
      { id: 'build', target: 'vicious-build-action', title: 'Состав и код колоды', description: 'Статистика появляется первой, а сборки догружаются отдельно. После загрузки откройте состав или скопируйте код колоды.', audience: 'standard', preferredPlacement: 'left' },
      { id: 'power-filters', target: 'vicious-power-filters', title: 'Рейтинг и класс Power Tier', description: 'Сначала выберите диапазон рейтинга и класс. Тир-лист пересчитается только для этого среза данных.', audience: 'standard' },
      { id: 'power', target: 'vicious-power', title: 'Power Tier List', description: 'Под этим заголовком колоды распределены по силе с учётом фактических результатов. Позиция внутри тира помогает сравнить близкие архетипы.', audience: 'standard', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'standard-cards', version: 1, paths: ['/standard/cards', '/standard/cards/:format'], title: 'Как пользоваться библиотекой карт',
    steps: [
      { id: 'format', target: 'cards-format', title: 'Стандарт или Вольный', description: 'Переключайте формат, чтобы видеть только карты, разрешённые в Стандарте, либо полную библиотеку Вольного режима.' },
      { id: 'search', target: 'cards-search', title: 'Поиск по названию', description: 'Введите русское или оригинальное название карты. Результаты обновятся вместе с выбранными фильтрами.' },
      { id: 'sort', target: 'cards-sort', title: 'Сортировка карт', description: 'Без подписки доступны игровые признаки и новые дополнения; статистические сортировки открываются с тарифом «Алмаз».' },
      { id: 'filters', target: 'cards-filters', title: 'Точные фильтры', description: 'Отберите карты по классу, дополнению, мане, атаке, здоровью, механике, типу и редкости.', mobileDescription: 'Нажмите «Дополнительные фильтры», чтобы открыть класс, дополнение, ману, механики и другие параметры. Тур не меняет их сам.' },
      { id: 'view', target: 'cards-view-switcher', title: 'Галерея или таблица', description: 'Галерея показывает полноценные карты, а таблица упрощает сравнение характеристик и статистики.' },
      { id: 'statistics', target: 'cards-statistics', title: 'Статистика Легенды', description: 'Показатели «В % колод», победы колод и размер выборки рассчитаны для Легенды; закрытые значения отмечены замком.', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'standard-card-detail', version: 1, paths: ['/standard/cards/:format/:cardId'], title: 'Что есть на странице карты',
    steps: [
      { id: 'art', target: 'card-art', title: 'Версии изображения', description: 'Эти кнопки переключают обычную, золотую, сигнатурную или алмазную версию. Нажмите большую карту выше, чтобы открыть её полностью.' },
      { id: 'identity', target: 'card-identity', title: 'Основная информация', description: 'Под названием собраны стоимость, класс, тип, редкость, дополнение, характеристики и официальное описание карты.' },
      { id: 'statistics', target: 'card-statistics', title: 'Статистика карты', description: 'В этом блоке сравнивайте присутствие в колодах, винрейт и размер выборки. Данные доступны с тарифом «Алмаз».' },
      { id: 'patches', target: 'card-patches', title: 'История изменений', description: 'Патчи расположены от новых к старым; для доступных записей можно открыть русскую публикацию на HS-Manacost.' },
      { id: 'pools', target: 'card-pools', title: 'Пулы генерации', description: 'Если карта создаёт другие карты, здесь показан её реальный пул. Кнопка «Показать все» раскрывает оставшиеся варианты.' },
      { id: 'decks', target: 'card-decks', title: 'Колоды с этой картой', description: 'Откройте изображение DeckView, изучите состав и скопируйте код подходящей колоды для импорта в игру.', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'arena-classes', version: 1, paths: ['/classes'], title: 'Как читать рейтинг классов Арены',
    steps: [
      { id: 'source', target: 'arena-classes-source', title: 'Свежесть статистики', description: 'Дата обновления показывает, насколько свежий текущий срез HSReplay по классам Арены.', audience: 'arena' },
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
      { id: 'source', target: 'bg-heroes-source', title: 'Источник и свежесть данных', description: 'Под заголовком указан текущий источник среза HSReplay. Используйте его вместе с показателями, чтобы понимать контекст рейтинга.', audience: 'battlegrounds' },
      { id: 'results', target: 'bg-heroes-results', title: 'Карточки героев', description: 'Карточка показывает силу героя и статистику; откройте её для подробного распределения мест и связанных данных.', audience: 'battlegrounds', preferredPlacement: 'top' },
    ],
  },
  {
    id: 'battlegrounds-hero-detail', version: 1, paths: ['/heroes/:dbfId'], title: 'Как читать досье героя',
    steps: [
      { id: 'summary', target: 'bg-hero-detail-summary', title: 'Главное о герое', description: 'В верхнем блоке собраны имя, тир, среднее место, частота выбора и дата актуальности статистики.', audience: 'battlegrounds' },
      { id: 'media', target: 'bg-hero-detail-media', title: 'Сила героя и компаньон', description: 'Изучите актуальную силу героя, её официальный текст и компаньона, если он доступен в текущем пуле.', audience: 'battlegrounds' },
      { id: 'placement', target: 'bg-hero-detail-placement', title: 'Распределение мест', description: 'График показывает, как часто герой заканчивает лобби на каждом месте, а не только его средний результат.', audience: 'battlegrounds' },
      { id: 'compositions', target: 'bg-hero-detail-compositions', title: 'Лучшие составы', description: 'Сравнивайте популярные финальные композиции и их показатели, чтобы понять сильные направления развития героя.', audience: 'battlegrounds', preferredPlacement: 'top' },
      { id: 'tables', target: 'bg-hero-detail-tables', title: 'Подробные срезы', description: 'Таблицы помогают сопоставить результат по рейтингу, выбору способности и другим доступным условиям выборки.', audience: 'battlegrounds', preferredPlacement: 'top' },
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
    id: 'battlegrounds-tier-builder', version: 1, paths: ['/battlegrounds/tier-builder'], title: 'Как собрать свой тир-лист',
    steps: [
      { id: 'search', target: 'bg-tier-builder-search', title: 'Поиск карт', description: 'Введите русское или английское название, тип существа либо игровую механику, чтобы сократить исходный пул.', audience: 'battlegrounds' },
      { id: 'source', target: 'bg-tier-builder-source', title: 'Источник объектов', description: 'Оставьте только нужные категории: героев, существ, заклинания или аксессуары Полей сражений.', audience: 'battlegrounds' },
      { id: 'filters', target: 'bg-tier-builder-filters', title: 'Точные фильтры', description: 'Фильтр типа существа работает вместе с поиском; ниже можно дополнительно выбрать уровень таверны или размер аксессуара.', audience: 'battlegrounds' },
      { id: 'reset', target: 'bg-tier-builder-reset', title: 'Быстрый сброс', description: '«Сбросить» возвращает исходное распределение, а «Все в пул» снимает карты со всех тиров. Обучение не нажимает эти кнопки.', audience: 'battlegrounds' },
      { id: 'library', target: 'bg-tier-builder-library', title: 'Пул карт', description: 'Счётчик показывает состав пула, а ползунок регулирует число карточек в ряду. Перетащите карту в нужный тир или добавьте её кнопкой.', mobileDescription: 'Счётчик показывает состав пула, а ползунок регулирует число карточек в ряду. Нажмите «+» на карте, чтобы отправить её в S-тир.', audience: 'battlegrounds' },
      { id: 'board', target: 'bg-tier-builder-board', title: 'Ваш тир-лист', description: 'Справа находится рабочая область с группами S–E и счётчиком распределённых карт; позиции внутри каждой группы тоже можно менять.', audience: 'battlegrounds', preferredPlacement: 'top' },
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
