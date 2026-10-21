---
name: hearthpulse-page-workflow
description: Порядок работы над страницей HearthPulse от задачи до READY. Использовать, когда просят сделать, переделать, редизайн или улучшить страницу, раздел, блок, компонент, таблицу или график на hearthpulse.net, и при сдаче такой работы (READY, CI, Storybook, бюджеты, LCP/CLS/INP, nginx, changelog). Внешний вид — в скилле hearthpulse-page-design.
---

# HearthPulse: как сделать страницу и сдать её

Выполняй шаги по порядку. Шаг не пропускай.
Внешний вид — скилл `hearthpulse-page-design`. Анимации — `hearthpulse-motion`.
Общие правила проекта — `AGENTS.md`.

## Шаг 1. Создай свою рабочую копию

Замени `<task>` на короткое имя задачи латиницей, `<YYYYMMDD>` на дату.

```bash
git -C /srv/projects/web/arena.hs-manacost.ru fetch origin
git -C /srv/projects/web/arena.hs-manacost.ru worktree add \
  -b claude/<task>-<YYYYMMDD> \
  /srv/projects/tasks/hearthpulse-<task>-<YYYYMMDD> origin/main
cd /srv/projects/tasks/hearthpulse-<task>-<YYYYMMDD>
npm ci
npm run agent:session:preflight
```

1. Работай только в этой папке.
2. В `/srv/projects/web/arena.hs-manacost.ru` ничего не правь.
3. Не делай `git stash`, `git reset`, `git checkout` в чужих папках.
4. Файл правит другая сессия — не трогай его, спроси ведущую сессию.

## Шаг 2. Посмотри, что есть сейчас

1. Сделай скриншоты страницы на проде: 1440×900 и 412×915. Это «до».
2. Найди код по тексту со страницы: `git grep -n '<текст со страницы>' -- src apps`.
3. Маршрут: `apps/public-web/app/`. Компоненты: `src/features/`. Данные: `server/`.
4. Выпиши списком, что нарушает «Правило №1» из `hearthpulse-page-design`.

## Шаг 3. Остановись и спроси, если

1. Нужных данных нет в API.
2. Нужно менять paywall, логику доступа или маршрут.
3. Нужно менять `deploy/nginx/*`.
4. Файлы страницы правит другая сессия.
5. Ситуации нет в таблице «Фиксированные решения» скилла дизайна.

Как спросить: `SendMessage` в сессию, которая дала задачу. Одним сообщением.
Потом закончи ход и жди ответа.

## Шаг 4. Пришли черновик

Нужен, если меняется больше одного блока.

1. Сделай черновик без полировки.
2. Сделай скриншоты 1440 и 412 в свой scratchpad.
3. Отправь сессии, которая дала задачу:
   - абсолютные пути к скриншотам;
   - список «убираю / сворачиваю / оставляю / добавляю».
4. Закончи ход. Полируй после ответа.

## Шаг 5. Сделай

1. Логику (отбор, сортировка, интервалы) положи в `src/features/<page>Model.ts`.
2. Компонент только рисует. Код бери из шаблонов скилла дизайна.
3. Файл длиннее 250 строк раздели на два.
4. Paywall не трогай. `apps/public-web/ui/accessState.ts` и
   `usePublicAccess.ts` только читай.
5. Первая картинка на экране: `fetchPriority="high"` и `sizes`.
6. Остальные картинки: `loading="lazy"`, `width` и `height`.
7. Напиши тест модели (шаблон 1).
8. Напиши Storybook-историю (шаблон 2).
9. Добавь фрагмент changelog (шаблон 3).

## Шаг 6. Проверь

```bash
npm run lint
npm run lint:oxlint
npm run lint:architecture
npm run lint:docs
npx tsx --test tests/<page>-model.test.ts
npm run test:discovery
npm run build-storybook && npm run test:storybook
npm run budget:next
npm run changelog:assemble -- --check
npm run qa:ci
npm run agent:integration:preflight
```

1. Команда упала — исправь причину. Тест не ослабляй. Правило не отключай.
2. `budget:next` упал — см. шаг 8 в `varylo-valyro.md` скилла дизайна.
3. Замерь LCP, CLS, INP на телефоне (Slow 4G, CPU ×4), медиана 3 прогонов,
   до и после. Стало хуже — не сдавай, исправь.

## Шаг 7. Маршрут или nginx (только если менял)

1. Обнови `deploy/nginx/arena-html-routing.conf`.
2. Обнови `deploy/nginx/arena-seo-map.conf`.
3. Запусти `npm run architecture:http-manifest:update`.
4. Упал `tests/workflow-contract.test.mjs` на хэше — пересчитай
   `--allow-nginx-contract-hash` в `.github/workflows/ci.yml` и в тесте.
5. В отчёте напиши строку «nginx изменён: <файлы>».

## Шаг 8. Сдай (READY)

```bash
git add <только свои файлы>
git commit -m "<тип>(<область>): <что сделано>"
git fetch origin && git rebase origin/main
git push -u origin claude/<task>-<YYYYMMDD>
gh workflow run "Validate and deploy application" \
  --ref claude/<task>-<YYYYMMDD>
gh run list --workflow "Validate and deploy application" \
  --branch claude/<task>-<YYYYMMDD> --limit 1
gh run watch <run-id> --exit-status
```

1. Прогон красный — исправь, закоммить, повтори шаг 8.
2. В `main` не пушь. Пушит ведущая сессия.
3. Отчёт по-русски, коротко:

   ```text
   READY claude/<task>-<YYYYMMDD> <sha>
   CI: <ссылка на зелёный прогон>
   До/после: <пути к скриншотам 1440 и 412>
   LCP/CLS/INP: <до> → <после>
   nginx: не менялся | изменён: <файлы>
   Не хватило данных: нет | <что>
   ```

4. Останови свои dev-серверы (Storybook, `next dev`).

## Шаблон 1. Тест модели

Файл `tests/<page>-model.test.ts`. Путь добавь в `tests/test-suites.json`,
набор `"unit"`, массив `files`. Иначе `test:discovery` упадёт.
Образец: `tests/standard-meta-table-model.test.ts`.

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { topByChange } from '../src/features/<page>Model';

test('low-sample rows are excluded from the top', () => {
  const rows = [
    { id: 'a', winrate: 55, games: 40, change: 3 },
    { id: 'b', winrate: 54, games: 900, change: 2 },
  ];
  assert.deepEqual(topByChange(rows as never, 'up').map(row => row.id), ['b']);
});
```

## Шаблон 2. Storybook-история

Файл рядом с компонентом: `src/features/<Block>.stories.tsx`.
Данные — реальная фикстура из `tests/fixtures/`.
Образец: `src/features/ArchetypeHistoryCharts.stories.tsx`.

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { PageBlock } from './PageBlock';
import real from '../../tests/fixtures/<page>-real-<YYYYMMDD>.json';

const meta = {
  title: '<Раздел>/<Блок>',
  component: PageBlock,
  args: { rows: real.rows },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PageBlock>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Real: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('li').length).toBeGreaterThan(0);
  },
};

export const Phone: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
```

## Шаблон 3. Фрагмент changelog

Файл `changelog.d/<YYYY-MM-DD>-<slug>.md`. Одна строка по-русски.
Без заголовка. Без маркера списка. `CHANGELOG.md` не правь.

```text
Мета: блок «Итоги недели» — архетипы с самым большим ростом и падением винрейта.
```

## Сделано, если

- [ ] Рабочая копия своя, preflight пройден.
- [ ] Чужие файлы не тронуты.
- [ ] Черновик отправлен и получен ответ (если менялось больше одного блока).
- [ ] Тест модели и Storybook-история есть.
- [ ] Все команды шага 6 зелёные.
- [ ] Paywall не тронут.
- [ ] LCP/CLS/INP не хуже. На 412 нет горизонтальной прокрутки.
- [ ] Фрагмент `changelog.d/` есть.
- [ ] Ветка перебазирована на `origin/main`, workflow_dispatch зелёный.
- [ ] Отчёт по шаблону шага 8 отправлен.
