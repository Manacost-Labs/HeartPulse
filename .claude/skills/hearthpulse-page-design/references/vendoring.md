<!-- markdownlint-disable-file MD013 -->

# Как добавить компонент VaryloUI или Valyro

Это библиотеки владельца. Они не ставятся из npm (пакета `valyro-ui-pro`
нет): файлы копируются из локального реестра в `src/vendor/`.

| Кит | Реестр | Куда |
| --- | --- | --- |
| VaryloUI | `/home/debian/varylo-ui-release/r/<item>.json` | `src/vendor/varylo-ui/` |
| Valyro (free) | `/home/debian/valyro-ui-release/r/<item>.json` | `src/vendor/valyro-ui/` |
| Valyro Pro | `/home/debian/valyro-pro-registry/<item>.json` | `src/vendor/valyro-ui/` |

## Шаг 0. Может, уже есть

```bash
find src/vendor -iname '<Component>*.tsx'
```

Уже вендорены: DataTable, KpiGroup, ConfidenceBandChart, Heatmap,
RadarChart, ScatterChart, Treemap, MatchupMatrix, MetaTable, Sparkline,
TrendValue, Leaderboard, TierList, PatchNotes (VaryloUI); MetricComparison,
SankeyChart, Combobox, PageTransition (Valyro). Есть — используй, второй
копии не делай.

## Шаг 1. Посмотри, что в item

```bash
python3 - <<'EOF'
import json
item = json.load(open('/home/debian/valyro-pro-registry/metric-comparison.json'))
print(item['name'], item.get('registryDependencies'))
for f in item['files']:
    print(f['path'], len(f.get('content', '')))
EOF
```

Пути файлов уже начинаются с имени кита (`valyro-ui/charts/…`,
`varylo-ui/charts/…`). `registryDependencies` — другие item'ы того же
реестра (последняя часть URL без `.json`).

## Шаг 2. Скопируй файлы (только отсутствующие)

```bash
python3 - <<'EOF'
import json, os, sys
REG = '/home/debian/valyro-pro-registry'      # или .../varylo-ui-release/r
ITEM = 'metric-comparison'
item = json.load(open(f'{REG}/{ITEM}.json'))
for f in item['files']:
    target = os.path.join('src/vendor', f['path'])
    if os.path.exists(target):
        print('есть, не трогаю:', target); continue
    os.makedirs(os.path.dirname(target), exist_ok=True)
    open(target, 'w').write(f['content'])
    print('добавлен:', target)
EOF
```

Повтори для каждой зависимости из `registryDependencies`, которой ещё нет.
Не копируй `styles/themes/*.css` и `styles/tailwind.css`.

## Шаг 3. Стили и тема

- Базовые стили подключай один раз: `import '../vendor/varylo-ui/styles/index.css';`.
  Вторую копию базы из `valyro-ui/styles` в чанк страницы не клади — она
  перебьёт правила страницы.
- Оберни компонент в класс темы и подключи её CSS (см. шаблон 9 в
  `snippets.md`): `archetypeVaryloTheme.css`, `varyloParchment.css` или
  `StandardMetaVarylo.css`.

## Шаг 4. Если файл не компилируется в проекте

В проекте `strict: false`; иногда нужна правка типа. Правь минимально и
помечай:

```ts
// HearthPulse: <почему> — без этого <что ломается>.
```

Добавь строку в раздел «Local changes» в `src/vendor/<kit>/README.md`.

## Шаг 5. Проверки после вендоринга

```bash
npm run lint && npm run lint:oxlint      # vendor пропускается, свой код — нет
npm run lint:architecture                # CSS :root, function-size
npm run budget:next                      # байты бандла
```

Унаследованный долг кита (например, non-null assertions) — в
`config/source-debt-budgets.json`, а не правкой файлов кита.
