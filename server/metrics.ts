import express from 'express';
import type { DataHealthReport } from './health.js';
import type { ArenaDraftRefreshMetric } from './arenaDraftRefreshPipeline.js';

const DURATION_BUCKETS_SECONDS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const REFRESH_DURATION_BUCKETS_SECONDS = [1, 2.5, 5, 10, 30, 60, 120];

export interface HttpMetricObservation {
  method: string;
  route: string;
  status: number;
  durationMs: number;
}

interface DurationAggregate {
  count: number;
  sumSeconds: number;
  buckets: number[];
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function labels(values: Record<string, string>): string {
  return `{${Object.entries(values).map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(',')}}`;
}

function statusClass(status: number): string {
  return `${Math.max(1, Math.min(5, Math.floor(status / 100)))}xx`;
}

export class HttpMetrics {
  private activeRequests = 0;
  private readonly requestTotals = new Map<string, { method: string; route: string; statusClass: string; count: number }>();
  private readonly durations = new Map<string, { method: string; route: string; aggregate: DurationAggregate }>();
  private readonly refreshTotals = new Map<string, {
    status: ArenaDraftRefreshMetric['status'];
    trigger: ArenaDraftRefreshMetric['trigger'];
    aggregate: DurationAggregate;
  }>();
  private refreshLastSuccessTimestampSeconds = 0;
  private refreshSourceRows = 0;
  private refreshPublishedClasses = 0;

  requestStarted(): void {
    this.activeRequests += 1;
  }

  requestFinished(observation: HttpMetricObservation): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    const method = observation.method.slice(0, 16).toUpperCase();
    const route = observation.route.slice(0, 160);
    const responseClass = statusClass(observation.status);
    const totalKey = JSON.stringify([method, route, responseClass]);
    const currentTotal = this.requestTotals.get(totalKey);
    if (currentTotal) currentTotal.count += 1;
    else this.requestTotals.set(totalKey, { method, route, statusClass: responseClass, count: 1 });

    const durationKey = JSON.stringify([method, route]);
    let duration = this.durations.get(durationKey);
    if (!duration) {
      duration = {
        method,
        route,
        aggregate: { count: 0, sumSeconds: 0, buckets: DURATION_BUCKETS_SECONDS.map(() => 0) },
      };
      this.durations.set(durationKey, duration);
    }
    const seconds = Math.max(0, observation.durationMs / 1000);
    duration.aggregate.count += 1;
    duration.aggregate.sumSeconds += seconds;
    DURATION_BUCKETS_SECONDS.forEach((bucket, index) => {
      if (seconds <= bucket) duration!.aggregate.buckets[index] += 1;
    });
  }

  arenaDraftRefreshFinished(observation: ArenaDraftRefreshMetric): void {
    const key = JSON.stringify([observation.status, observation.trigger]);
    let metric = this.refreshTotals.get(key);
    if (!metric) {
      metric = {
        status: observation.status,
        trigger: observation.trigger,
        aggregate: {
          count: 0,
          sumSeconds: 0,
          buckets: REFRESH_DURATION_BUCKETS_SECONDS.map(() => 0),
        },
      };
      this.refreshTotals.set(key, metric);
    }
    const seconds = Math.max(0, observation.durationMs / 1000);
    metric.aggregate.count += 1;
    metric.aggregate.sumSeconds += seconds;
    REFRESH_DURATION_BUCKETS_SECONDS.forEach((bucket, index) => {
      if (seconds <= bucket) metric!.aggregate.buckets[index] += 1;
    });
    if (observation.status === 'succeeded') {
      this.refreshLastSuccessTimestampSeconds = Math.floor(Date.parse(observation.finishedAt) / 1000);
      this.refreshSourceRows = Math.max(0, Math.floor(observation.sourceRows));
      this.refreshPublishedClasses = Math.max(0, Math.floor(observation.publishedClassCount));
    }
  }

  render(dataHealth: DataHealthReport, release: string): string {
    const lines = [
      '# HELP hs_arena_http_requests_active Requests currently being handled.',
      '# TYPE hs_arena_http_requests_active gauge',
      `hs_arena_http_requests_active ${this.activeRequests}`,
      '# HELP hs_arena_http_requests_total Completed HTTP requests by bounded route template and status class.',
      '# TYPE hs_arena_http_requests_total counter',
    ];

    for (const metric of [...this.requestTotals.values()].sort((a, b) => `${a.route}${a.method}${a.statusClass}`.localeCompare(`${b.route}${b.method}${b.statusClass}`))) {
      lines.push(`hs_arena_http_requests_total${labels({ method: metric.method, route: metric.route, status_class: metric.statusClass })} ${metric.count}`);
    }

    lines.push(
      '# HELP hs_arena_http_request_duration_seconds HTTP request duration histogram.',
      '# TYPE hs_arena_http_request_duration_seconds histogram',
    );
    for (const metric of [...this.durations.values()].sort((a, b) => `${a.route}${a.method}`.localeCompare(`${b.route}${b.method}`))) {
      const base = { method: metric.method, route: metric.route };
      DURATION_BUCKETS_SECONDS.forEach((bucket, index) => {
        lines.push(`hs_arena_http_request_duration_seconds_bucket${labels({ ...base, le: String(bucket) })} ${metric.aggregate.buckets[index]}`);
      });
      lines.push(`hs_arena_http_request_duration_seconds_bucket${labels({ ...base, le: '+Inf' })} ${metric.aggregate.count}`);
      lines.push(`hs_arena_http_request_duration_seconds_sum${labels(base)} ${metric.aggregate.sumSeconds.toFixed(6)}`);
      lines.push(`hs_arena_http_request_duration_seconds_count${labels(base)} ${metric.aggregate.count}`);
    }

    lines.push(
      '# HELP hs_arena_draft_refresh_total Completed Arena draft model refreshes.',
      '# TYPE hs_arena_draft_refresh_total counter',
    );
    for (const metric of [...this.refreshTotals.values()].sort((a, b) => `${a.status}${a.trigger}`.localeCompare(`${b.status}${b.trigger}`))) {
      const base = { status: metric.status, trigger: metric.trigger };
      lines.push(`hs_arena_draft_refresh_total${labels(base)} ${metric.aggregate.count}`);
    }
    lines.push(
      '# HELP hs_arena_draft_refresh_duration_seconds Arena draft model refresh duration.',
      '# TYPE hs_arena_draft_refresh_duration_seconds histogram',
    );
    for (const metric of [...this.refreshTotals.values()].sort((a, b) => `${a.status}${a.trigger}`.localeCompare(`${b.status}${b.trigger}`))) {
      const base = { status: metric.status, trigger: metric.trigger };
      REFRESH_DURATION_BUCKETS_SECONDS.forEach((bucket, index) => {
        lines.push(`hs_arena_draft_refresh_duration_seconds_bucket${labels({ ...base, le: String(bucket) })} ${metric.aggregate.buckets[index]}`);
      });
      lines.push(`hs_arena_draft_refresh_duration_seconds_bucket${labels({ ...base, le: '+Inf' })} ${metric.aggregate.count}`);
      lines.push(`hs_arena_draft_refresh_duration_seconds_sum${labels(base)} ${metric.aggregate.sumSeconds.toFixed(6)}`);
      lines.push(`hs_arena_draft_refresh_duration_seconds_count${labels(base)} ${metric.aggregate.count}`);
    }
    lines.push(
      '# HELP hs_arena_draft_refresh_last_success_timestamp_seconds Unix timestamp of the last successful Arena draft model refresh.',
      '# TYPE hs_arena_draft_refresh_last_success_timestamp_seconds gauge',
      `hs_arena_draft_refresh_last_success_timestamp_seconds ${this.refreshLastSuccessTimestampSeconds}`,
      '# HELP hs_arena_draft_refresh_source_rows Source rows in the last successfully published Arena draft model.',
      '# TYPE hs_arena_draft_refresh_source_rows gauge',
      `hs_arena_draft_refresh_source_rows ${this.refreshSourceRows}`,
      '# HELP hs_arena_draft_refresh_published_classes Classes in the last successfully published Arena draft model.',
      '# TYPE hs_arena_draft_refresh_published_classes gauge',
      `hs_arena_draft_refresh_published_classes ${this.refreshPublishedClasses}`,
    );

    lines.push(
      '# HELP hs_arena_ready Whether all required datasets are valid enough to serve traffic.',
      '# TYPE hs_arena_ready gauge',
      `hs_arena_ready ${dataHealth.ready ? 1 : 0}`,
      '# HELP hs_arena_data_fresh Whether every required dataset is inside the freshness SLO.',
      '# TYPE hs_arena_data_fresh gauge',
      `hs_arena_data_fresh ${dataHealth.fresh ? 1 : 0}`,
      '# HELP hs_arena_dataset_age_seconds Age of each required dataset; -1 means unavailable.',
      '# TYPE hs_arena_dataset_age_seconds gauge',
    );
    for (const dataset of dataHealth.datasets) {
      lines.push(`hs_arena_dataset_age_seconds${labels({ dataset: dataset.name, state: dataset.state })} ${dataset.ageMs === null ? -1 : Math.floor(dataset.ageMs / 1000)}`);
    }
    lines.push(
      '# HELP hs_arena_release_info Active immutable release.',
      '# TYPE hs_arena_release_info gauge',
      `hs_arena_release_info${labels({ release: release || 'development' })} 1`,
      '',
    );
    return lines.join('\n');
  }
}

interface MetricsRouterOptions {
  metrics: HttpMetrics;
  getDataHealth: () => DataHealthReport;
  getRelease?: () => string;
}

export function createMetricsRouter(options: MetricsRouterOptions): express.Router {
  const router = express.Router();
  router.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('text/plain; version=0.0.4; charset=utf-8');
    res.send(options.metrics.render(options.getDataHealth(), options.getRelease?.() || 'development'));
  });
  return router;
}
