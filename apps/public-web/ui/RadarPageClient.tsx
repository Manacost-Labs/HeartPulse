'use client';

import { useEffect, useState } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { RadarDisclaimer, RadarSkeleton, RadarUnavailable, RadarView, isRadarReport, type RadarReport } from '@/src/modules/radar/public';
import { fetchWithDeadline } from '@/src/shared/http/fetchWithDeadline';
import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/** Радар нерфов и баффов: сервер кладёт в HTML то, что успел прочитать, остальное грузит браузер. */
export function RadarPageClient({ initial }: { initial: RadarReport | null }) {
  const access = usePublicAccess();
  const [report, setReport] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (report || failed) return undefined;
    const controller = new AbortController();
    void fetchWithDeadline('/api/radar', { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then(value => {
        if (!isRadarReport(value)) throw new Error('Unexpected radar response');
        if (!controller.signal.aborted) setReport(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [report, failed, attempt]);

  return <PublicPageShell activeTab="radar" pathname="/standard/radar/" access={access} navigate={navigate} wide>
    <section className="radar-page space-y-4">
      <SectionBanner title="Радар нерфов и баффов"
        subtitle="Какие карты и архетипы Стандарта могут ослабить или усилить в следующем балансном патче: статистика и голоса сообщества" />
      <RadarDisclaimer />
      {report
        ? <RadarView report={report} />
        : failed
          ? <RadarUnavailable onRetry={() => { setFailed(false); setAttempt(value => value + 1); }} />
          : <RadarSkeleton />}
    </section>
  </PublicPageShell>;
}
