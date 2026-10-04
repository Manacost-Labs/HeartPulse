import React from 'react';
import { AsyncSurfaceState } from './recovery/RecoverableSurface';

const StandardMetaChart = React.lazy(() => import('./StandardMetaChart'));

/**
 * The meta chart behind its loader. Memoized on purpose: the server renders
 * the chart, and an update that reaches its Suspense boundary before the lazy
 * chunk has loaded (the account check finishing) makes React drop the server
 * HTML and show the fallback.
 */
const StandardMetaChartSection = React.memo(function StandardMetaChartSection(
  props: React.ComponentProps<typeof StandardMetaChart>,
) {
  return (
    <React.Suspense fallback={(
      <AsyncSurfaceState variant="loading" title="Подготавливаем карту меты" compact className="standard-meta-chart-loading" />
    )}>
      <StandardMetaChart {...props} />
    </React.Suspense>
  );
});

export default StandardMetaChartSection;
