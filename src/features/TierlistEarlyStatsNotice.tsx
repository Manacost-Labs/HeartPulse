import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface TierlistEarlyStatsNoticeProps {
  provisional?: boolean;
}

export default function TierlistEarlyStatsNotice({ provisional }: TierlistEarlyStatsNoticeProps) {
  if (!provisional) return null;

  return (
    <div
      className="tierlist-early-stats-notice"
      role="status"
      aria-live="polite"
    >
      <AlertTriangle aria-hidden="true" size={18} />
      <p>
        <strong>Ранняя статистика после балансного патча.</strong>{' '}
        Данных пока мало, показатели могут быстро меняться.
      </p>
    </div>
  );
}
