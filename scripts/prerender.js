import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

const SITE_URL = 'https://arena.hs-manacost.ru';

const PAGES = {
  '/': {
    title: 'HS-Arena — Тир-лист и Винрейты для Арены Hearthstone',
    description: 'Актуальная статистика Арены Hearthstone: тир-лист карт по классам, винрейты, легендарные группы. Данные обновляются автоматически 4 раза в сутки.',
    h1: 'HS-Arena — Статистика Арены Hearthstone',
    canonical: '/',
    ogType: 'website',
    structuredData: [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        "url": SITE_URL,
        "name": "Manacost Arena",
        "description": "Актуальная статистика режима Арена в Hearthstone",
        "inLanguage": "ru",
        "publisher": {
          "@type": "Organization",
          "name": "Manacost",
          "url": "https://t.me/manacost_ru",
          "logo": { "@type": "ImageObject", "url": `${SITE_URL}/assets/arena_icon.webp` }
        }
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#app`,
        "name": "Manacost Arena",
        "url": SITE_URL,
        "description": "Актуальная статистика режима Арена в Hearthstone: тир-лист карт по классам, винрейты, легендарные группы.",
        "applicationCategory": "GameApplication",
        "operatingSystem": "Web",
        "inLanguage": "ru",
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "RUB" },
        "featureList": [
          "Тир-лист карт Арены Hearthstone по всем классам",
          "Винрейты классов с актуального патча",
          "Группы легендарных карт для первого выбора",
          "Автоматическое обновление данных 4 раза в сутки"
        ]
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
        ]
      },
      {
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Какой класс лучший на Арене Hearthstone?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Актуальные винрейты всех классов обновляются автоматически на странице «Классы». Данные берутся с миллионов реальных Арена-партий."
            }
          },
          {
            "@type": "Question",
            "name": "Как пользоваться тир-листом карт для Арены?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Выберите класс в шапке тир-листа, затем используйте поиск и фильтр по редкости. Карты ранжированы от S (авто-пик) до F (не брать никогда)."
            }
          },
          {
            "@type": "Question",
            "name": "Как выбрать легендарку на Арене Hearthstone?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "На вкладке «Легендарки» показаны все возможные группы первого выбора с процентом побед. Выбирайте группу с наибольшим винрейтом для вашего класса."
            }
          },
          {
            "@type": "Question",
            "name": "Как часто обновляются данные Арены?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Данные обновляются автоматически 4 раза в сутки: в 00:15, 06:15, 12:15 и 18:15 UTC."
            }
          }
        ]
      }
    ],
    noscript: `
      <h1>HS-Arena — Статистика Арены Hearthstone</h1>
      <p>Актуальная статистика режима Арена в Hearthstone: тир-лист карт, винрейты классов, легендарные группы.</p>
      <ul>
        <li><a href="/classes">Винрейты классов</a> — рейтинг классов на Арене</li>
        <li><a href="/tierlist">Тир-лист карт</a> — оценки карт от S до F по классам</li>
        <li><a href="/legendaries">Легендарные группы</a> — лучшие легендарки для первого выбора</li>
        <li><a href="/articles">Статьи и гайды</a> — разборы и советы по Арене</li>
        <li><a href="/guides-archive">Архив гайдов</a> — старые материалы Koloda Hearthstone в удобном формате</li>
        <li><a href="/contests">Конкурсы</a> — розыгрыши для подписчиков Манакоста</li>
      </ul>`
  },
  '/classes': {
    title: 'Винрейт классов — Арена Hearthstone | HS-Arena',
    description: 'Актуальные винрейты всех 11 классов в режиме Арена Hearthstone. Рейтинг на основе миллионов партий с HSReplay и Firestone, обновляется автоматически 4 раза в сутки.',
    h1: 'Винрейт классов на Арене Hearthstone',
    canonical: '/classes',
    ogType: 'website',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Классы", "item": `${SITE_URL}/classes` }
        ]
      },
      {
        "@type": "Dataset",
        "@id": `${SITE_URL}/classes#dataset`,
        "name": "Винрейт классов Арены Hearthstone",
        "description": "Актуальные винрейты 11 классов в режиме Арена Hearthstone на основе данных HSReplay и Firestone.",
        "url": `${SITE_URL}/classes`,
        "creator": { "@type": "Organization", "name": "Manacost" },
        "temporalCoverage": "P7D",
        "about": {
          "@type": "VideoGame",
          "name": "Hearthstone",
          "gameMode": "Arena"
        }
      }
    ],
    noscript: `
      <h1>Винрейт классов на Арене Hearthstone</h1>
      <p>Актуальные винрейты всех 11 классов в режиме Арена. Данные с HSReplay и Firestone обновляются автоматически 4 раза в сутки.</p>
      <p>Классы: Рыцарь смерти, Паладин, Шаман, Охотник, Маг, Разбойник, Чернокнижник, Друид, Воин, Жрец, Охотник на демонов.</p>
      <p><a href="/">На главную</a> | <a href="/tierlist">Тир-лист карт</a> | <a href="/legendaries">Легендарки</a></p>`
  },
  '/tierlist': {
    title: 'Тир-лист карт — Арена Hearthstone | HS-Arena',
    description: 'Полный тир-лист карт для каждого класса в режиме Арена Hearthstone. Лучшие карты текущего патча с оценками от S (авто-пик) до F. Данные с HearthArena и HSReplay.',
    canonical: '/tierlist',
    ogType: 'website',
    h1: 'Тир-лист карт Арены Hearthstone',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Тир-лист", "item": `${SITE_URL}/tierlist` }
        ]
      },
      {
        "@type": "ItemList",
        "@id": `${SITE_URL}/tierlist#tierlist`,
        "name": "Тир-лист карт Арены Hearthstone",
        "description": "Оценки карт для режима Арена Hearthstone по всем классам от S до F.",
        "numberOfItems": 500,
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Тир S — Отлично (авто-пик)", "url": `${SITE_URL}/tierlist` },
          { "@type": "ListItem", "position": 2, "name": "Тир A — Хорошо", "url": `${SITE_URL}/tierlist` },
          { "@type": "ListItem", "position": 3, "name": "Тир B — Выше среднего", "url": `${SITE_URL}/tierlist` },
          { "@type": "ListItem", "position": 4, "name": "Тир C — Средне", "url": `${SITE_URL}/tierlist` },
          { "@type": "ListItem", "position": 5, "name": "Тир D — Ниже среднего", "url": `${SITE_URL}/tierlist` },
          { "@type": "ListItem", "position": 6, "name": "Тир E — Плохо", "url": `${SITE_URL}/tierlist` },
          { "@type": "ListItem", "position": 7, "name": "Тир F — Ужасно", "url": `${SITE_URL}/tierlist` }
        ]
      },
      {
        "@type": "Dataset",
        "@id": `${SITE_URL}/tierlist#dataset`,
        "name": "Тир-лист карт Арены Hearthstone",
        "description": "Полный тир-лист карт для каждого класса в режиме Арена Hearthstone с оценками от S до F.",
        "url": `${SITE_URL}/tierlist`,
        "creator": { "@type": "Organization", "name": "Manacost" },
        "about": {
          "@type": "VideoGame",
          "name": "Hearthstone",
          "gameMode": "Arena"
        }
      }
    ],
    noscript: `
      <h1>Тир-лист карт Арены Hearthstone</h1>
      <p>Полный тир-лист карт для каждого класса в режиме Арена Hearthstone. Лучшие карты текущего патча с оценками от S (авто-пик) до F.</p>
      <p>Классы: Рыцарь смерти, Охотник на демонов, Друид, Охотник, Маг, Паладин, Жрец, Разбойник, Шаман, Чернокнижник, Воин, Нейтральные.</p>
      <p>Тиры: S — Отлично, A — Хорошо, B — Выше среднего, C — Средне, D — Ниже среднего, E — Плохо, F — Ужасно.</p>
      <p>Данные обновляются автоматически с HearthArena и HSReplay.</p>
      <p><a href="/">На главную</a> | <a href="/classes">Винрейты классов</a> | <a href="/legendaries">Легендарки</a></p>`
  },
  '/legendaries': {
    title: 'Легендарки на Арене Hearthstone — Лучшие группы | HS-Arena',
    description: 'Какую легендарную карту выбрать на Арене? Все группы первого выбора с процентом побед для каждого класса. Обновляется автоматически с Manacost.',
    canonical: '/legendaries',
    ogType: 'website',
    h1: 'Легендарные карты на Арене Hearthstone',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Легендарки", "item": `${SITE_URL}/legendaries` }
        ]
      },
      {
        "@type": "ItemList",
        "@id": `${SITE_URL}/legendaries#legendaries`,
        "name": "Легендарные группы для Арены Hearthstone",
        "description": "Наборы карт для выбора первой легендарки на Арене Hearthstone с винрейтом каждой группы.",
        "numberOfItems": 30,
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Группы легендарных карт — Рыцарь смерти", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 2, "name": "Группы легендарных карт — Паладин", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 3, "name": "Группы легендарных карт — Шаман", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 4, "name": "Группы легендарных карт — Охотник", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 5, "name": "Группы легендарных карт — Маг", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 6, "name": "Группы легендарных карт — Разбойник", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 7, "name": "Группы легендарных карт — Чернокнижник", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 8, "name": "Группы легендарных карт — Друид", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 9, "name": "Группы легендарных карт — Воин", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 10, "name": "Группы легендарных карт — Жрец", "url": `${SITE_URL}/legendaries` },
          { "@type": "ListItem", "position": 11, "name": "Группы легендарных карт — Охотник на демонов", "url": `${SITE_URL}/legendaries` }
        ]
      }
    ],
    noscript: `
      <h1>Легендарные карты на Арене Hearthstone</h1>
      <p>Все группы первого выбора легендарных карт на Арене с винрейтом. Выбирайте группу с наибольшим процентом побед для вашего класса.</p>
      <p>Данные обновляются автоматически с Manacost.ru.</p>
      <p><a href="/">На главную</a> | <a href="/tierlist">Тир-лист карт</a> | <a href="/classes">Винрейты классов</a></p>`
  },
  '/articles': {
    title: 'Статьи и гайды по Арене Hearthstone | HS-Arena',
    description: 'Гайды, разборы мета и советы по режиму Арена в Hearthstone от команды Manacost. Актуальные статьи для игроков всех уровней.',
    canonical: '/articles',
    ogType: 'website',
    h1: 'Статьи и гайды по Арене Hearthstone',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Статьи", "item": `${SITE_URL}/articles` }
        ]
      },
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/articles#collection`,
        "name": "Статьи и гайды по Арене Hearthstone",
        "description": "Гайды, разборы и советы по режиму Арена в Hearthstone от команды Manacost.",
        "url": `${SITE_URL}/articles`
      }
    ],
    noscript: `
      <h1>Статьи и гайды по Арене Hearthstone</h1>
      <p>Гайды, разборы мета и советы по режиму Арена от команды Manacost.</p>
      <p><a href="/">На главную</a> | <a href="/guides-archive">Архив гайдов</a> | <a href="/contests">Конкурсы</a> | <a href="/tierlist">Тир-лист карт</a> | <a href="/classes">Винрейты классов</a></p>`
  },
  '/guides-archive': {
    title: 'Архив гайдов Hearthstone | Manacost Stats',
    description: 'Архив старых гайдов, мета-отчетов и материалов Koloda Hearthstone в удобном формате для чтения.',
    canonical: '/guides-archive',
    ogType: 'website',
    h1: 'Архив гайдов Hearthstone',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Архив гайдов", "item": `${SITE_URL}/guides-archive` }
        ]
      },
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/guides-archive#collection`,
        "name": "Архив гайдов Hearthstone",
        "description": "Старые гайды, мета-отчеты и материалы Koloda Hearthstone в новом удобном формате для чтения.",
        "url": `${SITE_URL}/guides-archive`
      }
    ],
    noscript: `
      <h1>Архив гайдов Hearthstone</h1>
      <p>Старые гайды, мета-отчеты и материалы Koloda Hearthstone доступны в новом интерфейсе Manacost Stats.</p>
      <p><a href="/">На главную</a> | <a href="/articles">Статьи</a> | <a href="/contests">Конкурсы</a> | <a href="/classes">Винрейты классов</a></p>`
  },
  '/contests': {
    title: 'Конкурсы Манакоста | Manacost Stats',
    description: 'Конкурсы для подписчиков Манакоста: участие, автоматическая проверка подписки и публикация ID победителей после завершения.',
    canonical: '/contests',
    ogType: 'website',
    h1: 'Конкурсы Манакоста',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Конкурсы", "item": `${SITE_URL}/contests` }
        ]
      },
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/contests#collection`,
        "name": "Конкурсы Манакоста",
        "description": "Розыгрыши для подписчиков Манакоста с автоматической проверкой доступа.",
        "url": `${SITE_URL}/contests`
      }
    ],
    noscript: `
      <h1>Конкурсы Манакоста</h1>
      <p>На этой странице проходят розыгрыши для подписчиков: пользователи отправляют заявку, система проверяет подписку, а после завершения публикуются ID победителей.</p>
      <p><a href="/">На главную</a> | <a href="/articles">Статьи</a> | <a href="/classes">Винрейты классов</a></p>`
  },
  '/battlegrounds/strategies': {
    title: 'Конструктор стратегий Полей Сражений | HS-Arena',
    description: 'Конструктор стратегий Hearthstone Battlegrounds: собирайте и визуализируйте планы развития для Полей Сражений.',
    canonical: '/battlegrounds/strategies',
    ogType: 'website',
    h1: 'Конструктор стратегий Полей Сражений',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Поля Сражений", "item": `${SITE_URL}/battlegrounds/strategies` },
          { "@type": "ListItem", "position": 3, "name": "Конструктор стратегий", "item": `${SITE_URL}/battlegrounds/strategies` }
        ]
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/battlegrounds/strategies#app`,
        "name": "Конструктор стратегий Полей Сражений",
        "url": `${SITE_URL}/battlegrounds/strategies`,
        "description": "Инструмент для сборки и визуализации стратегий Hearthstone Battlegrounds.",
        "applicationCategory": "GameApplication",
        "operatingSystem": "Web",
        "inLanguage": "ru",
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "RUB" }
      }
    ],
    noscript: `
      <h1>Конструктор стратегий Полей Сражений</h1>
      <p>Инструмент для сборки и визуализации стратегий Hearthstone Battlegrounds.</p>
      <p><a href="/">На главную</a> | <a href="/battlegrounds/tier-builder">Конструктор тир-листов</a></p>`
  },
  '/heroes': {
    title: 'Герои Полей Сражений Hearthstone | HS-Arena',
    description: 'Тир-лист героев Hearthstone Battlegrounds с отдельными страницами героев, силами героя, компаньонами и статистикой.',
    canonical: '/heroes',
    ogType: 'website',
    h1: 'Герои Полей Сражений',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Поля Сражений", "item": `${SITE_URL}/heroes` },
          { "@type": "ListItem", "position": 3, "name": "Герои", "item": `${SITE_URL}/heroes` }
        ]
      },
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/heroes#collection`,
        "name": "Герои Полей Сражений Hearthstone",
        "description": "Тир-лист героев Hearthstone Battlegrounds с отдельными страницами героев.",
        "url": `${SITE_URL}/heroes`,
        "inLanguage": "ru"
      }
    ],
    noscript: `
      <h1>Герои Полей Сражений</h1>
      <p>Тир-лист героев Hearthstone Battlegrounds с отдельными страницами героев, силами героя, компаньонами и статистикой.</p>
      <p><a href="/">На главную</a> | <a href="/battlegrounds/strategies">Конструктор стратегий</a> | <a href="/battlegrounds/tier-builder">Конструктор тир-листов</a></p>`
  },
  '/library': {
    title: 'Библиотека Полей Сражений Hearthstone | HS-Arena',
    description: 'Библиотека существ и заклинаний Hearthstone Battlegrounds: актуальный пул, архив, фильтры, статистика и отдельные страницы карт.',
    canonical: '/library',
    ogType: 'website',
    h1: 'Библиотека Полей Сражений',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Поля Сражений", "item": `${SITE_URL}/library` },
          { "@type": "ListItem", "position": 3, "name": "Библиотека", "item": `${SITE_URL}/library` }
        ]
      },
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/library#collection`,
        "name": "Библиотека Полей Сражений Hearthstone",
        "description": "Актуальные и архивные карты Hearthstone Battlegrounds с фильтрами и детальными страницами.",
        "url": `${SITE_URL}/library`,
        "inLanguage": "ru"
      }
    ],
    noscript: `
      <h1>Библиотека Полей Сражений</h1>
      <p>Актуальный пул и архив существ и заклинаний Hearthstone Battlegrounds.</p>
      <p><a href="/library/minions">Существа</a> | <a href="/library/spells">Заклинания</a> | <a href="/library/archive">Архив</a></p>`
  },
  '/library/minions': {
    title: 'Существа Полей Сражений Hearthstone | HS-Arena',
    description: 'Актуальные существа Hearthstone Battlegrounds: фильтры по таверне, типу существ, механикам, статистика и отдельные страницы карт.',
    canonical: '/library/minions',
    ogType: 'website',
    h1: 'Существа Полей Сражений',
    structuredData: [
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/library/minions#collection`,
        "name": "Существа Полей Сражений Hearthstone",
        "description": "Актуальные существа Hearthstone Battlegrounds с фильтрами и статистикой.",
        "url": `${SITE_URL}/library/minions`,
        "inLanguage": "ru"
      }
    ],
    noscript: `
      <h1>Существа Полей Сражений</h1>
      <p>Актуальные существа Hearthstone Battlegrounds с фильтрами по таверне, типу и механикам.</p>
      <p><a href="/library">Библиотека</a> | <a href="/library/spells">Заклинания</a> | <a href="/battlegrounds/tier-list">Тир-лист</a></p>`
  },
  '/library/spells': {
    title: 'Заклинания Полей Сражений Hearthstone | HS-Arena',
    description: 'Актуальные заклинания Hearthstone Battlegrounds: фильтры, изображения карт, статистика и отдельные страницы.',
    canonical: '/library/spells',
    ogType: 'website',
    h1: 'Заклинания Полей Сражений',
    structuredData: [
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/library/spells#collection`,
        "name": "Заклинания Полей Сражений Hearthstone",
        "description": "Актуальные заклинания Hearthstone Battlegrounds с фильтрами и статистикой.",
        "url": `${SITE_URL}/library/spells`,
        "inLanguage": "ru"
      }
    ],
    noscript: `
      <h1>Заклинания Полей Сражений</h1>
      <p>Актуальные заклинания Hearthstone Battlegrounds с изображениями, фильтрами и статистикой.</p>
      <p><a href="/library">Библиотека</a> | <a href="/library/minions">Существа</a> | <a href="/battlegrounds/tier-list">Тир-лист</a></p>`
  },
  '/library/archive': {
    title: 'Архив карт Полей Сражений Hearthstone | HS-Arena',
    description: 'Архивные существа и заклинания Hearthstone Battlegrounds с отдельными страницами карт.',
    canonical: '/library/archive',
    ogType: 'website',
    h1: 'Архив карт Полей Сражений',
    structuredData: [
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/library/archive#collection`,
        "name": "Архив карт Полей Сражений Hearthstone",
        "description": "Архивные карты Hearthstone Battlegrounds.",
        "url": `${SITE_URL}/library/archive`,
        "inLanguage": "ru"
      }
    ],
    noscript: `
      <h1>Архив карт Полей Сражений</h1>
      <p>Архивные существа и заклинания Hearthstone Battlegrounds.</p>
      <p><a href="/library">Актуальная библиотека</a> | <a href="/library/archive/minions">Архив существ</a> | <a href="/library/archive/spells">Архив заклинаний</a></p>`
  },
  '/library/archive/minions': {
    title: 'Архив существ Полей Сражений Hearthstone | HS-Arena',
    description: 'Архив существ Hearthstone Battlegrounds: старые существа вне активного пула с карточками и поиском.',
    canonical: '/library/archive/minions',
    ogType: 'website',
    h1: 'Архив существ Полей Сражений',
    structuredData: [
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/library/archive/minions#collection`,
        "name": "Архив существ Полей Сражений Hearthstone",
        "description": "Существа Hearthstone Battlegrounds вне активного пула.",
        "url": `${SITE_URL}/library/archive/minions`,
        "inLanguage": "ru"
      }
    ],
    noscript: `
      <h1>Архив существ Полей Сражений</h1>
      <p>Существа Hearthstone Battlegrounds, которые сейчас не находятся в активном пуле.</p>
      <p><a href="/library/minions">Актуальные существа</a> | <a href="/library/archive/spells">Архив заклинаний</a></p>`
  },
  '/library/archive/spells': {
    title: 'Архив заклинаний Полей Сражений Hearthstone | HS-Arena',
    description: 'Архив заклинаний Hearthstone Battlegrounds: старые заклинания таверны вне активного пула.',
    canonical: '/library/archive/spells',
    ogType: 'website',
    h1: 'Архив заклинаний Полей Сражений',
    structuredData: [
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/library/archive/spells#collection`,
        "name": "Архив заклинаний Полей Сражений Hearthstone",
        "description": "Заклинания Hearthstone Battlegrounds вне активного пула.",
        "url": `${SITE_URL}/library/archive/spells`,
        "inLanguage": "ru"
      }
    ],
    noscript: `
      <h1>Архив заклинаний Полей Сражений</h1>
      <p>Заклинания Hearthstone Battlegrounds, которые сейчас не находятся в активном пуле.</p>
      <p><a href="/library/spells">Актуальные заклинания</a> | <a href="/library/archive/minions">Архив существ</a></p>`
  },
  '/battlegrounds/tier-list': {
    title: 'Тир-лист Полей Сражений Hearthstone | HS-Arena',
    description: 'Тир-лист Hearthstone Battlegrounds: существа, стратегии, заклинания и аксессуары с фильтрами и просмотром карт.',
    canonical: '/battlegrounds/tier-list',
    ogType: 'website',
    h1: 'Тир-лист Полей Сражений',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Поля Сражений", "item": `${SITE_URL}/battlegrounds/tier-list` },
          { "@type": "ListItem", "position": 3, "name": "Тир-лист", "item": `${SITE_URL}/battlegrounds/tier-list` }
        ]
      },
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/battlegrounds/tier-list#collection`,
        "name": "Тир-лист Полей Сражений Hearthstone",
        "description": "Существа, стратегии, заклинания и аксессуары Hearthstone Battlegrounds.",
        "url": `${SITE_URL}/battlegrounds/tier-list`,
        "inLanguage": "ru"
      }
    ],
    noscript: `
      <h1>Тир-лист Полей Сражений</h1>
      <p>Существа, стратегии, заклинания и аксессуары Hearthstone Battlegrounds с фильтрами и просмотром карт.</p>
      <p><a href="/library">Библиотека</a> | <a href="/heroes">Герои</a> | <a href="/battlegrounds/strategies">Конструктор стратегий</a></p>`
  },
  '/battlegrounds/tier-builder': {
    title: 'Конструктор тир-листов Полей Сражений | HS-Arena',
    description: 'Конструктор тир-листов Hearthstone Battlegrounds: создавайте собственные списки героев, карт и стратегий Полей Сражений.',
    canonical: '/battlegrounds/tier-builder',
    ogType: 'website',
    h1: 'Конструктор тир-листов Полей Сражений',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Поля Сражений", "item": `${SITE_URL}/battlegrounds/tier-builder` },
          { "@type": "ListItem", "position": 3, "name": "Конструктор тир-листов", "item": `${SITE_URL}/battlegrounds/tier-builder` }
        ]
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/battlegrounds/tier-builder#app`,
        "name": "Конструктор тир-листов Полей Сражений",
        "url": `${SITE_URL}/battlegrounds/tier-builder`,
        "description": "Инструмент для создания собственных тир-листов Hearthstone Battlegrounds.",
        "applicationCategory": "GameApplication",
        "operatingSystem": "Web",
        "inLanguage": "ru",
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "RUB" }
      }
    ],
    noscript: `
      <h1>Конструктор тир-листов Полей Сражений</h1>
      <p>Инструмент для создания собственных тир-листов Hearthstone Battlegrounds.</p>
      <p><a href="/">На главную</a> | <a href="/battlegrounds/strategies">Конструктор стратегий</a></p>`
  }
};

function generatePageHtml(baseHtml, pageData, path) {
  const { title, description, canonical, ogType, structuredData, noscript, h1 } = pageData;
  const fullCanonical = `${SITE_URL}${canonical}`;
  const ogImage = `${SITE_URL}/assets/og-preview.png`;

  const sdJson = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": structuredData
  });

  let html = baseHtml;

  html = html.replace(
    /<title>.*?<\/title>/,
    `<title>${title}</title>`
  );

  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${description}"`
  );

  html = html.replace(
    /<link rel="canonical" href="[^"]*"/,
    `<link rel="canonical" href="${fullCanonical}"`
  );

  html = html.replace(
    /<meta property="og:url"\s+content="[^"]*"/,
    `<meta property="og:url" content="${fullCanonical}"`
  );

  html = html.replace(
    /<meta property="og:title"\s+content="[^"]*"/,
    `<meta property="og:title" content="${title}"`
  );

  html = html.replace(
    /<meta property="og:description"\s+content="[^"]*"/,
    `<meta property="og:description" content="${description}"`
  );

  html = html.replace(
    /<meta name="twitter:title"\s+content="[^"]*"/,
    `<meta name="twitter:title" content="${title}"`
  );

  html = html.replace(
    /<meta name="twitter:description"\s+content="[^"]*"/,
    `<meta name="twitter:description" content="${description}"`
  );

  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">\n    ${sdJson}\n    </script>`
  );

  html = html.replace(
    '<div id="root"></div>',
    `<div id="root"><noscript>${noscript}</noscript></div>`
  );

  return html;
}

function makePublicReadable(path) {
  const stats = statSync(path);

  if (stats.isDirectory()) {
    chmodSync(path, 0o755);
    for (const child of readdirSync(path)) {
      makePublicReadable(resolve(path, child));
    }
    return;
  }

  if (stats.isFile()) {
    chmodSync(path, 0o644);
  }
}

function main() {
  const distDir = resolve(process.cwd(), 'dist');

  if (!existsSync(distDir)) {
    console.error('[prerender] dist/ not found. Run "vite build" first.');
    process.exit(1);
  }

  const indexPath = resolve(distDir, 'index.html');
  const baseHtml = readFileSync(indexPath, 'utf-8');

  const today = new Date().toISOString().split('T')[0];

  console.log('[prerender] Generating per-route HTML...');

  for (const [path, pageData] of Object.entries(PAGES)) {
    const routeDir = path === '/' ? distDir : resolve(distDir, path.slice(1));
    const filePath = resolve(routeDir, 'index.html');

    if (!existsSync(routeDir)) {
      mkdirSync(routeDir, { recursive: true });
    }

    const pageHtml = generatePageHtml(baseHtml, pageData, path);
    writeFileSync(filePath, pageHtml, 'utf-8');
    console.log(`[prerender] ✓ ${path} → ${filePath}`);
  }

  const sitemapPath = resolve(distDir, 'sitemap.xml');
  if (existsSync(sitemapPath)) {
    let sitemap = readFileSync(sitemapPath, 'utf-8');
    sitemap = sitemap.replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${today}</lastmod>`);
    if (!sitemap.includes('<lastmod>')) {
      sitemap = sitemap.replace(/<\/url>/g, `</url>`); // already has lastmod from source
    }
    writeFileSync(sitemapPath, sitemap, 'utf-8');
    console.log('[prerender] ✓ Updated sitemap.xml lastmod dates');
  }

  makePublicReadable(distDir);
  console.log('[prerender] ✓ Fixed dist/ permissions');
  console.log('[prerender] Done! All routes pre-rendered.');
}

main();
