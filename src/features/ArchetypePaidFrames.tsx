import React from 'react';
import { Grid3x3, Swords, Sparkles, TrendingUp } from 'lucide-react';
import { ArchetypeDetailSection } from '../modules/constructedArchetypes/public';
import { PaidMetricLock } from '../shared/ui/PaidLocks';
import { RankHeatmapSection } from './ArchetypeInsightSlots';
import { ArchetypeAnalysisLoading, ArchetypeHistorySkeleton } from './ConstructedArchetypeDetailSkeletons';
import './ArchetypePaidFrames.css';

/** `tour`: the anchor the page tour points at in the subscriber's view; the locked frame carries it too. */
type FrameCopy = { id: string; icon: React.ReactNode; eyebrow: string; title: string; text: string; tour?: string };

const FRAMES: Record<'matchups' | 'mulligan' | 'ranks' | 'history', FrameCopy> = {
  matchups: {
    id: 'matchups', tour: 'archetype-analysis', icon: <Swords size={15} aria-hidden="true" />, eyebrow: 'Матчапы', title: 'Матчапы против классов',
    text: 'Винрейт архетипа против каждого класса на ранге Легенда и доля соперников в выборке.',
  },
  mulligan: {
    id: 'mulligan', icon: <Sparkles size={15} aria-hidden="true" />, eyebrow: 'Карты', title: 'Муллиган и влияние карт',
    text: 'Как каждая карта меняет винрейт: в стартовой руке, при взятии и среди оставленных.',
  },
  ranks: {
    id: 'ranks', tour: 'archetype-ranks', icon: <Grid3x3 size={15} aria-hidden="true" />, eyebrow: 'Ранги и периоды', title: 'Винрейт по рангам',
    text: 'Винрейт архетипа в каждом ранге за разные периоды HSGuru.',
  },
  history: {
    id: 'history', tour: 'archetype-history', icon: <TrendingUp size={15} aria-hidden="true" />, eyebrow: 'Накопительная статистика', title: 'История архетипа',
    text: 'Срез добавляется каждые 12 часов: как менялись винрейт, популярность и число игр.',
  },
};

/** A paid section for a guest: its place, heading and one line of what it holds, closed behind the lock. */
function LockedFrame({ frame }: { frame: keyof typeof FRAMES }) {
  const copy = FRAMES[frame];
  return <section className="archetype-insight archetype-paid-frame" aria-labelledby={`archetype-paid-${copy.id}`} data-paid-frame={copy.id} data-tour-id={copy.tour}>
    <header className="archetype-section-heading"><div>
      <span className="archetypes-eyebrow">{copy.icon} {copy.eyebrow}</span>
      <h2 id={`archetype-paid-${copy.id}`}>{copy.title}</h2>
      <p>{copy.text}</p>
    </div></header>
    <div className="archetype-paid-frame__body"><PaidMetricLock variant="card" label={copy.title} closed="paywalled-archetype" /></div>
  </section>;
}

const noop = () => undefined;

/** The sections of a subscriber's page, in the state they hold while the access or the paid answer is still on its way. */
export function PendingPaidSections({ radar }: { radar: React.ReactNode }) {
  return <>
    <ArchetypeDetailSection title="Матчапы и муллиган" loading error="" onRetry={noop} skeleton={<ArchetypeAnalysisLoading />}>{null}</ArchetypeDetailSection>
    <RankHeatmapSection read={{ loading: true, error: '', retry: noop, data: null }} />
    {radar}
    <ArchetypeDetailSection title="История архетипа" loading error="" onRetry={noop} skeleton={<ArchetypeHistorySkeleton />}>{null}</ArchetypeDetailSection>
  </>;
}

/** Matchups and mulligan, ranks and history of a guest's page: each at its subscriber place, with a lock. */
export function LockedPaidSections({ radar }: { radar: React.ReactNode }) {
  return <>
    <LockedFrame frame="matchups" />
    <LockedFrame frame="mulligan" />
    <LockedFrame frame="ranks" />
    {radar}
    <LockedFrame frame="history" />
  </>;
}
