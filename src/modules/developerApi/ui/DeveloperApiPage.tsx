import React from 'react';
import { ArrowUpRight, Braces, CheckCircle2, Clock3, KeyRound } from 'lucide-react';
import '../developerApi.css';

const CURL_EXAMPLE = `curl https://arena.hs-manacost.ru/api/v1/catalog/manifest \\
  -H "X-API-Key: mca_live_••••••••"`;

export function DeveloperApiPage() {
  return (
    <article className="developer-api-page">
      <header className="developer-api-hero">
        <div>
          <span className="developer-api-kicker"><Braces size={16} /> Для приложений и трекеров</span>
          <h1>Manacost Public API</h1>
          <p>
            Версионированный доступ к данным Manacost для Hearthstone-инструментов.
            Первый production-срез уже включает безопасные API-ключи и каталог ресурсов.
          </p>
        </div>
        <div className="developer-api-version" aria-label="Текущая версия API">
          <span>Версия</span><strong>v1</strong><small>стабильный namespace</small>
        </div>
      </header>

      <section className="developer-api-status" aria-labelledby="api-status-title">
        <div>
          <span className="developer-api-status-icon is-live"><CheckCircle2 /></span>
          <div><h2 id="api-status-title">Доступно сейчас</h2><p>OpenAPI, ключи и catalog manifest</p></div>
        </div>
        <div>
          <span className="developer-api-status-icon"><Clock3 /></span>
          <div><h2>Планируется</h2><p>Карты, изображения, колоды и мета</p></div>
        </div>
      </section>

      <section className="developer-api-section" aria-labelledby="api-auth-title">
        <span className="developer-api-section-number">01</span>
        <div>
          <h2 id="api-auth-title"><KeyRound size={22} /> Авторизация приложения</h2>
          <p>
            Передавайте выданный администратором ключ в заголовке <code>X-API-Key</code>.
            Ключ показывается один раз: сохраните его в защищённом хранилище приложения.
          </p>
          <pre className="developer-api-terminal" aria-label="Пример запроса cURL"><code>{CURL_EXAMPLE}</code></pre>
        </div>
      </section>

      <section className="developer-api-section" aria-labelledby="api-endpoints-title">
        <span className="developer-api-section-number">02</span>
        <div className="developer-api-section-body">
          <h2 id="api-endpoints-title">Точки входа</h2>
          <div className="developer-api-endpoints">
            <div><span>GET</span><code>/api/v1/catalog/manifest</code><p>Доступные ресурсы и версия схемы</p></div>
            <div><span>GET</span><code>/api/v1/openapi.json</code><p>Машиночитаемый контракт OpenAPI 3.1</p></div>
          </div>
          <a className="developer-api-openapi-link" href="/api/v1/openapi.json">
            Открыть OpenAPI JSON <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        </div>
      </section>

      <section className="developer-api-section" aria-labelledby="api-errors-title">
        <span className="developer-api-section-number">03</span>
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
