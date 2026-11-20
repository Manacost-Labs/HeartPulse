'use client';

import { useMemo, useState } from 'react';
import { BattlegroundHeroTierList } from '@/src/features/BattlegroundHeroTierList';
import {
  type BattlegroundHeroMmr,
  type BattlegroundHeroMode,
  type createBattlegroundHeroTierResource,
} from '@/src/modules/battlegrounds/public';
import { openHeroSections } from '@/apps/public-web/lib/openHeroSections';
import type { PaywallAccessState } from '@/src/components/PaywallGate';
import type { PublicBattlegroundHeroesRanking } from '@/apps/public-web/lib/publicBattlegroundHeroesData';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';

type Resource = ReturnType<typeof createBattlegroundHeroTierResource>;
/** The subscriber's line under the legend, dated with `<time>`; the date is in Moscow time, so server and browser write the same text. */
function SourceNote({ ranking }: { ranking: PublicBattlegroundHeroesRanking | null }) {
  if (!ranking) return null;
  const date = seoDataDate(ranking.updatedAt, Date.now());
  return <>
    {[ranking.source, ranking.mode === 'duos' ? 'Дуо' : 'Соло', 'Топ 50%'].filter(Boolean).join(' · ')}
    {date ? <> · обновлено <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : null}
  </>;
}

/**
 * The open ranking as the resource the subscriber's view reads: both modes of «Топ 50%» are
 * already in the page, so `peek` answers in the first (server) render and nothing is fetched.
 * Any other slice is refused; the view never asks for one while it is locked.
 */
function openHeroResource(solo: PublicBattlegroundHeroesRanking | null, duos: PublicBattlegroundHeroesRanking | null): Resource {
  const entries = new Map<string, ReturnType<Resource['peek']>>();
  for (const [mode, ranking] of [['solo', solo], ['duos', duos]] as const) {
    const sections = openHeroSections(ranking);
    if (sections.length) {
      entries.set(`${mode}:TOP_50_PERCENT`, { sections, sourceLabel: '', source: 'live', expiresAt: Number.POSITIVE_INFINITY });
    }
  }
  const peek = (mode: BattlegroundHeroMode, mmr: BattlegroundHeroMmr) => entries.get(`${mode}:${mmr}`) ?? null;
  const load = (mode: BattlegroundHeroMode, mmr: BattlegroundHeroMmr) => {
    const found = peek(mode, mmr);
    return found ? Promise.resolve(found) : Promise.reject(new Error('Рейтинг героев временно недоступен. Попробуйте позже.'));
  };
  return {
    peek,
    load,
    observe(mode, mmr, observer) {
      let active = true;
      void load(mode, mmr).then(found => { if (active) observer.onData(found); }, error => { if (active) observer.onError(error); });
      return () => { active = false; };
    },
  };
}

/**
 * What a viewer without access (a guest, a robot, a signed-in visitor without a subscription)
 * gets on `/heroes/`, in the server HTML: the subscriber's ranking view on the open data, with
 * the closed parts locked in place.
 */
export function BattlegroundHeroesOpenList({ solo, duos, paywall, onNavigate }: {
  solo: PublicBattlegroundHeroesRanking | null;
  duos: PublicBattlegroundHeroesRanking | null;
  paywall: PaywallAccessState;
  onNavigate: (path: string) => void;
}) {
  const resource = useMemo(() => openHeroResource(solo, duos), [solo, duos]);
  const [attempt, setAttempt] = useState(0);
  if (!solo && !duos) return <p className="bg-heroes-unavailable" role="status">Рейтинг героев временно недоступен. Попробуйте позже.</p>;
  return <BattlegroundHeroTierList key={attempt} resource={resource} onNavigate={onNavigate}
    onRetry={() => setAttempt(value => value + 1)} paywall={paywall} serverRendered
    sourceNote={mode => <SourceNote ranking={mode === 'duos' ? duos : solo} />} />;
}
