import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@/src/route-parchment.css';
import './replay.css';
import { loadPublicReplay } from '@/apps/public-web/lib/publicReplay';

type Props = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

async function resolveReplay(params: Props['params']) {
  const { id } = await params;
  const replay = await loadPublicReplay(id);
  if (!replay) notFound();
  return replay;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const replay = await resolveReplay(params);
  if (replay === 'unavailable') return { title: 'Реплей — HearthPulse', robots: { index: false, follow: false } };
  const title = replay.kind === 'battlegrounds' ? `Реплей Полей сражений: ${replay.summary.heroName}` : `Реплей: ${replay.summary.heroName}`;
  // A player's game, shared by link: not for search engines.
  return { title: `${title} — HearthPulse`, robots: { index: false, follow: false } };
}

const SIDE: Record<string, string> = { you: 'Вы', opponent: 'Соперник', game: '' };

/** A game shared from the Hearthpulse app (plan 2.2): the summary and a turn-by-turn timeline, as the player saw it. */
export default async function Page({ params }: Props) {
  const replay = await resolveReplay(params);
  if (replay === 'unavailable') {
    return (
      <main className="replay-page">
        <h1>Реплей временно недоступен</h1>
        <p className="replay-page__note">Сайт сейчас перегружен. Обновите страницу через минуту.</p>
      </main>
    );
  }
  const { summary } = replay;
  const bg = replay.kind === 'battlegrounds';
  return (
    <main className="replay-page">
      <header className="replay-page__head">
        <h1>{summary.mode} · {summary.heroName}</h1>
        <p className="replay-page__meta">
          {bg ? `${summary.placement}-е место` : summary.result || 'Итог неизвестен'}
          {!bg && summary.opponentHeroName ? ` против ${summary.opponentHeroName}` : ''}
          {summary.opponentArchetype ? ` (${summary.opponentArchetype})` : ''}
          {summary.turns ? ` · ${summary.turns} ход.` : ''} · {new Date(replay.createdAt).toLocaleDateString('ru-RU')}
        </p>
        <p className="replay-page__note">
          Реплей загружен из приложения Hearthpulse. Здесь только то, что игрок видел во время игры: без имён, BattleTag и
          карт соперника, которые он не видел.
        </p>
      </header>
      {bg && summary.finalBoard.length > 0 && (
        <section className="replay-page__board" aria-label="Итоговый стол">
          <h2>Итоговый стол</h2>
          <ul>{summary.finalBoard.map((minion, index) => (
            <li key={index} className={minion.golden ? 'is-golden' : undefined}>{minion.name} <span>{minion.attack}/{minion.health}</span></li>
          ))}</ul>
        </section>
      )}
      <section className="replay-page__timeline" aria-label="Ход игры">
        {replay.turns.map((turn, index) => (
          <details key={index} open={index < 3}>
            <summary>{turn.title}</summary>
            <ol>{turn.steps.map((step, stepIndex) => (
              <li key={stepIndex} data-side={step.side}>{SIDE[step.side] ? <b>{SIDE[step.side]}: </b> : null}{step.text}</li>
            ))}</ol>
          </details>
        ))}
      </section>
    </main>
  );
}
