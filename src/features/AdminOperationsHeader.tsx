import type { ReactNode } from 'react';

export type AdminOperationsMetric = {
  label: string;
  value: ReactNode;
  detail?: string;
};

// The workspace shell already renders the section title; this header starts with what the section is for.
type AdminOperationsHeaderProps = {
  description: string;
  status: string;
  statusTone?: 'ready' | 'attention' | 'working';
  metrics: AdminOperationsMetric[];
  actions?: ReactNode;
};

export function AdminOperationsHeader({
  description,
  status,
  statusTone = 'ready',
  metrics,
  actions,
}: AdminOperationsHeaderProps) {
  return (
    <header className="admin-operations-header">
      <div className="admin-operations-heading">
        <p>{description}</p>
        <div className="admin-operations-command">
          <span className={`admin-operations-status is-${statusTone}`} role="status">
            <i aria-hidden="true" />
            {status}
          </span>
          {actions && <div className="admin-operations-actions">{actions}</div>}
        </div>
      </div>
      <dl className="admin-operations-metrics">
        {metrics.map(metric => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd className="admin-operations-metric-value">{metric.value}</dd>
            {metric.detail && <dd className="admin-operations-metric-detail">{metric.detail}</dd>}
          </div>
        ))}
      </dl>
    </header>
  );
}
