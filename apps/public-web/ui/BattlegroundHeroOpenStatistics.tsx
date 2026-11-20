'use client';

import { BattlegroundHeroStatistics } from '@/src/features/BattlegroundHeroStatistics';
import { PaidMetricLock } from '@/src/shared/ui/PaidLocks';
import type { PublicBattlegroundHeroStats } from '@/apps/public-web/lib/publicBattlegroundHeroStats';
import { BattlegroundHeroPublicStats } from './BattlegroundHeroPublicStats';

/** A paid analytics view of the tab: the lock in its place (`paywalled-hero` is the closed part of the page's JSON-LD). */
function Locked({ label }: { label: string }) {
  return <p className="bg-hero-open-lock"><PaidMetricLock variant="card" closed="paywalled-hero" label={label} /></p>;
}

/**
 * The subscriber's statistics block for a viewer without access: the same four tabs. «Обзор» has the open figures
 * of the base range; the distribution of places, combat, the hero power and tavern by turn and the compositions
 * with their metrics are locks that open the subscription offer.
 */
export function BattlegroundHeroOpenStatistics({ stats }: { stats: PublicBattlegroundHeroStats | null }) {
  return <BattlegroundHeroStatistics
    description="Рейтинг «Топ 50%», Соло и Дуо."
    overview={<>
      {stats ? <BattlegroundHeroPublicStats stats={stats} /> : null}
      <Locked label="Распределение мест и бои по ходам" />
    </>}
    power={<Locked label="Сила героя по ходам и уровням таверны" />}
    tavern={<Locked label="Повышение таверны по ходам" />}
    compositions={<Locked label="Составы героя с местами и винрейтом" />}
  />;
}
