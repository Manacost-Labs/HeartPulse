import { useEffect, useRef, useState } from 'react';
import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import type { ContestEntry } from '../../ContestAdminContests';
import { authJsonHeaders, errorText, readResponseJson, type AdminMessageSink } from '../adminSectionKit';

/** Entries of the selected contest; switching contests drops the previous list and any late answer for it. */
export function useContestEntries(contestId: string, onMessage: AdminMessageSink) {
  const [entries, setEntries] = useState<ContestEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    if (!contestId) {
      setEntries([]);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setEntries([]);
    setLoading(true);
    fetchWithDeadline(`/api/admin/contests/${encodeURIComponent(contestId)}/entries`, { headers: authJsonHeaders(), signal: controller.signal })
      .then(async response => {
        const data = await readResponseJson(response);
        if (!response.ok) throw new Error(typeof data.error === 'string' && data.error ? data.error : 'Не удалось загрузить заявки');
        if (requestId === requestRef.current && !controller.signal.aborted) {
          setEntries(Array.isArray(data.entries) ? data.entries as ContestEntry[] : []);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId !== requestRef.current) return;
        onMessage({ type: 'err', text: errorText(error, 'Не удалось загрузить заявки') });
      })
      .finally(() => {
        if (requestId === requestRef.current && !controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [contestId, onMessage]);

  return { entries, loading };
}
