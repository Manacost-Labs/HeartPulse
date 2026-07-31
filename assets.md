<!-- markdownlint-disable MD013 MD033 -->

# HS-Arena: дизайн-система и каталог ассетов

Этот файл предназначен для переноса визуального языка HS-Arena в другой проект. Все URL абсолютные и указывают на production-домен:

`https://arena.hs-manacost.ru/`

Каталог сформирован по содержимому `public/` и включает **299 визуальных ассета**. Для стабильного production-проекта рекомендуется скачать нужные файлы и обслуживать их со своего домена: публичные URL удобны для прототипа и миграции, но не являются отдельным CDN API. Шрифты особенно желательно self-host из-за междоменных CORS-ограничений.

> Hearthstone® и связанные игровые изображения принадлежат Blizzard Entertainment. Перед использованием в стороннем публичном или коммерческом проекте проверьте права и правила использования соответствующих материалов.

## 1. Визуальное направление

HS-Arena выглядит как читаемый статистический компендиум Hearthstone:

- единый непрерывный пергамент вместо набора белых dashboard-карточек;
- красное тавернное сукно для Арены, меню, важных заголовков и модальных окон;
- пыльный фиолетовый для Полей Сражений;
- дерево для рамок и крупных разделителей;
- золото только для небольших акцентов и выбранных состояний;
- игровые изображения остаются главным визуальным объектом и не перекрашиваются CSS-фильтрами;
- внутренние информационные блоки почти квадратные, с радиусом 4–8 px;
- тени тёплые и редкие;
- декоративные псевдоэлементы всегда ограничены позиционированным контейнером.

## 2. Цветовые токены

```css
:root {
  --hs-parchment: #ead6a7;
  --hs-parchment-light: #f7e8bf;
  --hs-ink: #30251c;
  --hs-ink-muted: #735e49;

  --hs-wood: #2e160b;
  --hs-wood-soft: #5f371d;

  --hs-arena-red: #8d171d;
  --hs-arena-red-dark: #5d0d13;

  --hs-bg-violet: #8f536d;
  --hs-bg-violet-dark: #3d2335;
  --hs-bg-violet-deep: #2a1725;
  --hs-bg-violet-selected: #4a2f66;

  --hs-gold: #d9ab49;
  --hs-gold-bright: #efc96f;

  --hs-positive: #2f7a3e;
  --hs-negative: #a33a3a;
}
```

| Роль | Значение | Применение |
| --- | --- | --- |
| Пергамент | `#ead6a7`, `#f7e8bf` | Страница и спокойные панели |
| Чернила | `#30251c` | Основной текст |
| Приглушённые чернила | `#735e49` | Описания и метаданные |
| Дерево | `#2e160b`, `#5f371d` | Рамы и разделители |
| Arena red | `#8d171d`, `#5d0d13` | Арена, меню, активные состояния |
| BG violet | `#8f536d`, `#3d2335`, `#2a1725`, `#4a2f66` | Поля Сражений и выбранные элементы |
| Золото | `#d9ab49`, `#efc96f` | Малые акценты |
| Положительные данные | `#2f7a3e` | Только хорошие метрики |
| Отрицательные данные | `#a33a3a` | Ошибки и плохие метрики |

## 3. Типографика

- Заголовки и меню: `HSDisplay`.
- Основной текст: `Inter`.
- Базовый размер текста: 16 px / 24 px.
- Базовая шкала отступов: 4, 8, 12, 24, 40 и 64 px.
- Радиусы: 4, 6, 8, 12 px; pill — 9999 px.
- Верхний регистр используется только в коротких kicker-подписях.

```css
@font-face {
  font-family: "HSDisplay";
  src: url("https://arena.hs-manacost.ru/fonts/2318-font.otf") format("opentype");
  font-display: swap;
}

@font-face {
  font-family: "Inter";
  src: url("https://arena.hs-manacost.ru/fonts/google/inter-cyrillic.woff2") format("woff2");
  font-display: swap;
}

:root {
  --font-hs: "HSDisplay", Georgia, serif;
  --font-body: "Inter", system-ui, sans-serif;
}

h1, h2, h3, .hs-display { font-family: var(--font-hs); }
body { font-family: var(--font-body); }
```

## 4. Главные ассеты

| Назначение | Путь | Production URL | Роль |
| --- | --- | --- | --- |
| Пергамент страницы | `wallpaper/arena-parchment.jpg` | <https://arena.hs-manacost.ru/wallpaper/arena-parchment.jpg> | Непрерывный фон контента |
| Красное сукно | `wallpaper/arena-rail-red.jpg` | <https://arena.hs-manacost.ru/wallpaper/arena-rail-red.jpg> | Меню, Arena-заголовки, футер, lightbox |
| Главная деревянная рама | `wallpaper/main-page-rail-border.png` | <https://arena.hs-manacost.ru/wallpaper/main-page-rail-border.png> | Крупные панели и border-image |
| Компактная деревянная рама | `wallpaper/deck-border.png` | <https://arena.hs-manacost.ru/wallpaper/deck-border.png> | Поиск, статусы, небольшие карточки |
| BG-внешняя рама | `wallpaper/wiki-battlegrounds-skin.webp` | <https://arena.hs-manacost.ru/wallpaper/wiki-battlegrounds-skin.webp> | Конструкторы и крупные BG-поверхности |
| BG-вывеска | `wallpaper/battlegrounds-bartender-header.webp` | <https://arena.hs-manacost.ru/wallpaper/battlegrounds-bartender-header.webp> | Заголовок Полей Сражений |
| Орнамент заголовка | `wallpaper/main-page-header.svg` | <https://arena.hs-manacost.ru/wallpaper/main-page-header.svg> | Mask для коротких заголовков |
| Персонаж главной | `wallpaper/home-paladin-hero.webp` | <https://arena.hs-manacost.ru/wallpaper/home-paladin-hero.webp> | Мурал главного Arena-блока |
| Профильная таверна | `wallpaper/profile-hero-hth.webp` | <https://arena.hs-manacost.ru/wallpaper/profile-hero-hth.webp> | Фон профиля |
| Arena-иконка | `assets/arena_icon.webp` | <https://arena.hs-manacost.ru/assets/arena_icon.webp> | Маркер режима Арены |
| Мана | `assets/mana.png` | <https://arena.hs-manacost.ru/assets/mana.png> | Канонический кристалл стоимости карты; использовать без CSS-фильтров |

Кристалл маны располагается поверх единой подложки списка, слегка тонированной цветом класса. Подложка не разбивается на отдельные фигуры для каждой карты и плавно переходит в тёплый фон колоды: это исключает чёрную вертикальную полосу и грязные стыки у прозрачных граней PNG.

Исходник локального орнамента заголовка: <https://hearthstone.wiki.gg/images/b/b2/Main_page_header.svg>.

## 5. Готовые CSS-рецепты

### Непрерывный пергамент

```css
.hs-page {
  min-height: 100vh;
  color: var(--hs-ink);
  background-color: var(--hs-parchment);
  background-image:
    linear-gradient(rgba(249, 235, 202, .72), rgba(236, 213, 166, .78)),
    url("https://arena.hs-manacost.ru/wallpaper/arena-parchment.jpg");
  background-repeat: repeat;
  background-size: auto, 865px 878px;
}
```

### Красная тавернная поверхность

```css
.hs-arena-surface {
  color: #fff0c8;
  background:
    linear-gradient(90deg, rgba(69, 5, 9, .18), rgba(122, 20, 25, .12)),
    url("https://arena.hs-manacost.ru/wallpaper/arena-rail-red.jpg") center / 375px 172px repeat;
}
```

### Большая деревянная рама

```css
.hs-timber-frame {
  border: 12px solid transparent;
  border-radius: 0;
  border-image-source: url("https://arena.hs-manacost.ru/wallpaper/main-page-rail-border.png");
  border-image-slice: 13;
  border-image-width: 12px;
  border-image-repeat: stretch;
}
```

### Компактная рама

```css
.hs-deck-frame {
  border: 7px solid transparent;
  border-image-source: url("https://arena.hs-manacost.ru/wallpaper/deck-border.png");
  border-image-slice: 20;
  border-image-width: 7px;
  border-image-repeat: stretch;
}
```

### Орнамент короткого заголовка

```css
.hs-heading-plaque {
  position: relative;
  isolation: isolate;
  min-height: 58px;
  padding: .55rem 3rem .65rem;
  color: #fff0c8;
  text-align: center;
}

.hs-heading-plaque::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--hs-bg-violet-selected);
  -webkit-mask: url("https://arena.hs-manacost.ru/wallpaper/main-page-header.svg") center / 100% 100% no-repeat;
  mask: url("https://arena.hs-manacost.ru/wallpaper/main-page-header.svg") center / 100% 100% no-repeat;
  filter: drop-shadow(0 3px 3px rgba(20, 8, 14, .38));
}
```

### Рама конструктора Полей Сражений

```css
.hs-bg-builder-frame {
  padding: clamp(.5rem, .9vw, .75rem);
  border: clamp(20px, 2vw, 28px) solid transparent;
  border-image-source: url("https://arena.hs-manacost.ru/wallpaper/wiki-battlegrounds-skin.webp");
  border-image-slice: 82 fill;
  border-image-width: clamp(20px, 2vw, 28px);
  border-image-repeat: stretch;
  background: #bfa477;
}
```

### Lightbox

```css
.hs-lightbox-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 10px;
  background: rgba(18, 7, 7, .82);
  backdrop-filter: blur(8px);
}

.hs-lightbox-panel {
  max-width: 940px;
  max-height: calc(100dvh - 20px);
  overflow: auto;
  color: #f7e3b7;
  background:
    radial-gradient(circle at 28% 24%, rgba(166, 68, 67, .26), transparent 34%),
    linear-gradient(145deg, rgba(104, 24, 29, .98), rgba(48, 12, 17, .99)),
    url("https://arena.hs-manacost.ru/wallpaper/arena-rail-red.jpg") center / 375px 172px repeat;
}

body:has(.hs-lightbox-backdrop) {
  overflow: hidden;
}
```

### Обязательная защита мобильных декоративных слоёв

```css
.hs-framed-banner {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

.hs-framed-banner::before,
.hs-framed-banner::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
}
```

Без `position: relative` абсолютный слой может привязаться к странице и затемнить весь мобильный контент.

## 6. Композиция

### Общая оболочка

- Desktop-sidebar включается от 1024 px.
- Mobile-header липкий, drawer фиксированный.
- Стандартные страницы используют открытый пергамент шириной примерно 1280–1320 px.
- Конструкторы используют всю доступную ширину.
- На 390 px не допускается горизонтальная прокрутка документа.
- Touch-target — минимум 42 px, предпочтительно 46 px.

### Арена

- Основной акцент — красный.
- Заголовки и важные сводки допускают красную поверхность в деревянной раме.
- Фильтры остаются пергаментными, выбранные значения — красными.
- Карточки и классовые иконки не получают CSS-фильтры.

### Строки колоды

- Компактная строка карты использует единую кованую рамку по редкости: серебро, синий, фиолетовый или бронза.
- Мана использует настоящий локальный ассет `/assets/mana.png`. Рамка редкости начинается под правой гранью кристалла и не рисует второй многоугольник либо цветной «хвост» под его прозрачными углами.
- Официальный арт доходит до внутренней правой грани через широкую плавную маску. Количество копий или золотая звезда располагается поверх арта без отдельной плашки, светлой полосы и вертикальной рейки.
- В обычном списке название занимает одну строку с ellipsis; в интерактивном конструкторе допускаются две строки, а кнопки изменения количества сохраняют высоту не менее `44px`.
- Hover/focus подсвечивает только окантовку. CSS-фильтры к арту не применяются.

### Поля Сражений

- Основной акцент — пыльный фиолетовый.
- `#4A2F66` используется только для выбранных элементов, фокуса и коротких plaque-заголовков.
- Каталог и фильтры выглядят как одна тавернная ведомость.
- Для крупной иерархии применяется `main-page-rail-border.png`; для малых карточек — `deck-border.png`.
- Конструктор использует `wiki-battlegrounds-skin.webp`, а рабочая область остаётся тёмной.
- Не добавляйте вертикальные цветные рейлы на каждую карточку.

### Модальные окна

- Тёмный backdrop, лёгкий blur.
- Внутри — деревянная рама, красное сукно, кремовый текст.
- На телефоне сначала изображение, затем статистика.
- При открытии блокируется фоновая прокрутка с восстановлением исходной позиции.

## 7. Правила использования

1. Не перекрашивать карты, портреты, ману, редкость и классовые иконки через `filter`.
2. Не использовать золото как фон больших панелей.
3. Не строить интерфейс из одинаковых белых rounded-card.
4. Не заменять реальные заголовки декоративными SVG.
5. Не делать hover единственным способом получить информацию.
6. У длинного текста использовать `min-width: 0`, `overflow-wrap: anywhere` или осознанный truncation.
7. Для `border-image` сначала задавать прозрачную обычную границу.
8. Для всех absolute-псевдоэлементов задавать позиционированного владельца.
9. Уважать `prefers-reduced-motion`.
10. Для переноса в другой домен лучше скачать ассеты и сохранить те же относительные пути.

## 8. Полный каталог production URL

### Материалы, фоны и рамки (19)

- `wallpaper/arena-parchment.jpg` — <https://arena.hs-manacost.ru/wallpaper/arena-parchment.jpg>
- `wallpaper/arena-rail-red.jpg` — <https://arena.hs-manacost.ru/wallpaper/arena-rail-red.jpg>
- `wallpaper/battlegrounds-bartender-header.webp` — <https://arena.hs-manacost.ru/wallpaper/battlegrounds-bartender-header.webp>
- `wallpaper/blog-header-bg.jpg` — <https://arena.hs-manacost.ru/wallpaper/blog-header-bg.jpg>
- `wallpaper/body-content-bg.jpg` — <https://arena.hs-manacost.ru/wallpaper/body-content-bg.jpg>
- `wallpaper/deck-border.png` — <https://arena.hs-manacost.ru/wallpaper/deck-border.png>
- `wallpaper/footer-bg.jpg` — <https://arena.hs-manacost.ru/wallpaper/footer-bg.jpg>
- `wallpaper/footer-bg.webp` — <https://arena.hs-manacost.ru/wallpaper/footer-bg.webp>
- `wallpaper/home-paladin-hero.webp` — <https://arena.hs-manacost.ru/wallpaper/home-paladin-hero.webp>
- `wallpaper/main-page-header.svg` — <https://arena.hs-manacost.ru/wallpaper/main-page-header.svg>
- `wallpaper/main-page-rail-border.png` — <https://arena.hs-manacost.ru/wallpaper/main-page-rail-border.png>
- `wallpaper/nav-bg.png` — <https://arena.hs-manacost.ru/wallpaper/nav-bg.png>
- `wallpaper/nav-right-under-arrow.png` — <https://arena.hs-manacost.ru/wallpaper/nav-right-under-arrow.png>
- `wallpaper/nav-right-under.png` — <https://arena.hs-manacost.ru/wallpaper/nav-right-under.png>
- `wallpaper/profile-hero-hth.jpg` — <https://arena.hs-manacost.ru/wallpaper/profile-hero-hth.jpg>
- `wallpaper/profile-hero-hth.webp` — <https://arena.hs-manacost.ru/wallpaper/profile-hero-hth.webp>
- `wallpaper/wallpaper.jpg` — <https://arena.hs-manacost.ru/wallpaper/wallpaper.jpg>
- `wallpaper/wallpaper.webp` — <https://arena.hs-manacost.ru/wallpaper/wallpaper.webp>
- `wallpaper/wiki-battlegrounds-skin.webp` — <https://arena.hs-manacost.ru/wallpaper/wiki-battlegrounds-skin.webp>

### Шрифты (7)

- `fonts/2318-font.otf` — <https://arena.hs-manacost.ru/fonts/2318-font.otf>
- `fonts/google/cinzel-latin-500.woff2` — <https://arena.hs-manacost.ru/fonts/google/cinzel-latin-500.woff2>
- `fonts/google/cinzel-latin-ext-500.woff2` — <https://arena.hs-manacost.ru/fonts/google/cinzel-latin-ext-500.woff2>
- `fonts/google/inter-cyrillic-ext.woff2` — <https://arena.hs-manacost.ru/fonts/google/inter-cyrillic-ext.woff2>
- `fonts/google/inter-cyrillic.woff2` — <https://arena.hs-manacost.ru/fonts/google/inter-cyrillic.woff2>
- `fonts/google/inter-latin-ext.woff2` — <https://arena.hs-manacost.ru/fonts/google/inter-latin-ext.woff2>
- `fonts/google/inter-latin.woff2` — <https://arena.hs-manacost.ru/fonts/google/inter-latin.woff2>

### Общие игровые и брендовые ассеты (8)

- `assets/arena_icon.webp` — <https://arena.hs-manacost.ru/assets/arena_icon.webp>
- `assets/common.png` — <https://arena.hs-manacost.ru/assets/common.png>
- `assets/epic.png` — <https://arena.hs-manacost.ru/assets/epic.png>
- `assets/legendary.png` — <https://arena.hs-manacost.ru/assets/legendary.png>
- `assets/mana.png` — <https://arena.hs-manacost.ru/assets/mana.png>
- `assets/manacost-avatar.jpeg` — <https://arena.hs-manacost.ru/assets/manacost-avatar.jpeg>
- `assets/og-preview.png` — <https://arena.hs-manacost.ru/assets/og-preview.png>
- `assets/rare.png` — <https://arena.hs-manacost.ru/assets/rare.png>

### Промо и навигационные изображения (12)

- `main_assets/boosty-feed-banner-mobile.avif` — <https://arena.hs-manacost.ru/main_assets/boosty-feed-banner-mobile.avif>
- `main_assets/boosty-feed-banner-mobile.jpg` — <https://arena.hs-manacost.ru/main_assets/boosty-feed-banner-mobile.jpg>
- `main_assets/boosty-feed-banner-mobile.webp` — <https://arena.hs-manacost.ru/main_assets/boosty-feed-banner-mobile.webp>
- `main_assets/legendary_group.png` — <https://arena.hs-manacost.ru/main_assets/legendary_group.png>
- `main_assets/manacost-arena-boosty-banner-mobile.avif` — <https://arena.hs-manacost.ru/main_assets/manacost-arena-boosty-banner-mobile.avif>
- `main_assets/manacost-arena-boosty-banner-mobile.jpg` — <https://arena.hs-manacost.ru/main_assets/manacost-arena-boosty-banner-mobile.jpg>
- `main_assets/manacost-arena-boosty-banner-mobile.webp` — <https://arena.hs-manacost.ru/main_assets/manacost-arena-boosty-banner-mobile.webp>
- `main_assets/manacost-arena-boosty-banner.avif` — <https://arena.hs-manacost.ru/main_assets/manacost-arena-boosty-banner.avif>
- `main_assets/manacost-arena-boosty-banner.jpg` — <https://arena.hs-manacost.ru/main_assets/manacost-arena-boosty-banner.jpg>
- `main_assets/manacost-arena-boosty-banner.webp` — <https://arena.hs-manacost.ru/main_assets/manacost-arena-boosty-banner.webp>
- `main_assets/tier-list.png` — <https://arena.hs-manacost.ru/main_assets/tier-list.png>
- `main_assets/winrate-classes.png` — <https://arena.hs-manacost.ru/main_assets/winrate-classes.png>

### Иконки классов (24)

- `class_icon/all1.png` — <https://arena.hs-manacost.ru/class_icon/all1.png>
- `class_icon/deathknight.png` — <https://arena.hs-manacost.ru/class_icon/deathknight.png>
- `class_icon/demonhunter.png` — <https://arena.hs-manacost.ru/class_icon/demonhunter.png>
- `class_icon/druid.png` — <https://arena.hs-manacost.ru/class_icon/druid.png>
- `class_icon/hunter.png` — <https://arena.hs-manacost.ru/class_icon/hunter.png>
- `class_icon/mage.png` — <https://arena.hs-manacost.ru/class_icon/mage.png>
- `class_icon/neutral.webp` — <https://arena.hs-manacost.ru/class_icon/neutral.webp>
- `class_icon/paladin.png` — <https://arena.hs-manacost.ru/class_icon/paladin.png>
- `class_icon/priest.png` — <https://arena.hs-manacost.ru/class_icon/priest.png>
- `class_icon/rogue.png` — <https://arena.hs-manacost.ru/class_icon/rogue.png>
- `class_icon/shaman.png` — <https://arena.hs-manacost.ru/class_icon/shaman.png>
- `class_icon/ui/deathknight-64.webp` — <https://arena.hs-manacost.ru/class_icon/ui/deathknight-64.webp>
- `class_icon/ui/demonhunter-64.webp` — <https://arena.hs-manacost.ru/class_icon/ui/demonhunter-64.webp>
- `class_icon/ui/druid-64.webp` — <https://arena.hs-manacost.ru/class_icon/ui/druid-64.webp>
- `class_icon/ui/hunter-64.webp` — <https://arena.hs-manacost.ru/class_icon/ui/hunter-64.webp>
- `class_icon/ui/mage-64.webp` — <https://arena.hs-manacost.ru/class_icon/ui/mage-64.webp>
- `class_icon/ui/paladin-64.webp` — <https://arena.hs-manacost.ru/class_icon/ui/paladin-64.webp>
- `class_icon/ui/priest-64.webp` — <https://arena.hs-manacost.ru/class_icon/ui/priest-64.webp>
- `class_icon/ui/rogue-64.webp` — <https://arena.hs-manacost.ru/class_icon/ui/rogue-64.webp>
- `class_icon/ui/shaman-64.webp` — <https://arena.hs-manacost.ru/class_icon/ui/shaman-64.webp>
- `class_icon/ui/warlock-64.webp` — <https://arena.hs-manacost.ru/class_icon/ui/warlock-64.webp>
- `class_icon/ui/warrior-64.webp` — <https://arena.hs-manacost.ru/class_icon/ui/warrior-64.webp>
- `class_icon/warlock.png` — <https://arena.hs-manacost.ru/class_icon/warlock.png>
- `class_icon/warrior.png` — <https://arena.hs-manacost.ru/class_icon/warrior.png>

### Логотипы источников данных (3)

- `source-logos/firestone.png` — <https://arena.hs-manacost.ru/source-logos/firestone.png>
- `source-logos/heartharena.webp` — <https://arena.hs-manacost.ru/source-logos/heartharena.webp>
- `source-logos/hsreplay.png` — <https://arena.hs-manacost.ru/source-logos/hsreplay.png>

### Иконки связанных сайтов (2)

- `site-icons/hs-manacost.png` — <https://arena.hs-manacost.ru/site-icons/hs-manacost.png>
- `site-icons/koloda.ico` — <https://arena.hs-manacost.ru/site-icons/koloda.ico>

### Сообщество и рекламные изображения (5)

- `ad/boosty.png` — <https://arena.hs-manacost.ru/ad/boosty.png>
- `ad/donate-qr.png` — <https://arena.hs-manacost.ru/ad/donate-qr.png>
- `ad/telegram.png` — <https://arena.hs-manacost.ru/ad/telegram.png>
- `ad/wallpaper_info.jpg` — <https://arena.hs-manacost.ru/ad/wallpaper_info.jpg>
- `ad/wallpaper_info.webp` — <https://arena.hs-manacost.ru/ad/wallpaper_info.webp>

### Поля Сражений: уровни таверны и типы существ (22)

- `bg-legacy/assset/tier1.png` — <https://arena.hs-manacost.ru/bg-legacy/assset/tier1.png>
- `bg-legacy/assset/tier2.png` — <https://arena.hs-manacost.ru/bg-legacy/assset/tier2.png>
- `bg-legacy/assset/tier3.png` — <https://arena.hs-manacost.ru/bg-legacy/assset/tier3.png>
- `bg-legacy/assset/tier4.png` — <https://arena.hs-manacost.ru/bg-legacy/assset/tier4.png>
- `bg-legacy/assset/tier5.png` — <https://arena.hs-manacost.ru/bg-legacy/assset/tier5.png>
- `bg-legacy/assset/tier6.png` — <https://arena.hs-manacost.ru/bg-legacy/assset/tier6.png>
- `bg-legacy/assset/tier7.png` — <https://arena.hs-manacost.ru/bg-legacy/assset/tier7.png>
- `bg-legacy/assset/демоны.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D0%B4%D0%B5%D0%BC%D0%BE%D0%BD%D1%8B.webp>
- `bg-legacy/assset/драконы.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D0%B4%D1%80%D0%B0%D0%BA%D0%BE%D0%BD%D1%8B.webp>
- `bg-legacy/assset/дуо.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D0%B4%D1%83%D0%BE.webp>
- `bg-legacy/assset/зверь.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D0%B7%D0%B2%D0%B5%D1%80%D1%8C.webp>
- `bg-legacy/assset/механизмы.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D0%BC%D0%B5%D1%85%D0%B0%D0%BD%D0%B8%D0%B7%D0%BC%D1%8B.webp>
- `bg-legacy/assset/мурлоки.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D0%BC%D1%83%D1%80%D0%BB%D0%BE%D0%BA%D0%B8.webp>
- `bg-legacy/assset/наги.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D0%BD%D0%B0%D0%B3%D0%B8.webp>
- `bg-legacy/assset/нежить.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D0%BD%D0%B5%D0%B6%D0%B8%D1%82%D1%8C.webp>
- `bg-legacy/assset/общее.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D0%BE%D0%B1%D1%89%D0%B5%D0%B5.webp>
- `bg-legacy/assset/пираты.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D0%BF%D0%B8%D1%80%D0%B0%D1%82%D1%8B.webp>
- `bg-legacy/assset/свинобразы.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D1%81%D0%B2%D0%B8%D0%BD%D0%BE%D0%B1%D1%80%D0%B0%D0%B7%D1%8B.webp>
- `bg-legacy/assset/хронум1.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D1%85%D1%80%D0%BE%D0%BD%D1%83%D0%BC1.webp>
- `bg-legacy/assset/хронум2.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D1%85%D1%80%D0%BE%D0%BD%D1%83%D0%BC2.webp>
- `bg-legacy/assset/хронум3.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D1%85%D1%80%D0%BE%D0%BD%D1%83%D0%BC3.webp>
- `bg-legacy/assset/элементали.webp` — <https://arena.hs-manacost.ru/bg-legacy/assset/%D1%8D%D0%BB%D0%B5%D0%BC%D0%B5%D0%BD%D1%82%D0%B0%D0%BB%D0%B8.webp>

### Поля Сражений: портреты героев (114)

<details>
<summary>Показать полный список</summary>

- `bg-legacy/heroes_bg/A. F. Kay.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/A.%20F.%20Kay.png>
- `bg-legacy/heroes_bg/Al'Akir.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Al'Akir.png>
- `bg-legacy/heroes_bg/Alexstrasza.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Alexstrasza.png>
- `bg-legacy/heroes_bg/Ambassador Faelin.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Ambassador%20Faelin.png>
- `bg-legacy/heroes_bg/Aranna Starseeker.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Aranna%20Starseeker.png>
- `bg-legacy/heroes_bg/Arch-Villain Rafaam.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Arch-Villain%20Rafaam.png>
- `bg-legacy/heroes_bg/Artanis.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Artanis.png>
- `bg-legacy/heroes_bg/Bru'kan.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Bru'kan.png>
- `bg-legacy/heroes_bg/Buttons.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Buttons.png>
- `bg-legacy/heroes_bg/C'Thun.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/C'Thun.png>
- `bg-legacy/heroes_bg/Cap'n Hoggarr.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Cap'n%20Hoggarr.png>
- `bg-legacy/heroes_bg/Captain Eudora.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Captain%20Eudora.png>
- `bg-legacy/heroes_bg/Captain Hooktusk.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Captain%20Hooktusk.png>
- `bg-legacy/heroes_bg/Cariel Roame.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Cariel%20Roame.png>
- `bg-legacy/heroes_bg/Chenvaala.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Chenvaala.png>
- `bg-legacy/heroes_bg/Cookie the Cook.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Cookie%20the%20Cook.png>
- `bg-legacy/heroes_bg/Dancin' Deryl.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Dancin'%20Deryl.png>
- `bg-legacy/heroes_bg/Death Speaker Blackthorn.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Death%20Speaker%20Blackthorn.png>
- `bg-legacy/heroes_bg/Deathwing.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Deathwing.png>
- `bg-legacy/heroes_bg/Dinotamer Brann.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Dinotamer%20Brann.png>
- `bg-legacy/heroes_bg/Doctor Holli'dae.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Doctor%20Holli'dae.png>
- `bg-legacy/heroes_bg/Drek'Thar.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Drek'Thar.png>
- `bg-legacy/heroes_bg/E.T.C., Band Manager.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/E.T.C.%2C%20Band%20Manager.png>
- `bg-legacy/heroes_bg/Edwin VanCleef.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Edwin%20VanCleef.png>
- `bg-legacy/heroes_bg/Elise Starseeker.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Elise%20Starseeker.png>
- `bg-legacy/heroes_bg/Enhance-o Mechano.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Enhance-o%20Mechano.png>
- `bg-legacy/heroes_bg/Exarch Othaar.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Exarch%20Othaar.png>
- `bg-legacy/heroes_bg/Farseer Nobundo.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Farseer%20Nobundo.png>
- `bg-legacy/heroes_bg/Forest Lord Cenarius.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Forest%20Lord%20Cenarius.png>
- `bg-legacy/heroes_bg/Forest Warden Omu.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Forest%20Warden%20Omu.png>
- `bg-legacy/heroes_bg/Fungalmancer Flurgl.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Fungalmancer%20Flurgl.png>
- `bg-legacy/heroes_bg/Galakrond.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Galakrond.png>
- `bg-legacy/heroes_bg/Galewing.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Galewing.png>
- `bg-legacy/heroes_bg/Genn, Worgen King.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Genn%2C%20Worgen%20King.png>
- `bg-legacy/heroes_bg/George the Fallen.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/George%20the%20Fallen.png>
- `bg-legacy/heroes_bg/Greybough.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Greybough.png>
- `bg-legacy/heroes_bg/Guff Runetotem.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Guff%20Runetotem.png>
- `bg-legacy/heroes_bg/Heistbaron Togwaggle.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Heistbaron%20Togwaggle.png>
- `bg-legacy/heroes_bg/Illidan Stormrage.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Illidan%20Stormrage.png>
- `bg-legacy/heroes_bg/Infinite Toki.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Infinite%20Toki.png>
- `bg-legacy/heroes_bg/Inge, the Iron Hymn.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Inge%2C%20the%20Iron%20Hymn.png>
- `bg-legacy/heroes_bg/Ini Stormcoil.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Ini%20Stormcoil.png>
- `bg-legacy/heroes_bg/Jandice Barov.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Jandice%20Barov.png>
- `bg-legacy/heroes_bg/Jim Raynor.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Jim%20Raynor.png>
- `bg-legacy/heroes_bg/Kael'thas Sunstrider.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Kael'thas%20Sunstrider.png>
- `bg-legacy/heroes_bg/Kerrigan, Queen of Blades.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Kerrigan%2C%20Queen%20of%20Blades.png>
- `bg-legacy/heroes_bg/King Mukla.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/King%20Mukla.png>
- `bg-legacy/heroes_bg/Kurtrus Ashfallen.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Kurtrus%20Ashfallen.png>
- `bg-legacy/heroes_bg/Lady Vashj.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Lady%20Vashj.png>
- `bg-legacy/heroes_bg/Lich Baz'hial.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Lich%20Baz'hial.png>
- `bg-legacy/heroes_bg/Loh, the Living Legend.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Loh%2C%20the%20Living%20Legend.png>
- `bg-legacy/heroes_bg/Lord Barov.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Lord%20Barov.png>
- `bg-legacy/heroes_bg/Lord Jaraxxus.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Lord%20Jaraxxus.png>
- `bg-legacy/heroes_bg/Maiev Shadowsong.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Maiev%20Shadowsong.png>
- `bg-legacy/heroes_bg/Malygos.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Malygos.png>
- `bg-legacy/heroes_bg/Marin the Manager.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Marin%20the%20Manager.png>
- `bg-legacy/heroes_bg/Master Nguyen.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Master%20Nguyen.png>
- `bg-legacy/heroes_bg/Millhouse Manastorm.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Millhouse%20Manastorm.png>
- `bg-legacy/heroes_bg/Millificent Manastorm.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Millificent%20Manastorm.png>
- `bg-legacy/heroes_bg/Mister Clocksworth.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Mister%20Clocksworth.png>
- `bg-legacy/heroes_bg/Morchie.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Morchie.png>
- `bg-legacy/heroes_bg/Mr. Bigglesworth.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Mr.%20Bigglesworth.png>
- `bg-legacy/heroes_bg/Murloc Holmes.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Murloc%20Holmes.png>
- `bg-legacy/heroes_bg/Murozond, Unbounded.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Murozond%2C%20Unbounded.png>
- `bg-legacy/heroes_bg/Mutanus the Devourer.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Mutanus%20the%20Devourer.png>
- `bg-legacy/heroes_bg/N'Zoth.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/N'Zoth.png>
- `bg-legacy/heroes_bg/Nozdormu.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Nozdormu.png>
- `bg-legacy/heroes_bg/Onyxia.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Onyxia.png>
- `bg-legacy/heroes_bg/Overlord Saurfang.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Overlord%20Saurfang.png>
- `bg-legacy/heroes_bg/Ozumat.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Ozumat.png>
- `bg-legacy/heroes_bg/Patches the Pirate.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Patches%20the%20Pirate.png>
- `bg-legacy/heroes_bg/Patchwerk.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Patchwerk.png>
- `bg-legacy/heroes_bg/Professor Putricide.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Professor%20Putricide.png>
- `bg-legacy/heroes_bg/Pyramad.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Pyramad.png>
- `bg-legacy/heroes_bg/Queen Azshara.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Queen%20Azshara.png>
- `bg-legacy/heroes_bg/Queen Wagtoggle.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Queen%20Wagtoggle.png>
- `bg-legacy/heroes_bg/Ragnaros the Firelord.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Ragnaros%20the%20Firelord.png>
- `bg-legacy/heroes_bg/Rakanishu.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Rakanishu.png>
- `bg-legacy/heroes_bg/Reno Jackson.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Reno%20Jackson.png>
- `bg-legacy/heroes_bg/Rock Master Voone.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Rock%20Master%20Voone.png>
- `bg-legacy/heroes_bg/Rokara.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Rokara.png>
- `bg-legacy/heroes_bg/Scabbs Cutterbutter.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Scabbs%20Cutterbutter.png>
- `bg-legacy/heroes_bg/Shudderwock.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Shudderwock.png>
- `bg-legacy/heroes_bg/Silas Darkmoon.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Silas%20Darkmoon.png>
- `bg-legacy/heroes_bg/Sindragosa.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Sindragosa.png>
- `bg-legacy/heroes_bg/Sir Finley Mrrgglton.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Sir%20Finley%20Mrrgglton.png>
- `bg-legacy/heroes_bg/Sire Denathrius.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Sire%20Denathrius.png>
- `bg-legacy/heroes_bg/Skycap'n Kragg.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Skycap'n%20Kragg.png>
- `bg-legacy/heroes_bg/Snake eyes.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Snake%20eyes.png>
- `bg-legacy/heroes_bg/Sneed.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Sneed.png>
- `bg-legacy/heroes_bg/Sylvanas Windrunner.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Sylvanas%20Windrunner.png>
- `bg-legacy/heroes_bg/Tae'thelan Bloodwatcher.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Tae'thelan%20Bloodwatcher.png>
- `bg-legacy/heroes_bg/Tamsin Roame.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Tamsin%20Roame.png>
- `bg-legacy/heroes_bg/Tavish Stormpike.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Tavish%20Stormpike.png>
- `bg-legacy/heroes_bg/Teron Gorefiend.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Teron%20Gorefiend.png>
- `bg-legacy/heroes_bg/Tess Greymane.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Tess%20Greymane.png>
- `bg-legacy/heroes_bg/The Curator.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/The%20Curator.png>
- `bg-legacy/heroes_bg/The Great Akazamzarak.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/The%20Great%20Akazamzarak.png>
- `bg-legacy/heroes_bg/The Jailer.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/The%20Jailer.png>
- `bg-legacy/heroes_bg/The Lich King.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/The%20Lich%20King.png>
- `bg-legacy/heroes_bg/The Rat King.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/The%20Rat%20King.png>
- `bg-legacy/heroes_bg/Thorim, Stormlord.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Thorim%2C%20Stormlord.png>
- `bg-legacy/heroes_bg/Tickatus.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Tickatus.png>
- `bg-legacy/heroes_bg/Time Twister Chromie.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Time%20Twister%20Chromie.png>
- `bg-legacy/heroes_bg/Trade Prince Gallywix.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Trade%20Prince%20Gallywix.png>
- `bg-legacy/heroes_bg/Vanndar Stormpike.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Vanndar%20Stormpike.png>
- `bg-legacy/heroes_bg/Varden Dawngrasp.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Varden%20Dawngrasp.png>
- `bg-legacy/heroes_bg/Vol'jin.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Vol'jin.png>
- `bg-legacy/heroes_bg/Xyrella.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Xyrella.png>
- `bg-legacy/heroes_bg/Y'Shaarj.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Y'Shaarj.png>
- `bg-legacy/heroes_bg/Yogg-Saron, Hope's End.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Yogg-Saron%2C%20Hope's%20End.png>
- `bg-legacy/heroes_bg/Ysera.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Ysera.png>
- `bg-legacy/heroes_bg/Zephrys, the Great.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Zephrys%2C%20the%20Great.png>
- `bg-legacy/heroes_bg/Zerek, Master Cloner.png` — <https://arena.hs-manacost.ru/bg-legacy/heroes_bg/Zerek%2C%20Master%20Cloner.png>

</details>

### Поля Сражений: большие аксессуары (38)

<details>
<summary>Показать полный список</summary>

- `bg-legacy/Аксессуары/Большие аксессуары/Амулет-клык.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%90%D0%BC%D1%83%D0%BB%D0%B5%D1%82-%D0%BA%D0%BB%D1%8B%D0%BA.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Боевой свисток.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%B5%D0%B2%D0%BE%D0%B9%20%D1%81%D0%B2%D0%B8%D1%81%D1%82%D0%BE%D0%BA.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Бочонок с порохом.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D1%87%D0%BE%D0%BD%D0%BE%D0%BA%20%D1%81%20%D0%BF%D0%BE%D1%80%D0%BE%D1%85%D0%BE%D0%BC.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Вспыхнувшие угли.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%92%D1%81%D0%BF%D1%8B%D1%85%D0%BD%D1%83%D0%B2%D1%88%D0%B8%D0%B5%20%D1%83%D0%B3%D0%BB%D0%B8.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Заколдованная лента.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%97%D0%B0%D0%BA%D0%BE%D0%BB%D0%B4%D0%BE%D0%B2%D0%B0%D0%BD%D0%BD%D0%B0%D1%8F%20%D0%BB%D0%B5%D0%BD%D1%82%D0%B0.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Запас сфер мудрости.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%97%D0%B0%D0%BF%D0%B0%D1%81%20%D1%81%D1%84%D0%B5%D1%80%20%D0%BC%D1%83%D0%B4%D1%80%D0%BE%D1%81%D1%82%D0%B8.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Записыващая печатная машинка.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%97%D0%B0%D0%BF%D0%B8%D1%81%D1%8B%D0%B2%D0%B0%D1%89%D0%B0%D1%8F%20%D0%BF%D0%B5%D1%87%D0%B0%D1%82%D0%BD%D0%B0%D1%8F%20%D0%BC%D0%B0%D1%88%D0%B8%D0%BD%D0%BA%D0%B0.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Защитная заплатка.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%97%D0%B0%D1%89%D0%B8%D1%82%D0%BD%D0%B0%D1%8F%20%D0%B7%D0%B0%D0%BF%D0%BB%D0%B0%D1%82%D0%BA%D0%B0.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Защитное кольцо.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%97%D0%B0%D1%89%D0%B8%D1%82%D0%BD%D0%BE%D0%B5%20%D0%BA%D0%BE%D0%BB%D1%8C%D1%86%D0%BE.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Калейдоскоп.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9A%D0%B0%D0%BB%D0%B5%D0%B9%D0%B4%D0%BE%D1%81%D0%BA%D0%BE%D0%BF.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Карманный смерч.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9A%D0%B0%D1%80%D0%BC%D0%B0%D0%BD%D0%BD%D1%8B%D0%B9%20%D1%81%D0%BC%D0%B5%D1%80%D1%87.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Коралловое копье.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9A%D0%BE%D1%80%D0%B0%D0%BB%D0%BB%D0%BE%D0%B2%D0%BE%D0%B5%20%D0%BA%D0%BE%D0%BF%D1%8C%D0%B5.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Кровавый амулет.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9A%D1%80%D0%BE%D0%B2%D0%B0%D0%B2%D1%8B%D0%B9%20%D0%B0%D0%BC%D1%83%D0%BB%D0%B5%D1%82.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Медная катушка.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B5%D0%B4%D0%BD%D0%B0%D1%8F%20%D0%BA%D0%B0%D1%82%D1%83%D1%88%D0%BA%D0%B0.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Миниатюрный корабль.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B8%D0%BD%D0%B8%D0%B0%D1%82%D1%8E%D1%80%D0%BD%D1%8B%D0%B9%20%D0%BA%D0%BE%D1%80%D0%B0%D0%B1%D0%BB%D1%8C.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Надежный лом.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9D%D0%B0%D0%B4%D0%B5%D0%B6%D0%BD%D1%8B%D0%B9%20%D0%BB%D0%BE%D0%BC.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Наклейка с Мурчалем.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9D%D0%B0%D0%BA%D0%BB%D0%B5%D0%B9%D0%BA%D0%B0%20%D1%81%20%D0%9C%D1%83%D1%80%D1%87%D0%B0%D0%BB%D0%B5%D0%BC.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Наклейка с Тюремщиком.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9D%D0%B0%D0%BA%D0%BB%D0%B5%D0%B9%D0%BA%D0%B0%20%D1%81%20%D0%A2%D1%8E%D1%80%D0%B5%D0%BC%D1%89%D0%B8%D0%BA%D0%BE%D0%BC.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Наклейка с Юным Мрачноглазом.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9D%D0%B0%D0%BA%D0%BB%D0%B5%D0%B9%D0%BA%D0%B0%20%D1%81%20%D0%AE%D0%BD%D1%8B%D0%BC%20%D0%9C%D1%80%D0%B0%D1%87%D0%BD%D0%BE%D0%B3%D0%BB%D0%B0%D0%B7%D0%BE%D0%BC.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Наклейка с лавиной.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9D%D0%B0%D0%BA%D0%BB%D0%B5%D0%B9%D0%BA%D0%B0%20%D1%81%20%D0%BB%D0%B0%D0%B2%D0%B8%D0%BD%D0%BE%D0%B9.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Наклейка с ур'зулом.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9D%D0%B0%D0%BA%D0%BB%D0%B5%D0%B9%D0%BA%D0%B0%20%D1%81%20%D1%83%D1%80'%D0%B7%D1%83%D0%BB%D0%BE%D0%BC.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Наклейка с чарожабром.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9D%D0%B0%D0%BA%D0%BB%D0%B5%D0%B9%D0%BA%D0%B0%20%D1%81%20%D1%87%D0%B0%D1%80%D0%BE%D0%B6%D0%B0%D0%B1%D1%80%D0%BE%D0%BC.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Обожженный Скверной журнал.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9E%D0%B1%D0%BE%D0%B6%D0%B6%D0%B5%D0%BD%D0%BD%D1%8B%D0%B9%20%D0%A1%D0%BA%D0%B2%D0%B5%D1%80%D0%BD%D0%BE%D0%B9%20%D0%B6%D1%83%D1%80%D0%BD%D0%B0%D0%BB.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Оскверненный том.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9E%D1%81%D0%BA%D0%B2%D0%B5%D1%80%D0%BD%D0%B5%D0%BD%D0%BD%D1%8B%D0%B9%20%D1%82%D0%BE%D0%BC.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Пламенный портрет.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BB%D0%B0%D0%BC%D0%B5%D0%BD%D0%BD%D1%8B%D0%B9%20%D0%BF%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Портрет битбоксера.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D0%B1%D0%B8%D1%82%D0%B1%D0%BE%D0%BA%D1%81%D0%B5%D1%80%D0%B0.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Портрет звезды радио.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D0%B7%D0%B2%D0%B5%D0%B7%D0%B4%D1%8B%20%D1%80%D0%B0%D0%B4%D0%B8%D0%BE.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Портрет землекрушительницы.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D0%B7%D0%B5%D0%BC%D0%BB%D0%B5%D0%BA%D1%80%D1%83%D1%88%D0%B8%D1%82%D0%B5%D0%BB%D1%8C%D0%BD%D0%B8%D1%86%D1%8B.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Портрет корсара.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D0%BA%D0%BE%D1%80%D1%81%D0%B0%D1%80%D0%B0.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Портрет метателя.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D0%BC%D0%B5%D1%82%D0%B0%D1%82%D0%B5%D0%BB%D1%8F.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Портрет осквернителя.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D0%BE%D1%81%D0%BA%D0%B2%D0%B5%D1%80%D0%BD%D0%B8%D1%82%D0%B5%D0%BB%D1%8F.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Портрет созвучатора.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D1%81%D0%BE%D0%B7%D0%B2%D1%83%D1%87%D0%B0%D1%82%D0%BE%D1%80%D0%B0.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Портрет яйца Конца Времен.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D1%8F%D0%B9%D1%86%D0%B0%20%D0%9A%D0%BE%D0%BD%D1%86%D0%B0%20%D0%92%D1%80%D0%B5%D0%BC%D0%B5%D0%BD.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Рог облачного змея.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%A0%D0%BE%D0%B3%20%D0%BE%D0%B1%D0%BB%D0%B0%D1%87%D0%BD%D0%BE%D0%B3%D0%BE%20%D0%B7%D0%BC%D0%B5%D1%8F.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Хроматический разлом.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%A5%D1%80%D0%BE%D0%BC%D0%B0%D1%82%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B8%D0%B9%20%D1%80%D0%B0%D0%B7%D0%BB%D0%BE%D0%BC.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Шипастый наплеч.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%A8%D0%B8%D0%BF%D0%B0%D1%81%D1%82%D1%8B%D0%B9%20%D0%BD%D0%B0%D0%BF%D0%BB%D0%B5%D1%87.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Щетка из диких перьев.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%A9%D0%B5%D1%82%D0%BA%D0%B0%20%D0%B8%D0%B7%20%D0%B4%D0%B8%D0%BA%D0%B8%D1%85%20%D0%BF%D0%B5%D1%80%D1%8C%D0%B5%D0%B2.webp>
- `bg-legacy/Аксессуары/Большие аксессуары/Электрический магнит.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%91%D0%BE%D0%BB%D1%8C%D1%88%D0%B8%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%AD%D0%BB%D0%B5%D0%BA%D1%82%D1%80%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B8%D0%B9%20%D0%BC%D0%B0%D0%B3%D0%BD%D0%B8%D1%82.webp>

</details>

### Поля Сражений: малые аксессуары (32)

<details>
<summary>Показать полный список</summary>

- `bg-legacy/Аксессуары/Малые аксессуары/Водяное колесо.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%92%D0%BE%D0%B4%D1%8F%D0%BD%D0%BE%D0%B5%20%D0%BA%D0%BE%D0%BB%D0%B5%D1%81%D0%BE.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Демонический гобелен.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%94%D0%B5%D0%BC%D0%BE%D0%BD%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B8%D0%B9%20%D0%B3%D0%BE%D0%B1%D0%B5%D0%BB%D0%B5%D0%BD.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Древняя косточка.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%94%D1%80%D0%B5%D0%B2%D0%BD%D1%8F%D1%8F%20%D0%BA%D0%BE%D1%81%D1%82%D0%BE%D1%87%D0%BA%D0%B0.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Записыващая печатная машинка.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%97%D0%B0%D0%BF%D0%B8%D1%81%D1%8B%D0%B2%D0%B0%D1%89%D0%B0%D1%8F%20%D0%BF%D0%B5%D1%87%D0%B0%D1%82%D0%BD%D0%B0%D1%8F%20%D0%BC%D0%B0%D1%88%D0%B8%D0%BD%D0%BA%D0%B0.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Затонувший якорь.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%97%D0%B0%D1%82%D0%BE%D0%BD%D1%83%D0%B2%D1%88%D0%B8%D0%B9%20%D1%8F%D0%BA%D0%BE%D1%80%D1%8C.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Змеиный посох.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%97%D0%BC%D0%B5%D0%B8%D0%BD%D1%8B%D0%B9%20%D0%BF%D0%BE%D1%81%D0%BE%D1%85.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Калейдоскоп.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9A%D0%B0%D0%BB%D0%B5%D0%B9%D0%B4%D0%BE%D1%81%D0%BA%D0%BE%D0%BF.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Карманный смерч.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9A%D0%B0%D1%80%D0%BC%D0%B0%D0%BD%D0%BD%D1%8B%D0%B9%20%D1%81%D0%BC%D0%B5%D1%80%D1%87.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Корона из пузырька.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9A%D0%BE%D1%80%D0%BE%D0%BD%D0%B0%20%D0%B8%D0%B7%20%D0%BF%D1%83%D0%B7%D1%8B%D1%80%D1%8C%D0%BA%D0%B0.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Медная катушка.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B5%D0%B4%D0%BD%D0%B0%D1%8F%20%D0%BA%D0%B0%D1%82%D1%83%D1%88%D0%BA%D0%B0.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Молния в бутылке.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%BE%D0%BB%D0%BD%D0%B8%D1%8F%20%D0%B2%20%D0%B1%D1%83%D1%82%D1%8B%D0%BB%D0%BA%D0%B5.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Наклейка с Тюремщиком.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9D%D0%B0%D0%BA%D0%BB%D0%B5%D0%B9%D0%BA%D0%B0%20%D1%81%20%D0%A2%D1%8E%D1%80%D0%B5%D0%BC%D1%89%D0%B8%D0%BA%D0%BE%D0%BC.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Наклейка с Штормоверть.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9D%D0%B0%D0%BA%D0%BB%D0%B5%D0%B9%D0%BA%D0%B0%20%D1%81%20%D0%A8%D1%82%D0%BE%D1%80%D0%BC%D0%BE%D0%B2%D0%B5%D1%80%D1%82%D1%8C.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Наклейка с Эррглом.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9D%D0%B0%D0%BA%D0%BB%D0%B5%D0%B9%D0%BA%D0%B0%20%D1%81%20%D0%AD%D1%80%D1%80%D0%B3%D0%BB%D0%BE%D0%BC.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Наклейка с мамашей-медведицей.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9D%D0%B0%D0%BA%D0%BB%D0%B5%D0%B9%D0%BA%D0%B0%20%D1%81%20%D0%BC%D0%B0%D0%BC%D0%B0%D1%88%D0%B5%D0%B9-%D0%BC%D0%B5%D0%B4%D0%B2%D0%B5%D0%B4%D0%B8%D1%86%D0%B5%D0%B9.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Наклейка с металлоискателем.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9D%D0%B0%D0%BA%D0%BB%D0%B5%D0%B9%D0%BA%D0%B0%20%D1%81%20%D0%BC%D0%B5%D1%82%D0%B0%D0%BB%D0%BB%D0%BE%D0%B8%D1%81%D0%BA%D0%B0%D1%82%D0%B5%D0%BB%D0%B5%D0%BC.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Наклейка со старшим поваром.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9D%D0%B0%D0%BA%D0%BB%D0%B5%D0%B9%D0%BA%D0%B0%20%D1%81%D0%BE%20%D1%81%D1%82%D0%B0%D1%80%D1%88%D0%B8%D0%BC%20%D0%BF%D0%BE%D0%B2%D0%B0%D1%80%D0%BE%D0%BC.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Ожерелье из ракушек.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9E%D0%B6%D0%B5%D1%80%D0%B5%D0%BB%D1%8C%D0%B5%20%D0%B8%D0%B7%20%D1%80%D0%B0%D0%BA%D1%83%D1%88%D0%B5%D0%BA.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Портрет восстановителя обломков.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D0%B2%D0%BE%D1%81%D1%81%D1%82%D0%B0%D0%BD%D0%BE%D0%B2%D0%B8%D1%82%D0%B5%D0%BB%D1%8F%20%D0%BE%D0%B1%D0%BB%D0%BE%D0%BC%D0%BA%D0%BE%D0%B2.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Портрет осквернителя.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D0%BE%D1%81%D0%BA%D0%B2%D0%B5%D1%80%D0%BD%D0%B8%D1%82%D0%B5%D0%BB%D1%8F.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Портрет попрыгухи.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D0%BF%D0%BE%D0%BF%D1%80%D1%8B%D0%B3%D1%83%D1%85%D0%B8.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Портрет призывательницы прилива.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D0%BF%D1%80%D0%B8%D0%B7%D1%8B%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8C%D0%BD%D0%B8%D1%86%D1%8B%20%D0%BF%D1%80%D0%B8%D0%BB%D0%B8%D0%B2%D0%B0.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Портрет раковины.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D1%80%D0%B0%D0%BA%D0%BE%D0%B2%D0%B8%D0%BD%D1%8B.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Портрет скакуна.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D1%81%D0%BA%D0%B0%D0%BA%D1%83%D0%BD%D0%B0.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Портрет стегодона.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D1%81%D1%82%D0%B5%D0%B3%D0%BE%D0%B4%D0%BE%D0%BD%D0%B0.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Портрет яйца Конца Времен.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D0%BE%D1%80%D1%82%D1%80%D0%B5%D1%82%20%D1%8F%D0%B9%D1%86%D0%B0%20%D0%9A%D0%BE%D0%BD%D1%86%D0%B0%20%D0%92%D1%80%D0%B5%D0%BC%D0%B5%D0%BD.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Проклятый кристалл.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9F%D1%80%D0%BE%D0%BA%D0%BB%D1%8F%D1%82%D1%8B%D0%B9%20%D0%BA%D1%80%D0%B8%D1%81%D1%82%D0%B0%D0%BB%D0%BB.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Сфера неизвестности.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%A1%D1%84%D0%B5%D1%80%D0%B0%20%D0%BD%D0%B5%D0%B8%D0%B7%D0%B2%D0%B5%D1%81%D1%82%D0%BD%D0%BE%D1%81%D1%82%D0%B8.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Футляр для линз.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%A4%D1%83%D1%82%D0%BB%D1%8F%D1%80%20%D0%B4%D0%BB%D1%8F%20%D0%BB%D0%B8%D0%BD%D0%B7.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Хроматический разлом.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%A5%D1%80%D0%BE%D0%BC%D0%B0%D1%82%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B8%D0%B9%20%D1%80%D0%B0%D0%B7%D0%BB%D0%BE%D0%BC.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Цилиндр волшебника.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%A6%D0%B8%D0%BB%D0%B8%D0%BD%D0%B4%D1%80%20%D0%B2%D0%BE%D0%BB%D1%88%D0%B5%D0%B1%D0%BD%D0%B8%D0%BA%D0%B0.webp>
- `bg-legacy/Аксессуары/Малые аксессуары/Шкатулка для драгоценностей.webp` — <https://arena.hs-manacost.ru/bg-legacy/%D0%90%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%9C%D0%B0%D0%BB%D1%8B%D0%B5%20%D0%B0%D0%BA%D1%81%D0%B5%D1%81%D1%81%D1%83%D0%B0%D1%80%D1%8B/%D0%A8%D0%BA%D0%B0%D1%82%D1%83%D0%BB%D0%BA%D0%B0%20%D0%B4%D0%BB%D1%8F%20%D0%B4%D1%80%D0%B0%D0%B3%D0%BE%D1%86%D0%B5%D0%BD%D0%BD%D0%BE%D1%81%D1%82%D0%B5%D0%B9.webp>

</details>

### Поля Сражений: дополнительные фоны (5)

- `bg-legacy/wallpaper.jpg` — <https://arena.hs-manacost.ru/bg-legacy/wallpaper.jpg>
- `bg-legacy/wallpaper.webp` — <https://arena.hs-manacost.ru/bg-legacy/wallpaper.webp>
- `bg-legacy/wallpaper1.webp` — <https://arena.hs-manacost.ru/bg-legacy/wallpaper1.webp>
- `bg-legacy/wallpaper2.webp` — <https://arena.hs-manacost.ru/bg-legacy/wallpaper2.webp>
- `bg-legacy/wallpaper3.webp` — <https://arena.hs-manacost.ru/bg-legacy/wallpaper3.webp>

### Сгенерированные изображения (1)

- `generated/top_legendaries.png` — <https://arena.hs-manacost.ru/generated/top_legendaries.png>

### Корневые иконки сайта (7)

- `apple-touch-icon.png` — <https://arena.hs-manacost.ru/apple-touch-icon.png>
- `arena-logo-icon-256.webp` — <https://arena.hs-manacost.ru/arena-logo-icon-256.webp>
- `arena-logo-icon.webp` — <https://arena.hs-manacost.ru/arena-logo-icon.webp>
- `favicon-192.png` — <https://arena.hs-manacost.ru/favicon-192.png>
- `favicon.ico` — <https://arena.hs-manacost.ru/favicon.ico>
- `favicon.svg` — <https://arena.hs-manacost.ru/favicon.svg>
- `favicon_shield.png` — <https://arena.hs-manacost.ru/favicon_shield.png>
