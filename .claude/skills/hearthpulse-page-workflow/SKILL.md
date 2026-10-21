---
name: hearthpulse-page-workflow
description: Порядок работы над страницей HearthPulse от задачи до продакшена. Использовать, когда просят сделать, переделать или улучшить страницу, раздел или компонент на hearthpulse.net, и при сдаче такой работы (READY, CI, бюджеты, nginx, changelog). Внешний вид — в скилле hearthpulse-page-design.
---

# HearthPulse: как сделать страницу и сдать её

Обязательные правила проекта — в `AGENTS.md`; этот скилл — порядок шагов
для UI-задачи. Внешний вид — `hearthpulse-page-design`, движение —
`hearthpulse-motion`.

## Шаг 1. Своя рабочая копия

```bash
git -C /srv/projects/web/arena.hs-manacost.ru fetch origin
git -C /srv/projects/web/arena.hs-manacost.ru worktree add \
  -b claude/<task>-<YYYYMMDD> \
  /srv/projects/tasks/hearthpulse-<task>-<YYYYMMDD> origin/main
cd /srv/projects/tasks/hearthpulse-<task>-<YYYYMMDD>
npm run agent:session:preflight
```

Трогай только свои файлы. Если другая сессия владеет страницей, не правь
её файлы — договорись или ограничься точкой подключения.

## Шаг 2. Аудит до правок

1. Открой страницу на проде как гость (и как подписчик в локальном стенде,
   если страница платная). Скриншоты 1440×900 и 412×915 — «до».
2. Найди код: `git grep` по тексту со страницы, маршрут в
   `apps/public-web/app/`, компоненты в `src/features/`, данные в `server/`.
3. Выпиши, что плохо: иерархия, повторы, читаемость, телефон, данные.
   Сверь со списком анти-паттернов в `hearthpulse-page-design`.

## Шаг 3. Промежуточный отчёт до полировки

Для заметных переделок сначала пришли черновик: скриншоты 1440 и 412 и
список «что убираю / сворачиваю / оставляю». Полируй после ответа.
Это экономит круги: владелец часто правит направление по черновику.

## Шаг 4. Реализация

- Новый визуальный компонент — со Storybook-историей рядом
  (`*.stories.tsx`), на реальных фикстурах.
- Модель данных (интервалы, цвета, группировки) — отдельный `*Model.ts`
  с unit-тестом. Компонент только рисует.
- Файл больше 250 строк не пройдёт `quality:clean-code` — дели заранее.
- **Paywall не трогай.** Логика доступа — `apps/public-web/ui/accessState.ts`
  и `usePublicAccess.ts`; только читай из них.
- Тайминги анимаций — токены (`hearthpulse-motion`), `prefers-reduced-motion`.
- Картинки: первая на экране — `fetchpriority="high"` и `sizes`, остальные
  `loading="lazy"` с зарезервированным размером (нет CLS).

## Шаг 5. Проверки

```bash
npm run lint && npm run lint:architecture && npm run lint:docs
npm run build-storybook && npm run test:storybook
npm run budget:next
npm run qa:ci            # сборки + браузерная обсерватория, как в CI
npm run agent:integration:preflight
```

- Бюджет бандла превышен осознанно → файл
  `config/next-bundle-budgets/approvals/<slug>.json`
  (`{"reason": "...", "routes": {"/route/": {"jsGzipBytes": N, "cssGzipBytes": N}}}`).
  Базовые значения руками не правь.
- Замерь LCP, CLS и INP на телефоне (Slow 4G, CPU ×4) до и после;
  медиана 3 прогонов. Хуже стало — не сдавай.
- Видимое изменение → фрагмент `changelog.d/<YYYY-MM-DD>-<slug>.md`
  (русский текст, без заголовка); проверка
  `npm run changelog:assemble -- --check`. `CHANGELOG.md` не правь.

## Шаг 6. Маршрут или nginx

Новый маршрут или изменение `deploy/nginx/*`:

- обнови `deploy/nginx/arena-html-routing.conf` и
  `deploy/nginx/arena-seo-map.conf` (и manifest:
  `npm run architecture:http-manifest:update`);
- в отчёте **явно** напиши, что nginx изменился: ведущая сессия ставит эти
  файлы на origin до пуша, иначе деплой упадёт на проверке расхождения;
- если `tests/workflow-contract.test.mjs` падает на хэше контракта —
  пересчитай `--allow-nginx-contract-hash` в `.github/workflows/ci.yml` и
  в тесте тем же коммитом.

## Шаг 7. Сдача (READY)

1. `git fetch origin && git rebase origin/main` прямо перед сдачей.
2. Прогон CI на своей ветке:
   `gh workflow run "Validate and deploy application" --ref <branch>`;
   дождись зелёного (деплой в dispatch пропускается). Упало — чини причину,
   тесты не ослабляй.
3. Отчёт по-русски, коротко: `READY <branch> <sha>` (fast-forward над
   `origin/main`), ссылка на зелёный прогон, скриншоты до/после 1440 и 412,
   цифры LCP/CLS/INP, что изменилось в nginx, чего не хватило в данных.
4. **В `main` не пушь.** Пушит ведущая сессия или merge queue
   (`npm run agent:integrate`, `docs/runbooks/agent-integration.md`).
5. После деплоя проверь страницу на проде, останови все свои dev-серверы
   (Storybook, next dev) и закрой рабочую копию.

## Проверь перед READY

- [ ] Рабочая копия своя, preflight пройден, чужие файлы не тронуты.
- [ ] Был черновик и ответ на него (для заметных переделок).
- [ ] Storybook-история и тест модели есть.
- [ ] `qa:ci`, `budget:next`, `lint:*`, integration preflight зелёные.
- [ ] Paywall не тронут.
- [ ] LCP/CLS/INP не хуже, без горизонтального скролла на 412.
- [ ] `changelog.d/` фрагмент добавлен.
- [ ] Изменения nginx названы в отчёте.
- [ ] Ветка перебазирована, зелёный workflow_dispatch, SHA fast-forward.
- [ ] Dev-серверы остановлены.
