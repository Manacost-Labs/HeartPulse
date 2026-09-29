import React from 'react';
import type { AdminCrmSegmentId, AdminCrmSegments } from '../api/adminCrmClient';
import '../adminCrm.css';

export type AdminSegmentBarProps = {
  data: AdminCrmSegments | null;
  segment: AdminCrmSegmentId;
  tag: string;
  disabled?: boolean;
  onChange: (next: { segment: AdminCrmSegmentId; tag: string }) => void;
};

// aria-disabled keeps the pressed chip focusable while the list reloads.
/** Segment and tag filters for the people list; counts come from GET /api/admin/crm/segments. */
const format = (count: number) => count.toLocaleString('ru-RU');

export function AdminSegmentBar({ data, segment, tag, disabled = false, onChange }: AdminSegmentBarProps) {
  return (
    <div className="admin-crm-segments">
      <div role="group" aria-label="Сегменты пользователей" className="admin-crm-segment-row">
        {(data?.segments ?? [{ id: 'all' as const, label: 'Все', count: NaN }]).map(item => (
          <button
            key={item.id}
            type="button"
            className="admin-crm-segment"
            aria-pressed={segment === item.id && !tag}
            aria-disabled={disabled}
            onClick={() => { if (!disabled) onChange({ segment: item.id, tag: '' }); }}
          >
            {item.label}
            {Number.isFinite(item.count) && <span>{format(item.count)}</span>}
          </button>
        ))}
      </div>
      {Boolean(data?.tags.length) && (
        <div role="group" aria-label="Теги" className="admin-crm-segment-row is-tags">
          {data?.tags.map(item => (
            <button
              key={item.tag}
              type="button"
              className="admin-crm-segment is-tag"
              aria-pressed={tag === item.tag}
              aria-disabled={disabled}
              onClick={() => { if (!disabled) onChange({ segment: 'all', tag: tag === item.tag ? '' : item.tag }); }}
            >
              #{item.tag}<span>{format(item.count)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
