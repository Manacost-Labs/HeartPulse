import React from 'react';
import {
  ArrowUpRight,
  Braces,
  CheckCircle2,
  Clock3,
  KeyRound,
  MonitorSmartphone,
} from 'lucide-react';
import '../developerApi.css';

const CURL_EXAMPLE = `curl "https://arena.hs-manacost.ru/api/v1/cards?format=standard&limit=20" \\
  -H "X-API-Key: mca_live_••••••••"`;

const DEVICE_EXAMPLE = `curl -X POST https://arena.hs-manacost.ru/api/v1/oauth/device/code \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  --data "client_id=manacost-tracker&scope=profile.read%20subscription.read"`;

export function DeveloperApiPage() {
  return (
    <article className="developer-api-page">
      <header className="developer-api-hero">
        <div>
          <span className="developer-api-kicker"><Braces size={16} /> Для приложений и трекеров</span>
          <h1>Manacost Public API</h1>
          <p>
            Версионированный доступ к данным Manacost для Hearthstone-инструментов.
            Доступны каталог карт с токенами, защищённые изображения, сервисные
            API-ключи и вход пользователя для Manacost Tracker без передачи пароля приложению.
          </p>
        </div>
        <div className="developer-api-version" aria-label="Текущая версия API">
          <span>Версия</span><strong>v1</strong><small>стабильный namespace</small>
        </div>
      </header>

      <section className="developer-api-status" aria-labelledby="api-status-title">
        <div>
          <span className="developer-api-status-icon is-live"><CheckCircle2 /></span>
          <div><h2 id="api-status-title">Доступно сейчас</h2><p>Карты, токены, изображения, ключи и вход приложения</p></div>
        </div>
        <div>
          <span className="developer-api-status-icon"><Clock3 /></span>
          <div><h2>Планируется</h2><p>Колоды, матчи и мета</p></div>
        </div>
      </section>

      <section className="developer-api-section" aria-labelledby="api-auth-title">
        <span className="developer-api-section-number">01</span>
        <div>
          <h2 id="api-auth-title"><KeyRound size={22} /> Сервисный API-ключ</h2>
          <p>
            Передавайте выданный администратором ключ в заголовке <code>X-API-Key</code>.
            Этот вариант подходит серверным интеграциям и не представляет пользователя.
            Ключ показывается один раз и должен храниться как секрет.
          </p>
          <pre className="developer-api-terminal" aria-label="Пример запроса cURL" tabIndex={0}>
            <code>{CURL_EXAMPLE}</code>
          </pre>
        </div>
      </section>

      <section className="developer-api-section" aria-labelledby="api-user-auth-title">
        <span className="developer-api-section-number">02</span>
        <div>
          <h2 id="api-user-auth-title"><MonitorSmartphone size={22} /> Вход пользователя в трекере</h2>
          <p>
            Публичный desktop-клиент начинает Device Authorization Grant, открывает
            полученную ссылку в системном браузере и опрашивает token endpoint с
            указанным интервалом. Пароль остаётся только на сайте Manacost.
          </p>
          <pre className="developer-api-terminal" aria-label="Запуск авторизации приложения" tabIndex={0}>
            <code>{DEVICE_EXAMPLE}</code>
          </pre>
          <p>
            Access token действует 15 минут, refresh token — до 30 дней и меняется
            при каждом обновлении. Refresh token храните в системном хранилище
            учётных данных и никогда не записывайте в логи.
          </p>
        </div>
      </section>

      <section className="developer-api-section" aria-labelledby="api-endpoints-title">
        <span className="developer-api-section-number">03</span>
        <div className="developer-api-section-body">
          <h2 id="api-endpoints-title">Точки входа</h2>
          <div className="developer-api-endpoints">
            <div><span>GET</span><code>/api/v1/catalog/manifest</code><p>Доступные ресурсы и версия схемы</p></div>
            <div><span>GET</span><code>/api/v1/cards</code><p>Стандартный или вольный каталог, фильтры и курсорная пагинация</p></div>
            <div><span>GET</span><code>/api/v1/cards/{'{cardId}'}</code><p>Данные карты, связанные токены и пулы генерации</p></div>
            <div><span>GET</span><code>/api/v1/cards/{'{cardId}'}/images/{'{variant}'}.webp</code><p>Кэшированные изображения thumb, full и tile</p></div>
            <div><span>POST</span><code>/api/v1/oauth/device/code</code><p>Начало безопасного входа desktop-приложения</p></div>
            <div><span>POST</span><code>/api/v1/oauth/token</code><p>Обмен device code и ротация refresh token</p></div>
            <div><span>GET</span><code>/api/v1/me</code><p>Минимальный профиль и права подписки</p></div>
            <div><span>GET</span><code>/api/v1/openapi.json</code><p>Машиночитаемый контракт OpenAPI 3.1</p></div>
          </div>
          <a className="developer-api-openapi-link" href="/api/v1/openapi.json">
            Открыть OpenAPI JSON <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section className="developer-api-section" aria-labelledby="api-errors-title">
        <span className="developer-api-section-number">04</span>
        <div>
          <h2 id="api-errors-title">Ошибки и совместимость</h2>
          <p>
            Клиент должен ориентироваться на поле <code>error.code</code>. Сообщение
            предназначено для человека и может уточняться без смены версии API.
            Все несовместимые изменения будут выпускаться в новом namespace.
          </p>
        </div>
      </section>
    </article>
  );
}
