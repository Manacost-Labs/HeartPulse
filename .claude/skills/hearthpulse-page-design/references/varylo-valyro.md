<!-- markdownlint-disable-file MD013 -->

# Varylo и Valyro: выбрать, добавить, оформить

VaryloUI и Valyro — библиотеки владельца. Из npm они не ставятся (пакета
`valyro-ui-pro` нет). Файлы копируются из локального реестра в
`src/vendor/`.

## 1. Какой компонент брать

Найди задачу в таблице. Нет в таблице — спроси ведущую сессию.

| Задача | Компонент | Файл |
| --- | --- | --- |
| Полоса KPI (3–6 чисел) | `KpiGroup` | `varylo-ui/data-display/KpiGroup.tsx` |
| Изменение числа со стрелкой | `TrendValue` | `varylo-ui/widgets/TrendValue.tsx` |
| Маленький тренд в строке | `Sparkline` | `varylo-ui/charts/Sparkline.tsx` |
| Переключатель 2–4 вариантов | `SegmentedControl` | `varylo-ui/navigation/SegmentedControl.tsx` |
| Доли (кто сколько занимает) | `Treemap` | `varylo-ui/charts/Treemap.tsx` |
| Две величины по многим точкам | `ScatterChart` | `varylo-ui/charts/ScatterChart.tsx` |
| Сетка «всё против всего» | `MatchupMatrix` | `varylo-ui/gaming/MatchupMatrix.tsx` |
| Профиль по 5–8 осям | `RadarChart` | `varylo-ui/charts/RadarChart.tsx` |
| Тепловая карта | `Heatmap` | `varylo-ui/charts/Heatmap.tsx` |
| Ряд с интервалом | `ConfidenceBandChart` | `varylo-ui/insights/ConfidenceBandChart.tsx` |
| Тир-лист | `TierList` | `varylo-ui/gaming/TierList.tsx` |
| Таблица меты с тиром | `MetaTable` | `varylo-ui/gaming/MetaTable.tsx` |
| Таблица с сортировкой | `DataTable` | `varylo-ui/data-display/DataTable.tsx` |
| Рейтинг игроков | `Leaderboard` | `varylo-ui/widgets/Leaderboard.tsx` |
| Список изменений патча | `PatchNotes` | `varylo-ui/gaming/PatchNotes.tsx` |
| Сравнение двух вещей по метрикам | `MetricComparison` | `valyro-ui/charts/MetricComparison.tsx` |
| Потоки (откуда → куда) | `SankeyChart` | `valyro-ui/charts/SankeyChart.tsx` |
| Поиск с выпадающим списком | `Combobox` | `valyro-ui/forms/Combobox.tsx` |
| Линия во времени | не Varylo: `LineChart` | `template-chart.md` |
| Строка с винрейтом | не Varylo: `WinrateCell` | `template-row.md` |

Все файлы выше уже лежат в `src/vendor/`. Используй их. Копировать не надо.

## 2. Проверь, есть ли компонент

```bash
find src/vendor -iname '<Имя>*.tsx'
```

1. Нашёлся — шаг 6 (тема). Шаги 3–5 пропусти.
2. Не нашёлся — шаг 3.

## 3. Найди item в реестре

Реестры (порядок поиска — сверху вниз):

| Кит | Реестр | Куда копировать |
| --- | --- | --- |
| VaryloUI | `/home/debian/varylo-ui-release/r/<item>.json` | `src/vendor/` (пути начинаются с `varylo-ui/`) |
| Valyro Pro | `/home/debian/valyro-pro-registry/<item>.json` | `src/vendor/` (пути начинаются с `valyro-ui/`) |
| Valyro free | `/home/debian/valyro-ui-release/r/<item>.json` | `src/vendor/` (пути начинаются с `valyro-ui/`) |

Имя item — kebab-case: `RadarChart` → `radar-chart`.

```bash
ls /home/debian/varylo-ui-release/r /home/debian/valyro-pro-registry /home/debian/valyro-ui-release/r | grep -i '<item>'
```

Посмотри, что внутри:

```bash
python3 - <<'EOF'
import json
item = json.load(open('/home/debian/varylo-ui-release/r/radar-chart.json'))   # МЕНЯЙ путь
print('deps:', [d.rsplit('/', 1)[-1].removesuffix('.json') for d in item.get('registryDependencies', [])])
for f in item['files']:
    print(f['path'])
EOF
```

## 4. Скопируй отсутствующие файлы

Запусти для item и для каждой зависимости из `deps`:

```bash
python3 - <<'EOF'
import json, os
REG = '/home/debian/varylo-ui-release/r'   # МЕНЯЙ: реестр из таблицы шага 3
ITEM = 'radar-chart'                        # МЕНЯЙ: item или зависимость
item = json.load(open(f'{REG}/{ITEM}.json'))
for f in item['files']:
    path = f['path']
    if path.startswith(('varylo-ui/styles/themes/', 'valyro-ui/styles/themes/')) or path.endswith('styles/tailwind.css'):
        print('пропуск (темы не возим):', path); continue
    target = os.path.join('src/vendor', path)
    if os.path.exists(target):
        print('есть, не трогаю:', target); continue
    os.makedirs(os.path.dirname(target), exist_ok=True)
    open(target, 'w').write(f['content'])
    print('добавлен:', target)
EOF
```

Правила:

1. Существующий файл не перезаписывай.
2. `styles/themes/*.css` и `styles/tailwind.css` не копируй.
3. Файлы Varylo и Valyro с одинаковым именем разные. Не смешивай папки.

## 5. Обнови README кита

Открой `src/vendor/varylo-ui/README.md` (или `src/vendor/valyro-ui/README.md`).

1. Допиши имя item в список `Items:` (или в абзац `Also vendored`).
2. Допиши новые зависимости рядом.
3. Если правил файл кита (шаг 7) — добавь пункт в `Local changes:`:

```markdown
- `charts/RadarChart.tsx`: <что изменено> — <зачем HearthPulse>.
```

## 6. Подключи стили и тему

Подключай в компоненте страницы ровно так:

```tsx
import '../vendor/varylo-ui/styles/index.css';   // база: один файл на всё
import './archetypeVaryloTheme.css';              // тема: см. таблицу ниже
```

Не импортируй `../vendor/valyro-ui/styles/index.css`, даже для компонента
Valyro. Вторая копия базы попадёт в CSS-чанк и перебьёт правила страницы.

Оберни компонент в класс темы:

| Где компонент | Класс | CSS темы |
| --- | --- | --- |
| На пергаменте страницы архетипа, карт, сравнения | `hp-varylo` | `src/features/archetypeVaryloTheme.css` |
| На тёмной красной плашке (шапка) | `hp-varylo hp-varylo--plate` | `src/features/archetypeVaryloTheme.css` |
| На странице меты | `standard-meta-varylo` | `src/features/StandardMetaVarylo.css` |
| Тир-лист, патчноуты, рейтинг, остальное | `hp-varylo-parchment` | `src/shared/ui/varyloParchment.css` |

```tsx
<div className="hp-varylo">
  <RadarChart … />
</div>
```

Карта токенов (уже задана в `archetypeVaryloTheme.css`, повторять не надо):

| Токен кита | Значение HearthPulse |
| --- | --- |
| `--ui-fg` | чернила `#30251c` (`--arena-ink`) |
| `--ui-fg-muted` | `#735e49` (≈ `--arena-muted-ink`) |
| `--ui-surface` | `rgba(255, 248, 225, 0.6)` — пергамент |
| `--ui-border` | `rgba(92, 54, 24, 0.24)` — линия бумаги |
| `--ui-accent`, `--ui-primary`, `--ui-focus-color` | `#8d171d` — красный |
| `--ui-success` / `--ui-danger` | `#3f8a46` / `#b8393a` |
| `--ui-shadow-card`, `--ui-blur` | нет (тени и размытие выключены) |

Не хватает токена — добавь строку в CSS темы из таблицы выше. В `:root`
не пиши: `lint:architecture` это запрещает.

## 7. Если файл кита не компилируется

В проекте `strict: false` (`tsconfig.json`). Иногда сужение типа не
срабатывает. Так уже было в `valyro-ui/primitives/react-compat.ts` и
`valyro-ui/theme/createThemeCSS.ts`.

1. Исправь минимально: одна строка.
2. Над строкой напиши комментарий:

   ```ts
   // HearthPulse: strict: false не сужает тип здесь — явное приведение.
   ```

3. Добавь пункт в `Local changes:` README кита (шаг 5).

Другие правки файлов кита запрещены. Нужно поведение, которого нет, —
спроси ведущую сессию.

## 8. Проверки

```bash
npm run lint
npm run lint:oxlint
npm run lint:architecture
npm run budget:next
```

Что уже настроено (не меняй):

| Гейт | Как пропускает vendor |
| --- | --- |
| Oxlint | `ignorePatterns` в `.oxlintrc.json` |
| React Doctor | `doctor.config.json` (`src/vendor/**`) и `scripts/react-doctor-changed.mjs` |
| CSS `:root` | `VENDORED_UI` в `scripts/check-css-architecture.mjs` |
| Токены анимаций | исключение `src/vendor` в `tests/motion-tokens.test.mjs` |
| Долг (`!`, `as any`) | `config/source-debt-budgets.json` |
| Размер функций | `config/function-size-budgets.json` |

Падает `check-source-debt` или `check-function-size-budgets` на новом
файле кита — добавь этот файл в соответствующий JSON с текущим числом.
Свой код (не vendor) в эти бюджеты не добавляй: исправь код.

Падает `budget:next` (страница стала тяжелее) — сначала вынеси компонент в
ленивый чанк (`lazy(() => import(...))`). Не помогло — создай
`config/next-bundle-budgets/approvals/<slug>.json`:

```json
{
  "reason": "Что добавлено и почему без этого нельзя (по-русски).",
  "routes": {
    "/standard/archetypes/": { "jsGzipBytes": 1024, "cssGzipBytes": 256 }
  }
}
```

Числа — сколько вырос маршрут по отчёту `budget:next`, округлённые вверх.
Файлы в `config/next-bundle-budgets/baselines/` и
`config/next-bundle-budgets.json` не меняй.

## Сделано, если

- [ ] Компонент взят из таблицы шага 1.
- [ ] Новых файлов вне `src/vendor/<kit>/` от кита нет.
- [ ] README кита обновлён (если копировал).
- [ ] Каждая правка кита начинается с `// HearthPulse:`.
- [ ] Импортирована одна база: `varylo-ui/styles/index.css`.
- [ ] Компонент обёрнут в класс темы из таблицы шага 6.
- [ ] Все 4 команды шага 8 зелёные.
