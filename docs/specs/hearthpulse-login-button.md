# Кнопка «Войти через HearthPulse» (`hearthpulse-login-v1.js`)

Самодостаточный веб-компонент для сайтов и приложений, которые входят через
HearthPulse. Он не зависит от React и стилей сайта-потребителя и всегда
подписан доменом **hearthpulse.net**, чтобы пользователь видел, куда его ведут.

Эпик E20, срез S3. Сама кнопка ничего не авторизует: она только ссылка на
серверный старт входа потребителя (BFF). Authorize-URL с PKCE, `state` и
`nonce` строит сервер потребителя, потому что все клиенты провайдера
confidential (`client_secret_basic`) и `code_verifier` обязан жить на сервере.
Старт отвечает 303 на `https://hearthpulse.net/identity/auth` — настоящую форму
входа HearthPulse.

## Подключение

```html
<script src="https://hearthpulse.net/embed/hearthpulse-login-v1.js" defer></script>

<hearthpulse-login-button href="https://hs-manacost.ru/reader-auth/start">
  <a href="https://hs-manacost.ru/reader-auth/start">Войти через HearthPulse (hearthpulse.net)</a>
</hearthpulse-login-button>
```

Работает с `defer`, `async` и без них; можно подключить до или после тега.
Повторная загрузка скрипта безопасна (`customElements.get` проверяется до
`define`).

Дочерняя `<a>` — fallback. Пока элемент не определён (скрипт не загрузился,
выключен JS, блокировщик, старый браузер), пользователь видит эту обычную
ссылку. Когда элемент определён, он рисует кнопку в shadow root, а дочерняя
ссылка не отображается (слота нет).

Если браузер не поддерживает constructable stylesheets
(`adoptedStyleSheets`, Safari до 16.4), скрипт ничего не определяет: остаётся
fallback-ссылка. `<style>` внутри кнопки не создаётся, поэтому под строгим CSP
она не ломается.

## Атрибуты

- `href` — обязателен. Абсолютный `https://…` URL без логина и пароля или
  путь от корня сайта `/…` (но не `//…`).
- `theme` — `auto` (по умолчанию, по `prefers-color-scheme` ОС), `light`,
  `dark`; любое другое значение работает как `auto`.
- `lang` — `ru` (по умолчанию) или `en` (подходит и `en-US`); любое другое
  значение работает как `ru`.

Если сайт сам переключает тему независимо от ОС, ставьте `theme` явно.

Тексты: `ru` — «Войти через HearthPulse», `en` — «Sign in with HearthPulse»;
вторая строка всегда «hearthpulse.net». Доступное имя ссылки —
«Войти через HearthPulse hearthpulse.net» (логотип скрыт от скринридера).

### Небезопасный `href`

Значения `javascript:`, `data:`, `http:`, `//host`, `/\host`, с пробелами,
табами и управляющими символами, с логином/паролем в URL, относительные без `/`,
пустые и отсутствующий атрибут не попадают в `href`: кнопка становится
выключенной (`role="link"`, `aria-disabled="true"`, без `href`, клик ничего не
делает) и пишет в консоль одно `console.warn` на каждое значение. Изменение
`href` на лету проверяется заново.

## Что делает и чего не делает

- Навигация только в том же окне обычной ссылкой: без `target`, popup и
  `window.open`.
- Нет сетевых запросов (кроме загрузки самого скрипта), cookies, storage,
  `eval`/`new Function`, глобальных переменных (кроме custom element) и чтения
  страницы вне себя. Текст и атрибуты ставятся через DOM API; HTML из данных
  сайта не вставляется.
- Стили изолированы в open shadow root; внутри для каждого элемента сброшены
  наследуемые свойства, поэтому `font`, `letter-spacing`, `text-transform` и
  правила на `a`/`span` страницы кнопку не меняют, а кнопка не добавляет в
  страницу ни стилей, ни `<style>`.
- Тёмная и светлая темы, цель касания не меньше 44 px, видимый
  `:focus-visible` (двойное кольцо тёмно-синее + голубое читается на светлом и
  тёмном фоне), `forced-colors`, `prefers-reduced-motion: reduce` (переходы
  отключаются). В узком контейнере подпись переносится, а не вылезает.

Контраст текста (WCAG, считано по значениям из файла): светлая тема —
заголовок `#07172b` на `#fff` 18,0:1, «hearthpulse.net» `#2f5a8a` на `#fff`
7,1:1; тёмная — `#f8fbff` на `#07172b` 17,3:1, `#93c5fd` на `#07172b`
10,0:1. В состояниях hover и active наименьший контраст подписи 5,7:1
(`#2f5a8a` на `#d9e9f9`). Граница кнопки: `#12345a` на белом 12,6:1,
`#4aa3d8` на чёрном 7,5:1.

## CSP сайта-потребителя

Кнопка работает при строгом CSP, достаточно разрешить скрипт:

```text
script-src https://hearthpulse.net
```

`style-src 'unsafe-inline'` не нужен: стили задаются через constructable
stylesheet, а не `<style>`/`style=""`. Ссылка кнопки — обычная навигация и
`form-action`/`connect-src` не затрагивает; домен старта входа потребителя —
это его собственный сайт.

## Версии и кэш

Статику `*.js` origin и edge отдают с
`Cache-Control: public, max-age=2592000, immutable`, edge хранит файл 30 дней.
Поэтому **v1 заморожена**: после релиза файл
`public/embed/hearthpulse-login-v1.js` не меняется. Любая правка, даже
опечатка, выходит как новый файл `hearthpulse-login-v2.js`; потребители
переходят на него сами. Это охраняет `tests/embed-login-button-contract.test.mjs`
(sha256 файла записан литералом и размер ≤ 4096 байт gzip): правка v1 уронит
тест. Для v2 заводится новый литерал и новый тест; v1 остаётся как есть.

## Почему нет SRI и CORS в v1

SRI на чужом origin требует `integrity` вместе с `crossorigin`, а статика
HearthPulse отдаётся без `Access-Control-Allow-Origin`. Скрипт запрашивается
без CORS, и атрибуты `integrity`/`crossorigin` здесь не работают. Включение
CORS — отдельная nginx-задача (`deploy/nginx/**`), в v1 не входит. Защита v1
от подмены — HTTPS, неизменяемость файла и контрактный тест хеша; потребитель
получает код, у которого нет доступа к сессиям и паролям.

## Вне v1

Popup-режим, iframe, построение authorize-URL в браузере (нужен только для
public-клиентов, которых нет), React-обёртка, CORS/SRI.

## Проверка

- `tests/embed-login-button-browser.test.mjs` — настоящий Chromium: виджет с
  origin A на странице origin B с CSP
  `default-src 'none'; script-src <A>; style-src 'self'`; роль и имя из дерева
  доступности; клик и Enter; плохие `href`; темы и `prefers-color-scheme`;
  `forced-colors`, reduced motion; двойная загрузка; нет запросов, cookies и
  storage; изоляция стилей в обе стороны; скриншоты 390/1440 в каталог из
  `HP_LOGIN_BUTTON_SHOTS_DIR` (иначе во временный).
- `tests/embed-login-button-contract.test.mjs` — размер и хеш v1.
- После деплоя: `curl -sI https://hearthpulse.net/embed/hearthpulse-login-v1.js`
  → `200`, `content-type: application/javascript`, `cache-control` как у
  остальной статики.
