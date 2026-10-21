# MetricComparison: custom badge and chart per metric

- Files: `charts/MetricComparison.tsx`
- Change: a metric may carry `badge` (its own text, colour and arrow instead
  of the percentage change, e.g. «#1 надёжнее» for a sample size) and
  `chart` (its own bars, e.g. two confidence intervals on a shared axis).
- Why: build and archetype comparisons on the archetype page, where a
  percentage change does not describe every row.
- Upstream: not submitted; carry it over when the file is re-copied from the registry.
