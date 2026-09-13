import type { ReactNode } from 'react';

export type AdminOperationsMetric = {
  label: string;
  value: ReactNode;
  detail?: string;
};

type AdminOperationsHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  statusTone?: 'ready' | 'attention' | 'working';
  metrics: AdminOperationsMetric[];
  actions?: ReactNode;
};

export function AdminOperationsHeader({
  eyebrow,
  title,
  description,
  status,
  statusTone = 'ready',
  metrics,
  actions,
}: AdminOperationsHeaderProps) {
  return (
    <header className="admin-operations-header">
      <div className="admin-operations-heading">
        <div>
          <span className="admin-operations-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
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
