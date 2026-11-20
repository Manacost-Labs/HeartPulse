'use client';

import { useMemo } from 'react';
import { BattlegroundTierList } from '@/src/features/BattlegroundTierList';
import { bgTierListRequest, OPEN_STRATEGY_SOURCE, OPEN_TIER_LIST } from '@/src/features/battlegroundTierListState';
import type { BattlegroundTierListSource } from '@/src/features/useBattlegroundTierListData';
import type { PaywallAccessState } from '@/src/components/PaywallGate';
import {
  buildsPath, parsePublicBattlegroundBuilds, type PublicBattlegroundBuilds, type PublicBuildCard,
} from '@/apps/public-web/lib/publicBattlegroundBuildsData';

const TIERS = ['S', 'A', 'B', 'C', 'D'] as const;
const UNAVAILABLE = 'Сборки временно недоступны. Попробуйте позже.';

/** A card as the subscriber's strategy card reads it: the framed render first, the card render in the lightbox. */
const card = (entry: PublicBuildCard) => ({
  id: entry.cardId || undefined, dbfId: entry.dbfId, name: entry.name, ruName: entry.name,
  frame: entry.frame ?? undefined, card: entry.image ?? undefined, ruText: entry.text ?? undefined,
});

/** The open builds as the tier-list answer the subscriber's view reads (`list: strategies`, entries by tier). */
function openBuildsTierList(data: PublicBattlegroundBuilds) {
  const tiers = Object.fromEntries(TIERS.map(tier => [tier, data.builds.filter(build => build.tier === tier).map(build => ({
    key: build.key, tier, title: build.title, description: build.description, difficulty: build.difficulty,
    archetype: build.archetype, avgPlacement: build.avgPlacement,
    coreCards: build.coreCards.map(card), additionalCards: build.additionalCards.map(card),
  }))]));
  return { list: OPEN_TIER_LIST, source: data.list === 'compositions' ? 'hsreplay' : 'firestone', fetchedAt: data.updatedAt, count: data.builds.length, tiers };
}

/**
 * The open builds as the source the subscriber's tier list reads. The HSReplay compositions are already in the
 * page, so `peek` answers in the first (server) render; the Firestone strategies are the open list of
 * `/battlegrounds/strategies/`, read when the viewer picks that source. Any other slice is refused: the view never
 * asks for one while its tabs are locked.
 */
function openBuildsSource(compositions: PublicBattlegroundBuilds | null): BattlegroundTierListSource {
  const inPage = bgTierListRequest(OPEN_TIER_LIST, OPEN_STRATEGY_SOURCE);
  const firestone = bgTierListRequest(OPEN_TIER_LIST, 'firestone');
  const answer = compositions ? openBuildsTierList(compositions) : null;
  let strategies: Promise<ReturnType<typeof openBuildsTierList>> | null = null;
  const readStrategies = () => (strategies ??= fetch(buildsPath('strategies'), { headers: { Accept: 'application/json' } })
    .then(response => response.ok ? response.json() : null)
    .then(raw => {
      const parsed = parsePublicBattlegroundBuilds(raw, 'strategies');
      if (!parsed) throw new Error(UNAVAILABLE);
      return openBuildsTierList(parsed);
    })
    .catch(error => {
      strategies = null;
      throw error instanceof Error && error.message === UNAVAILABLE ? error : new Error(UNAVAILABLE);
    }));
  return {
    peek: request => request === inPage ? answer : null,
    unavailable: request => request === inPage && !answer ? UNAVAILABLE : null,
    load: request => {
      if (request === inPage) return answer ? Promise.resolve(answer) : Promise.reject(new Error(UNAVAILABLE));
      if (request === firestone) return readStrategies();
      return Promise.reject(new Error('Этот тир-лист доступен подписчикам.'));
    },
  };
}

/**
 * What a viewer without access (a guest, a robot, a signed-in visitor without a subscription) gets on
 * `/battlegrounds/tier-list/`, in the server HTML: the subscriber's tier list on the open builds, with the closed
 * lists (minions, spells, trinkets) locked in place. Without the open builds the same view says they are unavailable.
 */
export function BattlegroundTierListOpenView({ compositions, paywall }: {
  compositions: PublicBattlegroundBuilds | null;
  paywall: PaywallAccessState;
}) {
  const source = useMemo(() => openBuildsSource(compositions), [compositions]);
  return <BattlegroundTierList source={source} paywall={paywall} serverRendered />;
}
