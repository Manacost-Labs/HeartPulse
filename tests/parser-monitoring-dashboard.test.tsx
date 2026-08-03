import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataHealthOverviewCard } from '../src/features/adminParserControl/DataHealthOverviewCard.js';
import { buildParserMonitoringSnapshot } from '../src/features/adminParserControl/monitoring.js';
import { normalizeParserControl } from '../src/features/adminParserControl/normalize.js';

const snapshot = normalizeParserControl({
  generatedAt: '2026-08-03T12:00:00Z',
  policy: { mode: 'stable' },
  sections: [
    {
      id: 'constructed',
      label: 'Традиционный режим',
      sources: [
        {
          id: 'cards-standard',
          label: 'Карты стандарта',
          status: 'healthy',
          lastSuccessAt: '2026-08-03T11:58:00Z',
          publishedFetchedAt: '2026-08-03T11:58:00Z',
          itemCount: 1152,
          publicationChannel: 'stable',
        },
        {
          id: 'hsguru-meta',
          label: 'Матрица матчапов',
          status: 'warning',
          state: 'partial',
          lastSuccessAt: '2026-08-03T10:00:00Z',
          publishedFetchedAt: '2026-08-03T10:00:00Z',
          itemCount: 648,
          publicationChannel: 'stable_baseline',
          stableBaselineAvailable: true,
          lastError: `Источник вернул неполный ответ token=super-secret ${'x'.repeat(500)}`,
        },
      ],
    },
    {
      id: 'arena',
      label: 'Арена',
      sources: [
        {
          id: 'arena-tierlist',
          label: 'Тир-лист Арены',
          status: 'error',
          state: 'hard_failed',
          lastAttemptAt: '2026-08-03T11:59:00Z',
          publicationChannel: 'unavailable',
          stableBaselineAvailable: false,
          lastError: 'Свежий снимок не прошёл проверку качества',
        },
      ],
    },
  ],
});

const monitoring = buildParserMonitoringSnapshot(snapshot, Date.parse('2026-08-03T12:00:00Z'));
assert.equal(monitoring.state, 'critical');
assert.equal(monitoring.totalSources, 3);
assert.equal(monitoring.healthySources, 1);
assert.equal(monitoring.degradedSources, 1);
assert.equal(monitoring.failedSources, 1);
assert.equal(monitoring.fallbackSources, 1);
assert.equal(monitoring.attentionSources.length, 2);
assert.equal(monitoring.attentionSources[0]?.id, 'arena-tierlist');
assert.equal(monitoring.attentionSources[1]?.id, 'hsguru-meta');
assert.ok((monitoring.attentionSources[1]?.lastError.length ?? 0) <= 280);
assert.doesNotMatch(monitoring.attentionSources[1]?.lastError ?? '', /super-secret/);
assert.match(monitoring.attentionSources[1]?.lastError ?? '', /секрет скрыт/);
assert.equal(monitoring.attentionSources[1]?.ageMs, 2 * 60 * 60 * 1000);

const markup = renderToStaticMarkup(
  <DataHealthOverviewCard
    snapshot={snapshot}
    refreshing={false}
    onRefresh={() => undefined}
    now={Date.parse('2026-08-03T12:00:00Z')}
  />,
);
assert.match(markup, /Мониторинг данных/);
assert.match(markup, /Требуется вмешательство/);
assert.match(markup, /1 из 3/);
assert.match(markup, /Матрица матчапов/);
assert.match(markup, /Резервная версия/);
assert.match(markup, /Тир-лист Арены/);
assert.match(markup, /Обновить сейчас/);
assert.match(markup, /Автообновление каждые 60 секунд/);
assert.match(markup, /role="status"/);

const refreshingMarkup = renderToStaticMarkup(
  <DataHealthOverviewCard
    snapshot={snapshot}
    refreshing
    onRefresh={() => undefined}
    now={Date.parse('2026-08-03T12:00:00Z')}
  />,
);
assert.match(refreshingMarkup, /Обновляем/);
assert.match(refreshingMarkup, /disabled=""/);

const healthySnapshot = normalizeParserControl({
  generatedAt: '2026-08-03T12:00:00Z',
  policy: { mode: 'stable' },
  sections: [{
    id: 'cards',
    label: 'Карты',
    sources: [
      {
        id: 'cards',
        label: 'Карты',
        status: 'healthy',
        publishedFetchedAt: '2026-08-03T11:59:00Z',
        publicationChannel: 'stable',
      },
      {
        id: 'paused-fallback',
        label: 'Отключённый источник',
        enabled: false,
        status: 'warning',
        publicationChannel: 'stable_baseline',
      },
    ],
  }],
});
const healthyMonitoring = buildParserMonitoringSnapshot(healthySnapshot, Date.parse('2026-08-03T12:00:00Z'));
assert.equal(healthyMonitoring.state, 'healthy');
assert.equal(healthyMonitoring.fallbackSources, 0);
assert.equal(healthyMonitoring.pausedSources, 1);
const healthyMarkup = renderToStaticMarkup(
  <DataHealthOverviewCard
    snapshot={healthySnapshot}
    refreshing={false}
    onRefresh={() => undefined}
    now={Date.parse('2026-08-03T12:00:00Z')}
  />,
);
assert.match(healthyMarkup, /Все источники работают штатно/);
assert.doesNotMatch(healthyMarkup, /Требуют внимания/);

console.log('parser monitoring dashboard tests passed');
