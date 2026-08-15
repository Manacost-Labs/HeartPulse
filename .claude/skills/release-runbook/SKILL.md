---
name: release-runbook
description: Использовать при выпуске релиза, откате, проверке здоровья прода или восстановлении из бэкапа. Выжимка из DEPLOYMENT.md — команды и порядок. Полные подробности и предостережения остаются в DEPLOYMENT.md.
---

# Релиз и откат

Прод — immutable-релизы: `releases/<sha>` + атомарное переключение симлинка
`current`, systemd-юнит `hs-arena.service`, nginx перед ним.
Корень: `/var/www/koloda/data/www/hs-arena.ru/`.

**Не правь `deploy/`, `scripts/deploy-release.sh`, `scripts/create-release.mjs`
без отдельного запроса.**

## Сборка релиза

Из чистого `main`:

```bash
sha=$(git rev-parse HEAD)
sudo -u koloda env RELEASE_SHA="$sha" npm run verify:ci
artifact=$(mktemp -d "/tmp/hs-arena-${sha}.XXXXXX"); rmdir "$artifact"
npm run release:create -- --output="$artifact" --sha="$sha"
```

`RELEASE_SHA` вкомпилируется в entry-чанк Vite; `release:create` отвергнет
бандл без запрошенного SHA.

## Проверка nginx-контракта перед деплоем

Строго read-only, ничего не устанавливает:

```bash
sudo node "$artifact/scripts/verify-nginx-contract.mjs" \
  --release="$artifact" --installed-root=/ --role=origin
```

`0` — совпало, `1` — дрейф на хосте, `2` — артефакт повреждён или легаси.
Никогда не используй верификатор как инсталлятор.

## Деплой

```bash
sudo scripts/deploy-release.sh "$artifact"
```

Деплойер сам прогоняет верификатор, берёт блокировку, ставит прод-зависимости
от имени `koloda`, атомарно переключает `current`, рестартует сервис, ждёт
readiness на порту 3101 и **сам откатывается**, если readiness не прошёл.

Изменённый `nginxContract.hash` блокируется по умолчанию. Разблокировать —
только после установки конфигурации, зелёного `nginx -t` и явного ревью
совместимости N/N-1:

```bash
sudo ALLOW_NGINX_CONTRACT_CHANGE=1 scripts/deploy-release.sh "$artifact"
```

## Откат

```bash
sudo scripts/deploy-release.sh \
  "$(readlink -f /var/www/koloda/data/www/hs-arena.ru/previous)"
```

Откат переключает **только симлинк релиза**. `/etc/nginx` он не откатывает,
поэтому изменённый nginx-контракт обязан оставаться совместимым с версиями
N и N-1.

## Проверка здоровья

```bash
readlink -f /var/www/koloda/data/www/hs-arena.ru/current
systemctl is-active hs-arena.service
curl -fsS https://arena.hs-manacost.ru/api/health/live
curl -fsS https://arena.hs-manacost.ru/api/health/ready
curl -fsS https://arena.hs-manacost.ru/api/health/data
sudo systemctl list-timers 'hs-arena-backup*'
sudo systemctl list-timers 'hs-arena-scraper*'
npm run qa:e2e
```

## Бэкапы

Зашифрованные бэкапы изменяемых данных и off-site SSH-репликация описаны в
`DEPLOYMENT.md`, разделы «Encrypted mutable-data backups» и «Off-site SSH
replication». Проверка процедуры — `npm run test:backup`.

## Чего не делать

- Не деплоить с красным `verify:ci`.
- Не называть релиз rollback-safe, если nginx-контракты N и N-1 расходятся
  без ревью совместимости.
- Не редактировать файлы внутри `releases/<sha>` — они root-owned и read-only
  намеренно.
- Не запускать деплой из грязного рабочего дерева.
