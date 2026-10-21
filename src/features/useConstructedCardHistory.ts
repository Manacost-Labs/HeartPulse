import { useEffect, useState } from 'react';
import type { ConstructedCardPeriod, ConstructedCardRank } from './constructedCardPeriods';
import type { ConstructedCardHistoryPoint, ConstructedCardHistoryReference } from './constructedCardHistoryModel';

type ConstructedCardHistoryOptions = {
  cardId: string;
  format: 'standard' | 'wild';
  period: ConstructedCardPeriod;
  rank: ConstructedCardRank;
  enabled: boolean;
};

export function useConstructedCardHistory({
  cardId,
  format,
  period,
  rank,
  enabled,
}: ConstructedCardHistoryOptions) {
  const [days, setDays] = useState(90);
  const [points, setPoints] = useState<ConstructedCardHistoryPoint[]>([]);
  const [trackedSince, setTrackedSince] = useState<string | null>(null);
  const [references, setReferences] = useState<ConstructedCardHistoryReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const loadHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          format,
          period,
          rank,
          days: String(days),
        });
        const response = await fetch(
          `/api/constructed-cards/${encodeURIComponent(cardId)}/history?${params}`,
          {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить историю');
        setPoints(Array.isArray(payload.points) ? payload.points : []);
        setTrackedSince(typeof payload.trackedSince === 'string' ? payload.trackedSince : null);
        setReferences(Array.isArray(payload.references) ? payload.references : []);
      } catch (historyLoadError) {
        if (!controller.signal.aborted) {
          setPoints([]);
          setReferences([]);
          setError(historyLoadError instanceof Error
            ? historyLoadError.message
            : 'Не удалось загрузить историю');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadHistory();
    return () => controller.abort();
  }, [cardId, days, enabled, format, period, rank]);

  return {
    days,
    setDays,
    points,
    trackedSince,
    references,
    loading,
    error,
  };
}
