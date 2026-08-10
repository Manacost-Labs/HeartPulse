# Спецификация: приоритетная загрузка изображений каталога карт

## Цель

Ускорить появление карт в `/standard/cards/` и `/standard/cards/wild` на ограниченной
сети без снижения качества самих изображений. Первая видимая строка должна
начинать загрузку сразу, а изображения вдали от viewport не должны конкурировать
с ней за пропускную способность.

## Технологии и структура

- React 19 и TypeScript 5.8;
- `src/features/StandardCards.tsx` — галерея каталога;
- `src/features/cardGalleryImageLoading.ts` — чистая политика количества
  приоритетных изображений и активации отложенного `src`;
- `tests/card-catalog-image-loading.test.ts` — unit и source-contract проверки.

## Контракт качества

- thumbnail остаётся текущим WebP `360×497`, quality 86;
- full-size остаётся текущим WebP quality 90 шириной до 512 px без увеличения
  исходника;
- ссылка скачивания и hover/focus prefetch продолжают использовать full-size;
- размеры, aspect ratio, подписи и интерактивная область карточки не меняются;
- первая строка получает `loading="eager"` и `fetchPriority="high"`;
- остальные изображения получают реальный `src` только на расстоянии 320 px
  от viewport, после чего загружаются с низким сетевым приоритетом;
- если `IntersectionObserver` недоступен, остаётся безопасный native-lazy
  fallback со всеми настоящими URL.

## Responsive-политика

Количество приоритетных изображений совпадает с CSS-сеткой:

- до 640 px — 2;
- 641–900 px — 4;
- 901–1240 px — 5;
- шире 1240 px — 6.

После изменения размера окна дополнительные изображения активируются обычным
observer-путём; уже загруженные изображения не сбрасываются.

## Команды проверки

```bash
npx tsx tests/card-catalog-image-loading.test.ts
npm run test:constructed-card-media
npm run test:constructed-card-routes
npm run lint
npm run build
npm run security:semgrep
npm run lint:react-changed
npm run qa:responsive
```

После локальных проверок обязательны desktop/mobile smoke, console/network/a11y
проверка и повторный Fast 4G замер в реальном Chrome.

## Границы

### Всегда

- сохранять CDN-to-origin fallback;
- резервировать intrinsic-размер `360×497`, чтобы не ухудшить CLS;
- измерять число запросов и время появления первой карты до и после;
- обновить `CHANGELOG.md` и иметь готовый откат предыдущего release.

### Никогда

- не снижать качество или разрешение текущих thumbnail/full вариантов;
- не менять API маршруты, серверный image cache или региональные Nginx maps;
- не загружать дальние изображения с высоким приоритетом;
- не скрывать ошибку CDN: `onError` должен вернуть изображение на origin.

## Критерии готовности

- первая строка карт визуально идентична текущей и загружается раньше;
- холодная desktop-загрузка не запускает десятки карточных запросов сразу;
- mobile DPR2 продолжает получать те же 360 px thumbnails;
- прокрутка догружает все последующие карты без пропусков;
- full-size просмотр и скачивание не изменились;
- unit, contract, TypeScript, build, security и browser QA проходят.
