# Как помочь Manacost Arena

Спасибо за интерес к проекту. Manacost Arena — production-сервис, поэтому даже
небольшое изменение должно сохранять корректность данных, скорость интерфейса,
адаптивность и возможность безопасного отката.

## Перед началом

1. Проверьте существующие issues и открытые pull requests.
2. Для ошибки приложите публичный URL и минимальные шаги воспроизведения.
3. Не публикуйте токены, cookies, содержимое `.env`, персональные данные и
   приватные ответы API.
4. Уязвимости сообщайте через
   [GitHub Private Vulnerability Reporting](https://github.com/Manacost-Labs/HeartPulse/security/advisories/new),
   а не через публичный issue.

## Локальная разработка

```bash
git clone https://github.com/Manacost-Labs/HeartPulse.git
cd manacost-arena
npm ci
cp .env.example .env
npm run dev
```

Node.js 22+ обязателен. Большинство страниц может работать на сохранённых
snapshots без внешних ключей; не добавляйте тестовые секреты в репозиторий.

## Перед pull request

Запустите единый gate:

```bash
npm run verify:ci
```

Для изменений зависимостей или security-контура дополнительно полезны:

```bash
npm run security:gitleaks
npm run security:semgrep
npm run quality:knip
```

GitHub повторно выполнит CI, CodeQL, Gitleaks, OSV-Scanner, Trivy, Dependency
Review и OpenSSF Scorecard. Не отключайте проверку ради зелёного статуса:
исправьте причину либо явно документируйте подтверждённое исключение.

## Pull request

- Делайте одну законченную тему на PR.
- Объясняйте пользовательский результат, риск и способ отката.
- Добавляйте тест, воспроизводящий исправленную ошибку.
- Для UI проверяйте 320, 375, 768, 1024 и 1440 px, клавиатуру и axe.
- Для нового источника данных сохраняйте provenance, время обновления и
  устойчивый snapshot на случай отказа upstream.

Архитектура, production-релизы и дизайн-контракты описаны в
[README.md](README.md), [DEPLOYMENT.md](DEPLOYMENT.md),
[STABILIZATION.md](STABILIZATION.md) и [assets.md](assets.md).
