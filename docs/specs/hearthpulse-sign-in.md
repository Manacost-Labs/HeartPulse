# Вход через HearthPulse: гайд интегратора

Документ для разработчика сайта или приложения, которое хочет войти
пользователя через **hearthpulse.net**. Эпик E20, срез S4. Все факты сверены с
кодом `origin/main` (`eb913c0e`), с живым discovery и с живыми ответами
`GET /identity/auth` на 2026-11-01; как именно — в разделе
«Как сверено».

Сначала то, что нужно знать до начала работы:

- Провайдер — OpenID Connect на `https://hearthpulse.net/identity`.
  Поддержан только authorization code с обязательным PKCE `S256`.
- Пароль вводится только на hearthpulse.net. Ваш сайт или приложение его
  не видит и не должно просить.
- Клиенты только confidential: у вас должен быть сервер (BFF), который хранит
  секрет и `code_verifier`. Чистый браузерный клиент (SPA без сервера) не
  поддерживается.
- Клиент выдаёт владелец HearthPulse по **точному списку в коде**.
  Самостоятельной регистрации нет (решение владельца ждёт задача
  [#333](https://github.com/Manacost-Labs/HeartPulse/issues/333)). Сегодня в
  production настроен только клиент Манакоста, подробности в разделе
  «Как получить клиента».
- Scope v1: только `openid profile`.
- Только переход в том же окне. Popup, iframe и SRI в v1 нет.
- Для нативных и десктопных приложений есть отдельный device flow `/connect`,
  но он не заменяет OIDC; см. «Приложения и десктоп».

## Схема входа

```text
кнопка на странице потребителя
  -> BFF потребителя: GET /hearthpulse/start
       (сервер создаёт code_verifier, state, nonce и хранит их у себя)
  -> 303 https://hearthpulse.net/identity/auth?...
  -> hearthpulse.net: вход в HearthPulse, если пользователь не вошёл
  -> hearthpulse.net: страница согласия «Вход через hearthpulse.net в <сайт>»
  -> 303 на redirect URI потребителя: ?code=...&state=...&iss=...
  -> BFF потребителя: обмен кода на токены по HTTPS, проверка id_token
  -> BFF потребителя создаёт СВОЮ сессию (HttpOnly cookie)
```

Кнопка (см. [спецификацию кнопки](hearthpulse-login-button.md)) — обычная
ссылка на старт входа вашего сервера. Authorize-URL с PKCE строит сервер, а не
браузер: `code_verifier` обязан оставаться на сервере, а токены не должны
попадать в JavaScript страницы.

### Почему нет iframe и popup

- Ответы провайдера `/identity/*` отдаются с
  `Content-Security-Policy: … frame-ancestors 'none'`, поэтому форму входа и
  согласия нельзя встроить во фрейм; главная страница hearthpulse.net отдаётся
  с `X-Frame-Options: SAMEORIGIN`.
- Cookie провайдера (`__Host-hp_identity`, `__Secure-hp_interaction`,
  `__Secure-hp_resume`) выставлены с `SameSite=Lax`, так что в стороннем
  контексте они не передаются.
- Authority входа один: пользователь должен видеть адрес hearthpulse.net в
  адресной строке в тот момент, когда вводит пароль. Встроенная форма это
  ломает.
- Кнопка тоже ничего не открывает через `window.open`: только обычный переход
  в том же окне.

## Параметры провайдера

Discovery:
`https://hearthpulse.net/identity/.well-known/openid-configuration`.

<!-- markdownlint-disable MD013 -->

| Что | Значение |
| --- | --- |
| `issuer` | `https://hearthpulse.net/identity` (без `/` на конце) |
| Authorization endpoint | `https://hearthpulse.net/identity/auth` |
| Token endpoint | `https://hearthpulse.net/identity/token` |
| Userinfo | `https://hearthpulse.net/identity/me` |
| JWKS | `https://hearthpulse.net/identity/jwks` |
| Revocation | `https://hearthpulse.net/identity/token/revocation` |
| Introspection | `https://hearthpulse.net/identity/token/introspection` |
| End session | `https://hearthpulse.net/identity/session/end` |
| `response_type` | только `code` |
| PKCE | обязателен, только `code_challenge_method=S256`; без PKCE провайдер возвращает на redirect URI `error=invalid_request` |
| Аутентификация клиента | `client_secret_basic` (секрет в заголовке `Authorization: Basic`) |
| Подпись `id_token` | `RS256` |
| Scope | `openid profile`; `offline_access` разрешён только зарезервированному клиенту Манакоста, остальные получают `error=invalid_scope` после согласия |
| Claims | `sub` (идентификатор пользователя HearthPulse, строка); `name` (имя профиля) приходит из userinfo, не из `id_token` |
| `state`, `nonce` | провайдер их не требует, но обязательно используйте оба: библиотека проверит их при обмене |
| `prompt` | клиент Манакоста передаёт `login consent`: страница согласия показывается при каждом входе. Тесты провайдера покрывают именно этот вариант |
| Ответ провайдера | используйте `response_mode=query` (по умолчанию); в ответе есть `iss`, его проверяет OIDC-библиотека |
| Время жизни | код авторизации 60 с; access token 300 с; `id_token` 300 с; интеракция (вход и согласие) 600 с; сессия провайдера 24 ч; grant 7 суток |
| Refresh token | не выдаётся без `offline_access`, поэтому у обычного клиента его нет: после обмена кода создавайте свою сессию |
| Revocation и introspection | только токены того же клиента; introspection отвечает `active: true` лишь пока жива исходная сессия HearthPulse |
| Redirect URI | ровно один на клиента, совпадение строгое (см. ниже) |
| CORS | нет: `clientBasedCORS` выключен, заголовка `Access-Control-Allow-Origin` у `/identity/*` нет. Token endpoint вызывается только с сервера |
| Лимит | около 120 запросов в минуту с одного адреса на все маршруты `/identity` |

<!-- markdownlint-enable MD013 -->

Discovery показывает и общие возможности библиотеки провайдера
(`client_secret_post`, `private_key_jwt`, `none`, DPoP, pushed authorization
requests, `form_post`, `fragment`). Для клиентов HearthPulse они не
настроены и контрактом не являются: клиент регистрируется с
`response_types: ['code']`, `grant_types: ['authorization_code',
'refresh_token']` и `token_endpoint_auth_method: client_secret_basic`.
Динамической регистрации клиентов нет, параметр `request_uri` не
поддерживается.

`end_session_endpoint` присутствует в discovery, но для клиентов не
зарегистрированы `post_logout_redirect_uris`, и контрактом v1 он не
является. Выход из вашего сайта — это закрытие вашей локальной сессии и, по
желанию, отзыв токенов (см. «Выход и отзыв»). Выход пользователя из
HearthPulse закрывает и вход на вашем сайте, пока токены живы: каждая
проверка токена сверяется с исходной сессией HearthPulse.

## Как получить клиента

Самостоятельной регистрации нет. Клиент — это запись в конфигурации
production-провайдера, а список допустимых клиентов зашит в код.

Что есть на сегодня (`server/modules/browserIdentity/configuration.ts`):

- В production провайдер принимает только два точных клиента Манакоста:
  `manacost-reader-production` с callback
  `https://hs-manacost.ru/reader-auth/callback` и (по отдельному флагу,
  по умолчанию выключен) `manacost-reader-staging` с callback
  `https://test.hs-manacost.ru/reader-auth/callback`. Любая другая запись в
  `BROWSER_IDENTITY_CLIENTS` не пройдёт `validateIdentityOptions`, и провайдер
  не запустится: конфигурация fail-closed.
- Путь redirect URI для любого клиента сегодня может быть только
  `/reader-auth/callback`.
- Общие правила redirect URI: схема `https`, без логина и пароля, query,
  fragment, wildcard и явного порта; строка должна совпадать с нормализованным
  URL посимвольно. Один redirect URI на клиента. Близкие значения (`www`,
  другой домен, порт, слэш на конце) отклоняются.
- Секрет клиента — не короче 43 символов; задаётся в env
  `BROWSER_IDENTITY_CLIENTS` (JSON-массив `{id, secret, redirectUri}`) через
  root-only конфигурацию сервера. Секрет не попадает ни в репозиторий, ни в
  ответы API.

Значит, чтобы подключить новый сайт, нужны:

1. Заявка владельцу HearthPulse: имя клиента, точный redirect URI, домен.
2. **Правка кода** `configuration.ts` (расширение допустимых клиентов и, при
   необходимости, пути callback), ревью и релиз.
3. Новый секрет в root-only конфигурации production и перезапуск.
4. Секрет не публикуется; способ передачи согласуйте с владельцем.

Это ручной процесс владельца; формальной формы заявки и сроков не
определено. Решение,
нужна ли самостоятельная регистрация, ждёт владельца в
[#333](https://github.com/Manacost-Labs/HeartPulse/issues/333).
Для других клиентов страница согласия показывает в качестве названия и хоста
хост callback (`clientPresentation()`); красивое имя бренда есть только у
клиентов Манакоста.

## Серверный обмен кода

Пример для Node.js 22 на Express с `express-session` и
[`openid-client`](https://github.com/panva/openid-client) 6.x (та же
библиотека и те же вызовы, что в BFF Манакоста). В примере нет настоящих
клиентов и секретов; значения берутся из окружения.

```js
import express from 'express';
import session from 'express-session';
import * as oidc from 'openid-client';

const ISSUER = 'https://hearthpulse.net/identity';
const CLIENT_ID = process.env.HEARTHPULSE_CLIENT_ID; // выдаёт владелец
const CLIENT_SECRET = process.env.HEARTHPULSE_CLIENT_SECRET; // только сервер
const REDIRECT_URI = process.env.HEARTHPULSE_REDIRECT_URI; // как в allowlist

const app = express();
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, sameSite: 'lax' },
  // store: серверное хранилище вашего приложения вместо MemoryStore
}));

let configPromise;
function getConfig() {
  // Клиенту HearthPulse выдан client_secret_basic. ClientSecretBasic нужен
  // явно, иначе openid-client отправит секрет в теле запроса.
  configPromise ??= oidc.discovery(
    new URL(ISSUER),
    CLIENT_ID,
    { id_token_signed_response_alg: 'RS256' },
    oidc.ClientSecretBasic(CLIENT_SECRET),
  ).catch((error) => {
    configPromise = undefined;
    throw error;
  });
  return configPromise;
}

// Сюда ведёт кнопка. Адрес и параметры строит только сервер.
app.get('/hearthpulse/start', async (req, res, next) => {
  try {
    const config = await getConfig();
    const attempt = {
      codeVerifier: oidc.randomPKCECodeVerifier(),
      state: oidc.randomState(),
      nonce: oidc.randomNonce(),
    };
    req.session.hearthpulse = attempt; // остаётся на сервере
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid profile',
      prompt: 'login consent',
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(
        attempt.codeVerifier,
      ),
      code_challenge_method: 'S256',
    });
    res.redirect(303, url.href);
  } catch (error) {
    next(error);
  }
});

// Должен совпадать с REDIRECT_URI посимвольно.
app.get('/reader-auth/callback', async (req, res, next) => {
  const attempt = req.session.hearthpulse;
  delete req.session.hearthpulse; // попытка одноразовая
  if (!attempt) return res.status(400).send('Вход истёк, начните заново.');
  try {
    const config = await getConfig();
    const callbackUrl = new URL(req.originalUrl, new URL(REDIRECT_URI).origin);
    const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: attempt.codeVerifier,
      expectedState: attempt.state,
      expectedNonce: attempt.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    // name есть в userinfo, а не в id_token.
    const profile = await oidc.fetchUserInfo(
      config,
      tokens.access_token,
      claims.sub,
    );
    req.session.regenerate((error) => {
      if (error) return next(error);
      // Токены HearthPulse дальше не нужны: access живёт 300 с.
      req.session.user = { hearthpulseId: claims.sub, name: profile.name };
      res.redirect(303, '/');
    });
  } catch (error) {
    if (error instanceof oidc.AuthorizationResponseError
      && error.error === 'access_denied') {
      return res.redirect(303, '/'); // пользователь нажал «Отмена»
    }
    next(error);
  }
});

export default app;
```

Что важно в примере:

- `code_verifier`, `state` и `nonce` генерируются на сервере и лежат только в
  серверной сессии потребителя. В браузер уходит лишь `code_challenge`.
- Попытка одноразовая: при любом callback запись удаляется, повторный
  callback с тем же кодом не пройдёт (код провайдера тоже одноразовый).
- `authorizationCodeGrant` сверяет `state`, `nonce`, `iss`, подпись, аудиторию
  и срок `id_token`. Не заменяйте это ручным разбором JWT.
- После успеха создаётся **своя** сессия потребителя (HttpOnly,
  `Secure`, `SameSite=Lax`), а `session.regenerate` защищает от фиксации
  сессии. Токены HearthPulse не передаются в браузер и в JavaScript. Если вам
  нужен только факт входа, access token можно сразу отозвать через
  `oidc.tokenRevocation`.
- Идентифицируйте пользователя по `sub`, а не по имени. Почты в claims нет
  нет в v1.
- Отмена на странице согласия приходит на тот же callback как
  `error=access_denied`.

## Кнопка

```html
<script src="https://hearthpulse.net/embed/hearthpulse-login-v1.js" defer>
</script>

<hearthpulse-login-button href="/hearthpulse/start">
  <a href="/hearthpulse/start">Войти через HearthPulse (hearthpulse.net)</a>
</hearthpulse-login-button>
```

`href` — ссылка на старт входа вашего сервера. Кнопка не авторизует сама и
не проверяет хост; не собирайте `href` из пользовательского ввода. Атрибуты
`theme` и `lang`, CSP сайта, версии и причина, по которой SRI в v1 нет,
описаны в [спецификации кнопки](hearthpulse-login-button.md).

## Что видит пользователь

1. Если он не вошёл в HearthPulse, он попадает на обычную карточку входа
   HearthPulse на hearthpulse.net. Название вашего сайта на этой карточке
   сейчас не показывается: плашка в работе
   ([#330](https://github.com/Manacost-Labs/HeartPulse/issues/330)), до
   релиза на неё не рассчитывайте.
2. Затем страница согласия `GET /identity/interaction/<uid>`:
   «Вход через hearthpulse.net в `<название>` (`<хост>`)», знак HearthPulse,
   текст «Сайт … получит ваш идентификатор и имя профиля. Пароль, почта и
   платёжные данные не передаются» и кнопки «Продолжить» и «Отмена». Подробности
   страницы — в разделе «Consent page and client context» спецификации
   [Manacost reader v1](manacost-reader-v1.md).
3. После «Продолжить» браузер возвращается на ваш redirect URI с кодом, после
   «Отмена» — с `error=access_denied`.

Маршрут `GET /identity/interaction/<uid>/client` нужен только карточке входа
HearthPulse: он отвечает на конкретном браузере с его cookie интеракции и не
является API для интеграторов.

## Выход и отзыв

- Выход из вашего сайта — закрытие вашей сессии. HearthPulse он не затрагивает.
- Токены клиента можно отозвать на
  `https://hearthpulse.net/identity/token/revocation`
  (`oidc.tokenRevocation`) и проверить на
  `https://hearthpulse.net/identity/token/introspection`
  (`oidc.tokenIntrospection`). Оба метода работают только с токенами вашего
  клиента, а introspection считает токен неактивным, как только исходная сессия
  HearthPulse завершена или истекла либо пользователь заблокирован.
- Access token живёт 300 с, а refresh token у обычного клиента не выдаётся,
  поэтому дальнейшую авторизацию держите на своей сессии.

## Приложения и десктоп

Для нативных и десктопных приложений в HearthPulse есть device flow на
странице `/connect` (модуль `src/modules/applicationConnect`, решение
[ADR 004](../decisions/004-desktop-device-authorization.md), контракт
[Public API v1](public-api-v1-first-slice.md#desktop-application-authorization),
границы клиента [application-connect-api-slice](../architecture/application-connect-api-slice.md)).
Схема:

1. Приложение вызывает `POST /api/v1/oauth/device/code` и получает
   `verification_uri_complete`.
2. Открывает её в системном браузере, где пользователь входит в HearthPulse
   и подтверждает приложение на `/connect`.
3. Приложение опрашивает `POST /api/v1/oauth/token` не чаще `interval` и
   получает bearer-токен для Public API.

Ограничения, о которых лучше знать сразу:

- Это не OIDC: приложение получает не `id_token`, а токены Public API со
  scope вроде `profile.read` и `subscription.read`.
- Сегодня в коде зарегистрирован один публичный клиент `manacost-tracker`
  (`server/app/registerApplicationAuth.ts`), поэтому для стороннего
  приложения нужна такая же заявка владельцу.
- Поведение `/connect` этим документом не меняется.

Нативному приложению без собственного сервера OIDC сегодня недоступен:
клиенты провайдера только confidential. Приложению с собственным сервером
подходит схема OIDC и BFF выше.

## Вне v1

Popup и iframe; самостоятельная регистрация клиентов; публичные клиенты и
вход из браузера без сервера; `offline_access` для сторонних клиентов;
CORS и SRI для скрипта кнопки; выход через `end_session` с возвратом на
сайт; почта и платёжные данные в claims.

## Как сверено

- Код: модуль `server/modules/browserIdentity` (`configuration.ts`,
  `provider.ts`, `runtime.ts`, `interactionView.ts`, `sessionBindings.ts`),
  `server/app/registerBrowserIdentity.ts`,
  `server/app/registerApplicationAuth.ts`, тесты
  `tests/browser-identity-runtime.test.ts` и
  `tests/browser-identity-provider.test.ts`.
- Живой discovery: `curl -s
  https://hearthpulse.net/identity/.well-known/openid-configuration`.
- Живой `GET /identity/auth` с точным клиентом Манакоста и корректным PKCE
  отвечает `303` на страницу интеракции; неизвестный клиент и чужой
  redirect URI — `400`; запрос без PKCE — `303` на redirect URI с
  `error=invalid_request`.
- Пример кода проходит `node --check`, а `GET /hearthpulse/start` из него
  против живого discovery строит authorize-URL с `S256`, `state`, `nonce`,
  `scope=openid profile` и `redirect_uri` из окружения.
