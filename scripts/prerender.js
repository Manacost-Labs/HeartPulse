import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

const PUBLIC_ROUTE_INVENTORY = JSON.parse(readFileSync(
  resolve(process.cwd(), 'config/public-route-inventory.json'),
  'utf8',
));
if (PUBLIC_ROUTE_INVENTORY.schemaVersion !== 1) {
  throw new Error(`[prerender] Unsupported public route inventory version: ${PUBLIC_ROUTE_INVENTORY.schemaVersion}`);
}
const PUBLIC_SEO_REGISTRY = JSON.parse(readFileSync(
  resolve(process.cwd(), 'config/public-seo-pages.json'),
  'utf8',
));
if (PUBLIC_SEO_REGISTRY.schemaVersion !== 1
  || !PUBLIC_SEO_REGISTRY.pages
  || typeof PUBLIC_SEO_REGISTRY.pages !== 'object') {
  throw new Error(`[prerender] Unsupported public SEO registry version: ${PUBLIC_SEO_REGISTRY.schemaVersion}`);
}
const SITE_URL = PUBLIC_ROUTE_INVENTORY.canonicalOrigin;
const TODAY = new Date().toISOString().split('T')[0];
const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];

function renderSeoTemplate(value) {
  return String(value).replace(/\{([a-z]+)\}/g, (_match, token) => {
    if (token === 'year') return String(new Date().getUTCFullYear());
    throw new Error(`[prerender] Unsupported SEO template token: {${token}}`);
  });
}

const SEO_PAGES = new Map(Object.entries(PUBLIC_SEO_REGISTRY.pages).map(([pathname, page]) => {
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/';
  if (!pathname.startsWith('/') || pathname !== normalizedPathname || /[?#]/.test(pathname)
    || !page || typeof page.policyRouteId !== 'string' || !page.policyRouteId.trim()
    || typeof page.title !== 'string' || page.title.trim().length < 10
    || typeof page.description !== 'string' || page.description.trim().length < 40
    || typeof page.sitemap !== 'boolean') {
    throw new Error(`[prerender] Invalid public SEO page: ${pathname}`);
  }
  return [pathname, {
    ...page,
    title: renderSeoTemplate(page.title.trim()),
    description: renderSeoTemplate(page.description.trim()),
  }];
}));

const PAGES = {
  '/': {
    h1: 'HS-Arena — Статистика Арены Hearthstone',
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
          "@id": `${SITE_URL}/#org`,
          "name": "Manacost",
          "url": SITE_URL,
          "logo": { "@type": "ImageObject", "url": `${SITE_URL}/assets/arena_icon.webp` },
          "sameAs": [
            "https://t.me/manacost_ru",
            "https://boosty.to/kolodahearthstone"
          ]
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
            "acceptedAnswer": { "@type": "Answer", "text": "По данным HSReplay и Firestone, в текущем патче топ-3 классы меняются с каждым обновлением. Актуальный рейтинг классов по проценту побед смотрите на странице «Классы»." }
          },
          {
            "@type": "Question",
            "name": "Как пользоваться тир-листом карт?",
            "acceptedAnswer": { "@type": "Answer", "text": "Выберите класс в верхней панели тир-листа, чтобы увидеть оценки всех карт именно для него. Карты класса S — авто-пик, A — отличные, B — хорошие, C и ниже — ситуативные." }
          },
          {
            "@type": "Question",
            "name": "Как выбрать легендарку на Арене?",
            "acceptedAnswer": { "@type": "Answer", "text": "На старте Арены вам предлагают группу из трёх легендарных карт. Выбирайте ту группу, у которой наивысший процент побед — это показывает страница «Легендарки»." }
          },
          {
            "@type": "Question",
            "name": "Как часто обновляются данные?",
            "acceptedAnswer": { "@type": "Answer", "text": "Данные о винрейтах классов и тир-лист карт обновляются автоматически несколько раз в сутки на основе HSReplay, Firestone и HearthArena." }
          },
          {
            "@type": "Question",
            "name": "Что такое винрейт класса на Арене?",
            "acceptedAnswer": { "@type": "Answer", "text": "Винрейт — процент матчей, выигранных игроками этого класса. Например, 55% означает, что из 100 партий класс выигрывает в среднем 55." }
          },
          {
            "@type": "Question",
            "name": "Сколько побед нужно для окупаемости Арены?",
            "acceptedAnswer": { "@type": "Answer", "text": "Для полной окупаемости (получить золото ≥ стоимости входа) обычно нужно 7+ побед. При 12 победах вы получаете максимальные награды." }
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
        <li><a href="/gallery">Галерея</a> — арты Манакоста в высоком качестве</li>
        <li><a href="/guides-archive">Архив гайдов</a> — старые материалы Koloda Hearthstone в удобном формате</li>
        <li><a href="/contests">Конкурсы</a> — розыгрыши для подписчиков Манакоста</li>
      </ul>`
  },
  '/faq': {
    h1: 'Частые вопросы о Manacost Stats',
    ogType: 'website',
    structuredData: [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'FAQ', item: `${SITE_URL}/faq` },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Как подтвердить подписку Boosty?',
            acceptedAnswer: { '@type': 'Answer', text: 'В профиле укажите email из Boosty, подтвердите его кодом из письма и обновите статус подписки.' },
          },
          {
            '@type': 'Question',
            name: 'Как подтвердить подписку Telegram?',
            acceptedAnswer: { '@type': 'Answer', text: 'Привяжите сам Telegram-аккаунт через вход или отправьте созданный в профиле ID-код боту.' },
          },
          {
            '@type': 'Question',
            name: 'Что открывает тариф Алмаз?',
            acceptedAnswer: { '@type': 'Answer', text: 'Алмаз открывает все режимы, Стандарт, Вольный, закрытые статьи и статистику карт.' },
          },
          {
            '@type': 'Question',
            name: 'Как запустить обучение по странице?',
            acceptedAnswer: { '@type': 'Answer', text: 'Нажмите «Помощь» в верхней панели и выберите «Обучение по странице». Подсказку можно закрыть, продолжить позже или запустить заново.' },
          },
        ],
      },
    ],
    noscript: '<h1>Частые вопросы о Manacost Stats</h1><p>Помощь по регистрации, входу, подтверждению Boosty и Telegram, уровням подписки, paywall и игровой статистике.</p><p><a href="/?login">Открыть профиль</a> | <a href="/standard/cards">Карты</a> | <a href="/articles">Статьи</a></p>',
  },
  '/standard/matchups': {
    h1: 'Матчапы Стандарта Hearthstone',
    ogType: 'website',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Стандарт", "item": `${SITE_URL}/standard/matchups` },
          { "@type": "ListItem", "position": 3, "name": "Матчапы", "item": `${SITE_URL}/standard/matchups` }
        ]
      },
      {
        "@type": "Dataset",
        "@id": `${SITE_URL}/standard/matchups#dataset`,
        "name": "Матчапы Стандарта Hearthstone",
        "description": "Матрица винрейтов архетипов актуальной меты Стандарта Hearthstone по данным HSGuru.",
        "url": `${SITE_URL}/standard/matchups`,
        "creator": { "@type": "Organization", "name": "Manacost" },
        "about": {
          "@type": "VideoGame",
          "name": "Hearthstone",
          "gameMode": "Standard"
        }
      }
    ],
    noscript: `
      <h1>Матчапы Стандарта Hearthstone</h1>
      <p>Матрица матчапов актуальной меты Стандарта по данным HSGuru: строки показывают выбранный архетип, столбцы — соперника, в ячейках винрейт.</p>
      <p>Доступны таблицы для Легенды и Алмаза 4-1 по подписке Манакоста уровня «Алмаз».</p>
      <p><a href="/">На главную</a> | <a href="/articles">Статьи</a> | <a href="/classes">Арена</a></p>`
  },
  '/standard/meta': {
    h1: 'Мета Hearthstone', ogType: 'website', structuredData: [],
    noscript: '<h1>Мета Hearthstone</h1><p>Тир-листы, винрейты, популярность и готовые сборки актуальной меты Стандарта и Вольного режима доступны с тарифом «Алмаз».</p>'
  },
  '/standard/archetypes': {
    h1: 'Архетипы Hearthstone', ogType: 'website', structuredData: [],
    noscript: '<h1>Архетипы Hearthstone</h1><p>Каталог актуальных архетипов Стандарта и Вольного режима с отдельными страницами, сборками и историей статистики доступен с тарифом «Алмаз».</p>'
  },
  '/standard/vicious-gold': {
    h1: 'Vicious Syndicate Gold', ogType: 'website', structuredData: [],
    noscript: '<h1>Vicious Syndicate Gold</h1><p>Живая статистика классов, архетипов, сборок и Power Tier Стандарта доступна с тарифом «Алмаз».</p>'
  },
  '/standard/cards': {
    h1: 'Карты Hearthstone', ogType: 'website', structuredData: [],
    noscript: '<h1>Карты Hearthstone</h1><p>Открытая библиотека карт Стандарта и Вольного режима с подробными страницами. Статистика Легенды доступна с тарифом «Алмаз».</p>'
  },
  '/classes': {
    h1: 'Винрейт классов на Арене Hearthstone',
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
  '/gallery': {
    ogType: 'website',
    h1: 'Галерея артов Манакоста',
    structuredData: [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Галерея", "item": `${SITE_URL}/gallery` }
        ]
      },
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/gallery#collection`,
        "name": "Галерея артов Манакоста",
        "description": "Публичная галерея артов Манакоста в высоком качестве для просмотра и скачивания.",
        "url": `${SITE_URL}/gallery`,
        "isAccessibleForFree": true
      }
    ],
    noscript: `
      <h1>Галерея артов Манакоста</h1>
      <p>Публичная галерея артов в высоком качестве. Просмотр и скачивание доступны всем пользователям.</p>
      <p><a href="/">На главную</a> | <a href="/articles">Статьи</a> | <a href="/contests">Конкурсы</a> | <a href="/classes">Винрейты классов</a></p>`
  },
  '/guides-archive': {
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

const NOINDEX_PAGES = new Map([
  ['/admin', {
    h1: 'Админ-панель',
    ogType: 'website',
    structuredData: [],
    noscript: '<h1>Админ-панель</h1><p>Для работы административной панели необходим JavaScript и авторизованный аккаунт администратора.</p>',
  }],
  ['/deck-builder', {
    h1: 'Конструктор колоды',
    ogType: 'website',
    structuredData: [],
    noscript: '<h1>Конструктор колоды</h1><p>Административный конструктор колод доступен только после входа в аккаунт администратора и при включённом JavaScript.</p>',
  }],
  ['/archetypes', {
    h1: 'Архетипы',
    ogType: 'website',
    structuredData: [],
    noscript: '<h1>Архетипы</h1><p>Административный каталог архетипов доступен только после входа в аккаунт администратора и при включённом JavaScript.</p>',
  }],
]);

const NOT_FOUND_PAGE = {
  title: 'Страница не найдена | Manacost Stats',
  description: 'Запрошенная страница не найдена.',
  h1: 'Страница не найдена',
  ogType: 'website',
  structuredData: [],
  noscript: '<h1>Страница не найдена</h1><p>Проверьте адрес или вернитесь на <a href="/">главную страницу</a>.</p>',
};

function pageWithSeo(pathname, content) {
  const seo = SEO_PAGES.get(pathname);
  if (!seo) throw new Error(`[prerender] Missing SEO registry page: ${pathname}`);
  return { ...content, title: seo.title, description: seo.description };
}

function assertSeoMaterializationContract() {
  const contentPaths = new Set([...Object.keys(PAGES), ...NOINDEX_PAGES.keys()]);
  if (contentPaths.size !== SEO_PAGES.size) {
    throw new Error(`[prerender] SEO registry/materialized page count mismatch: ${SEO_PAGES.size}/${contentPaths.size}`);
  }

  for (const [pathname, seo] of SEO_PAGES) {
    if (!contentPaths.has(pathname)) {
      throw new Error(`[prerender] SEO registry page has no materialized HTML: ${pathname}`);
    }
    const policy = resolvePathPolicy(pathname);
    if (policy.id !== seo.policyRouteId) {
      throw new Error(`[prerender] ${pathname} maps to ${policy.id}, expected ${seo.policyRouteId}`);
    }
    if (seo.sitemap && (policy.indexPolicy !== 'index' || policy.canonicalPolicy !== 'self')) {
      throw new Error(`[prerender] Sitemap page is not indexable and self-canonical: ${pathname}`);
    }
    if (!seo.sitemap && (policy.indexPolicy === 'index' || policy.canonicalPolicy !== 'none')) {
      throw new Error(`[prerender] Non-sitemap page must be noindex without canonical: ${pathname}`);
    }
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function generateStaticSitemapXml() {
  const urls = [...SEO_PAGES.entries()]
    .filter(([, page]) => page.sitemap)
    .map(([pathname]) => {
      const canonical = canonicalUrlFor(pathname, resolvePathPolicy(pathname));
      if (!canonical) throw new Error(`[prerender] Sitemap page has no canonical URL: ${pathname}`);
      return `  <url><loc>${escapeXml(canonical)}</loc></url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

function generateSitemapIndexXml() {
  const locations = [
    `${SITE_URL}/sitemaps/static.xml`,
    `${SITE_URL}/sitemaps/standard-cards.xml`,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.map(location => `  <sitemap><loc>${escapeXml(location)}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`;
}

const API_BASE = process.env.PRERENDER_API || 'http://127.0.0.1:3101';

function normalizePathname(pathname) {
  const withoutQuery = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  const absolute = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return absolute.replace(/\/+$/, '') || '/';
}

function routeMatchesPath(route, pathname) {
  if (route.kind === 'fallback') return true;
  const templateParts = route.pattern === '/' ? [] : route.pattern.slice(1).split('/');
  const pathParts = pathname === '/' ? [] : pathname.slice(1).split('/');
  const catchAll = templateParts.at(-1)?.endsWith('*') ?? false;
  if ((!catchAll && templateParts.length !== pathParts.length)
    || (catchAll && pathParts.length < templateParts.length - 1)) return false;

  return templateParts.every((templatePart, index) => {
    if (!templatePart.startsWith(':')) return templatePart === pathParts[index];
    if (templatePart.endsWith('*')) return true;
    let value;
    try {
      value = decodeURIComponent(pathParts[index] || '');
    } catch {
      return false;
    }
    if (!value) return false;
    const constraint = route.pathParameters?.[templatePart.slice(1)];
    if (constraint?.allowedValues && !constraint.allowedValues.includes(value)) return false;
    if (constraint?.pattern && !new RegExp(constraint.pattern).test(value)) return false;
    return true;
  });
}

function resolvePathPolicy(pathname) {
  const normalizedPathname = normalizePathname(pathname);
  const route = PUBLIC_ROUTE_INVENTORY.routes.find(candidate => routeMatchesPath(candidate, normalizedPathname));
  if (!route) throw new Error(`[prerender] No public URL policy for ${normalizedPathname}`);
  return { ...route, normalizedPathname };
}

function robotsContent(indexPolicy) {
  if (indexPolicy === 'noindex-nofollow') return 'noindex, nofollow';
  if (indexPolicy === 'noindex-follow') return 'noindex, follow';
  return 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
}

function canonicalUrlFor(pathname, policy) {
  if (policy.canonicalPolicy === 'none') return null;
  const path = normalizePathname(pathname);
  const canonicalPath = path === '/' || PUBLIC_ROUTE_INVENTORY.canonicalTrailingSlash !== 'always'
    ? path
    : `${path}/`;
  return `${SITE_URL}${canonicalPath}`;
}

async function fetchJson(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function fmtDate(iso) {
  if (iso && typeof iso === 'object') {
    const values = [iso.winrates, iso.tierlist, iso.legendaries]
      .filter(value => value && !Number.isNaN(Date.parse(value)))
      .sort((a, b) => Date.parse(b) - Date.parse(a));
    return values[0] ? values[0].split('T')[0] : TODAY;
  }
  if (!iso) return TODAY;
  return String(iso).split('T')[0];
}

// Static, crawler-readable data summaries appended below the app (outside #root,
// so React hydration never wipes them). Only data that is already publicly
// visible in the UI goes here — never the subscriber-gated per-card ratings.
function buildSeoSummaries({ winrates, tierlist, legendaries }) {
  const s = {};
  const wrDate = fmtDate(winrates && winrates.updatedAt);

  const classList = (winrates && winrates.classes) || [];
  const topClasses = [...classList].sort((a, b) => b.winrate - a.winrate);

  if (topClasses.length) {
    const top5 = topClasses.slice(0, 5)
      .map((c, i) => `<li>${c.name} — ${c.winrate}% побед (${c.games} игр)</li>`)
      .join('');
    s['/'] = `
      <h2>Сводка Арены Hearthstone на ${wrDate}</h2>
      <p>Manacost Arena — бесплатный справочник по режиму Арена в Hearthstone на русском языке.
      Мы автоматически собираем статистику с HSReplay, HearthArena и Firestone четыре раза в сутки
      и превращаем её в понятные инструменты: рейтинг классов по проценту побед, тир-лист карт
      с оценками от S до F для каждого класса и группы легендарных карт для первого выбора.
      Данные основаны на миллионах реальных партий текущего патча, поэтому рейтинг отражает
      живой метагейм, а не устаревшие представления о силе классов.</p>
      <h3>Топ-5 классов по винрейту (${wrDate})</h3>
      <ol>${top5}</ol>
      <p>Полный рейтинг всех 11 классов — на странице <a href="/classes/">Винрейт классов</a>.
      Оценки карт — в <a href="/tierlist/">Тир-листе</a>, наборы первого выбора — в разделе
      <a href="/legendaries/">Легендарки</a>. Источник данных: HSReplay. Обновлено: ${wrDate}.</p>`;

  }

  if (tierlist && Array.isArray(tierlist.sections) && tierlist.sections.length) {
    const tlDate = fmtDate(tierlist.updatedAt);
    const perClass = tierlist.sections.map(sec => {
      const counts = (sec.tiers || [])
        .map(t => `${t.tier}: ${(t.cards || []).length}`)
        .join(', ');
      return `<li>${sec.name} — ${counts}</li>`;
    }).join('');
    const totalCards = Object.keys(tierlist.cards || {}).length;
    s['/tierlist'] = `
      <h2>Тир-лист карт Арены Hearthstone — ${tlDate}</h2>
      <p>Тир-лист ранжирует все ${totalCards ? totalCards + ' ' : ''}карты текущего пула Арены
      по силе для каждого класса. Оценка S означает авто-пик — карту стоит брать почти всегда;
      A и B — сильные и хорошие карты; C — середина; D, E и F — слабые карты, которые берут
      только при отсутствии альтернатив. Оценки рассчитываются автоматически на основе винрейтов
      колод с этими картами (HSReplay), рейтингов HearthArena и Firestone и обновляются несколько
      раз в сутки. Ниже — сводка по количеству карт в каждом тире для всех классов.</p>
      <h3>Количество карт по тирам (${tlDate})</h3>
      <ul>${perClass}</ul>
      <p>Полный список карт с оценками, поиском и фильтрами — на странице
      <a href="/tierlist/">Тир-лист</a> (доступ к детальным оценкам — по подписке Манакоста).
      Источник: ${tierlist.source || 'HSReplay, HearthArena, Firestone'}. Обновлено: ${tlDate}.</p>`;
  }

  if (legendaries && Array.isArray(legendaries.groups) && legendaries.groups.length) {
    const lgDate = fmtDate(legendaries.updatedAt);
    const classNames = {};
    for (const c of classList) classNames[c.id] = c.name;
    const top = [...legendaries.groups]
      .filter(g => g.keyCard && typeof g.keyCard.winrate === 'number')
      .sort((a, b) => b.keyCard.winrate - a.keyCard.winrate)
      .slice(0, 10)
      .map(g => `<li>${g.keyCard.name}${classNames[g.keyCard.classKey] ? ' (' + classNames[g.keyCard.classKey] + ')' : ''} — ${g.keyCard.winrate}% побед</li>`)
      .join('');
    s['/legendaries'] = `
      <h2>Легендарные группы Арены Hearthstone — ${lgDate}</h2>
      <p>В начале каждого драфта Арены игроку предлагают выбор из групп легендарных карт.
      Правильный первый выбор — одно из самых важных решений забега: сильная легендарка задаёт
      план на игру и стабильно добавляет победы. В таблице ниже — десять лучших ключевых
      легендарных карт текущего патча по проценту побед колод, в которых они встречаются.
      Всего групп: ${legendaries.groups.length}. Данные обновляются автоматически несколько раз
      в сутки на основе HSReplay и Firestone.</p>
      <h3>Топ-10 легендарных карт для первого выбора (${lgDate})</h3>
      <ol>${top}</ol>
      <p>Все группы с фильтром по классам — на странице <a href="/legendaries/">Легендарки</a>.
      Обновлено: ${lgDate}.</p>`;
  }

  return s;
}

const SEO_SUMMARY_STYLE = 'background:#060c18;color:#9fb1ca;font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.6;padding:2rem 1rem 3rem;';
const SEO_SUMMARY_INNER = 'max-width:960px;margin:0 auto;';

function canonicalizeSchemaPageReferences(value, pathname, fullCanonical, parentKey = '') {
  if (Array.isArray(value)) {
    return value.map(item => canonicalizeSchemaPageReferences(item, pathname, fullCanonical, parentKey));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      canonicalizeSchemaPageReferences(child, pathname, fullCanonical, key),
    ]));
  }
  if (typeof value !== 'string' || !['@id', 'item', 'url'].includes(parentKey)) return value;

  try {
    const reference = new URL(value);
    const referencePath = normalizePathname(reference.pathname);
    if (reference.origin === SITE_URL) {
      const canonical = referencePath === normalizePathname(pathname)
        ? fullCanonical
        : SEO_PAGES.has(referencePath)
          ? canonicalUrlFor(referencePath, resolvePathPolicy(referencePath))
          : null;
      if (canonical) return `${canonical}${reference.search}${reference.hash}`;
    }
  } catch {
    // Schema fields can contain non-URL values; leave those untouched.
  }
  return value;
}

function generatePageHtml(baseHtml, pageData, path, seoSummary, policy = resolvePathPolicy(path)) {
  const { title, description, ogType, structuredData = [], noscript } = pageData;
  const fullCanonical = canonicalUrlFor(path, policy);

  // Enrich schema graph: breadcrumb linkage, language, dataset licensing.
  const enriched = policy.indexPolicy === 'index' && fullCanonical
    ? structuredData.map(node => canonicalizeSchemaPageReferences(node, path, fullCanonical))
    : [];
  const breadcrumb = enriched.find(n => n['@type'] === 'BreadcrumbList');
  if (breadcrumb && !breadcrumb['@id']) breadcrumb['@id'] = `${fullCanonical}#breadcrumb`;
  for (const node of enriched) {
    const type = node['@type'];
    if (!node.inLanguage && ['WebSite', 'WebApplication', 'CollectionPage', 'Dataset', 'ItemList', 'FAQPage'].includes(type)) {
      node.inLanguage = 'ru';
    }
    if (breadcrumb && !node.breadcrumb && ['WebApplication', 'CollectionPage', 'Dataset', 'ItemList'].includes(type)) {
      node.breadcrumb = { "@id": breadcrumb['@id'] };
    }
    if (type === 'Dataset') {
      if (!node.license) node.license = 'https://creativecommons.org/licenses/by/4.0/';
      node.temporalCoverage = `${THIRTY_DAYS_AGO}/${TODAY}`;
      node.dateModified = TODAY;
    }
  }

  const sdJson = enriched.length ? JSON.stringify({
    "@context": "https://schema.org",
    "@graph": enriched
  }) : null;

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
    /<meta name="robots" content="[^"]*"/,
    `<meta name="robots" content="${robotsContent(policy.indexPolicy)}"`
  );

  if (fullCanonical) {
    html = html.replace(
      /<link rel="canonical" href="[^"]*"/,
      `<link rel="canonical" href="${fullCanonical}"`
    );
    html = html.replace(
      /<meta property="og:url"\s+content="[^"]*"/,
      `<meta property="og:url" content="${fullCanonical}"`
    );
  } else {
    html = html.replace(/\s*<link rel="canonical"[^>]*>/, '');
    html = html.replace(/\s*<meta property="og:url"[^>]*>/, '');
  }

  html = html.replace(
    /<meta property="og:type"\s+content="[^"]*"/,
    `<meta property="og:type" content="${ogType || 'website'}"`
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

  html = sdJson
    ? html.replace(
      /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
      `<script type="application/ld+json">\n    ${sdJson}\n    </script>`
    )
    : html.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');

  const routeStatusAttribute = policy.kind === 'fallback' ? ' data-route-status="404"' : '';
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root"${routeStatusAttribute}><noscript>${noscript}</noscript></div>`
  );

  if (seoSummary && policy.indexPolicy === 'index') {
    // #root keeps 100vh min-height so this block never enters the first
    // viewport before hydration (no CLS); crawlers without JS still read it.
    html = html.replace(
      '</body>',
      `<style>#root{min-height:100vh}#seo-summary{display:none!important}#seo-summary h2,#seo-summary h3{color:#d9e3f2}#seo-summary a{color:#93c5fd}</style>
<section id="seo-summary" aria-label="Сводка данных" hidden style="${SEO_SUMMARY_STYLE}"><div style="${SEO_SUMMARY_INNER}">${seoSummary}</div></section>
</body>`
    );
  }

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

function writePrerenderedPage(distDir, baseHtml, path, pageData, seoSummary, policy, filePathOverride) {
  const routeDir = path === '/' ? distDir : resolve(distDir, path.slice(1));
  const filePath = filePathOverride || resolve(routeDir, 'index.html');
  const outputDir = filePathOverride ? dirname(filePath) : routeDir;

  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const pageHtml = generatePageHtml(baseHtml, pageData, path, seoSummary, policy);
  writeFileSync(filePath, pageHtml, 'utf-8');
  console.log(`[prerender] ✓ ${path} → ${filePath}`);
}

async function main() {
  const distDir = resolve(process.cwd(), process.env.PRERENDER_DIST_DIR || 'dist');

  if (!existsSync(distDir)) {
    console.error(`[prerender] ${distDir} not found. Run "vite build" first.`);
    process.exit(1);
  }

  const indexPath = resolve(distDir, 'index.html');
  const baseHtml = readFileSync(indexPath, 'utf-8');

  const homeSummaryFixture = process.env.PRERENDER_HOME_SUMMARY_FIXTURE?.trim();
  const skipRemote = process.env.PRERENDER_SKIP_REMOTE === '1' && !homeSummaryFixture;
  console.log(homeSummaryFixture
    ? `[prerender] Loading SEO summary fixture: ${homeSummaryFixture}`
    : skipRemote
      ? '[prerender] Skipping live SEO summaries (PRERENDER_SKIP_REMOTE=1).'
      : '[prerender] Fetching live data for SEO summaries...');
  const homeSummary = homeSummaryFixture
    ? JSON.parse(readFileSync(resolve(process.cwd(), homeSummaryFixture), 'utf8'))
    : skipRemote
      ? null
      : await fetchJson(`${API_BASE}/api/home/summary`);
  const summaries = buildSeoSummaries({
    winrates: homeSummary ? {
      updatedAt: homeSummary.updatedAt,
      classes: homeSummary.topClasses || [],
    } : null,
    tierlist: null,
    legendaries: null,
  });
  console.log(`[prerender] SEO summaries ready for: ${Object.keys(summaries).join(', ') || 'none (API unavailable)'}`);

  console.log('[prerender] Generating per-route HTML...');
  assertSeoMaterializationContract();

  for (const [path, pageData] of Object.entries(PAGES)) {
    const policy = resolvePathPolicy(path);
    if (policy.indexPolicy !== 'index' || policy.canonicalPolicy !== 'self') {
      throw new Error(`[prerender] ${path} must map to an indexable, self-canonical route policy`);
    }
    writePrerenderedPage(distDir, baseHtml, path, pageWithSeo(path, pageData), summaries[path], policy);
  }

  for (const [path, pageData] of NOINDEX_PAGES) {
    const policy = resolvePathPolicy(path);
    if (policy.indexPolicy === 'index' || policy.canonicalPolicy !== 'none') {
      throw new Error(`[prerender] ${path} must map to a noindex route without a canonical URL`);
    }
    writePrerenderedPage(distDir, baseHtml, path, pageWithSeo(path, pageData), null, policy);
  }

  const notFoundPolicy = PUBLIC_ROUTE_INVENTORY.routes.find(route => route.kind === 'fallback');
  if (!notFoundPolicy || notFoundPolicy.indexPolicy === 'index' || notFoundPolicy.canonicalPolicy !== 'none') {
    throw new Error('[prerender] Fallback route must be noindex and have no canonical URL');
  }
  writePrerenderedPage(
    distDir,
    baseHtml,
    '/404',
    NOT_FOUND_PAGE,
    null,
    { ...notFoundPolicy, normalizedPathname: '/404' },
    resolve(distDir, '404.html'),
  );

  const sitemapDirectory = resolve(distDir, 'sitemaps');
  mkdirSync(sitemapDirectory, { recursive: true });
  writeFileSync(resolve(sitemapDirectory, 'static.xml'), generateStaticSitemapXml(), 'utf-8');
  writeFileSync(resolve(distDir, 'sitemap.xml'), generateSitemapIndexXml(), 'utf-8');
  console.log(`[prerender] ✓ sitemap index + static segment (${[...SEO_PAGES.values()].filter(page => page.sitemap).length} static URLs)`);

  makePublicReadable(distDir);
  console.log('[prerender] ✓ Fixed dist/ permissions');
  console.log('[prerender] Done! All routes pre-rendered.');
}

main();
