import React from 'react';
import { Skeleton } from '../../vendor/valyro-ui/basic/Skeleton';
import './AdminTableSkeleton.css';

/**
 * Placeholder rows of an admin table while its first page loads. It takes about the height of
 * the rows that replace it, so the toolbar and pager above and below do not jump.
 */
export function AdminTableSkeleton({ label, rows = 8, rowHeight = 64 }: { label: string; rows?: number; rowHeight?: number }) {
  return (
    <div className="admin-table-skeleton" role="status" aria-busy="true">
      <span className="admin-crm-sr-only">{label}</span>
      <Skeleton height={44} radius={0} />
      {Array.from({ length: rows }, (_, index) => (
        <div className="admin-table-skeleton__row" key={index} style={{ minHeight: rowHeight }} aria-hidden="true">
          <Skeleton circle height={32} />
          <span><Skeleton height={14} width="55%" /><Skeleton height={12} width="35%" /></span>
          <Skeleton height={22} width={110} radius={11} />
          <Skeleton height={14} width="70%" />
        </div>
      ))}
    </div>
  );
}
