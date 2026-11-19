'use client';

// The site's one tier mark, reachable from the server-rendered builds list: the list itself stays a
// server component (its markup is not repeated in the RSC payload), only this mark is a client reference.
export { TierBadge as BattlegroundBuildTierBadge } from '@/src/modules/arenaTierList/public';
