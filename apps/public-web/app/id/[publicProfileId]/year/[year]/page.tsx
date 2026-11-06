import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@/src/route-parchment.css';
import './year.css';
import { loadPublicYearReview, monthName, percent, type PublicYearReview } from '@/apps/public-web/lib/publicYearReview';
import { MadeWithHearthpulse } from '@/apps/public-web/ui/MadeWithHearthpulse';

type Props = { params: Promise<{ publicProfileId: string; year: string }> };
export const dynamic = 'force-dynamic';

async function resolveReview(params: Props['params']) {
  const { publicProfileId, year } = await params;
  const review = await loadPublicYearReview(publicProfileId, year);
  if (!review) notFound();
  return { review, publicProfileId };
}

/** One sentence of the year for previews; no names: the profile's display name stays on the profile page. */
function summaryLine(review: PublicYearReview): string {
  const parts = [`${review.games} игр`, `${review.hours} ч в игре`];
  if (review.favouriteClass) parts.push(`любимый класс — ${review.favouriteClass.label}`);
  if (review.battlegrounds.favouriteHero) parts.push(`герой Полей сражений — ${review.battlegrounds.favouriteHero.name}`);
  return `${parts.join(', ')}.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { review, publicProfileId } = await resolveReview(params);
  const url = `https://hearthpulse.net/id/${publicProfileId}/year/${review.year}/`;
  const title = `Итоги года Hearthpulse ${review.year}`;
  const description = summaryLine(review);
  const image = { url: `https://hearthpulse.net/og/year/${publicProfileId}/${review.year}/`, width: 1200, height: 630, alt: title };
  return {
    title, description, alternates: { canonical: url }, robots: { index: false, follow: false },
    openGraph: { type: 'website', siteName: 'Hearthpulse', locale: 'ru_RU', url, title, description, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="year-review__tile">
      <dt>{label}</dt>
      <dd>{value}{note ? <small>{note}</small> : null}</dd>
    </div>
  );
}

/** «Итоги года Hearthpulse»: a public profile's year from its tracker games (docs/specs/year-in-review.md). */
export default async function Page({ params }: Props) {
  const { review, publicProfileId } = await resolveReview(params);
  const bg = review.battlegrounds;
  const constructed = review.games - bg.games;
  return (
    <main className="year-review">
      <header className="year-review__head">
        <p className="year-review__kicker">Hearthpulse</p>
        <h1>Итоги года {review.year}</h1>
        <p>{summaryLine(review)}</p>
      </header>
      {review.games === 0 ? <p>В этом году игр ещё нет.</p> : (
        <dl className="year-review__tiles">
          <Tile label="Игр" value={String(review.games)} note={review.bestMonth ? `больше всего — ${monthName(review.bestMonth.month)}` : undefined} />
          <Tile label="Часов в игре" value={String(review.hours)} />
          <Tile label="Лучшая серия побед" value={String(review.bestStreak)} />
          {constructed > 0 ? <Tile label="Винрейт" value={percent(review.winRate)} note={`${review.wins} побед`} /> : null}
          {review.favouriteClass ? <Tile label="Любимый класс" value={review.favouriteClass.label} note={`${review.favouriteClass.games} игр`} /> : null}
          {review.favouriteDeck ? (
            <Tile label="Любимая колода" value={review.favouriteDeck.title}
              note={`${review.favouriteDeck.games} игр, ${review.favouriteDeck.wins} побед`} />
          ) : null}
          {bg.favouriteHero ? <Tile label="Герой Полей сражений" value={bg.favouriteHero.name} note={`${bg.favouriteHero.games} игр`} /> : null}
          {bg.games > 0 ? <Tile label="В топ-4 на Полях сражений" value={percent(bg.top4Rate)}
            note={bg.averagePlacement !== null ? `среднее место ${bg.averagePlacement}` : undefined} /> : null}
          {bg.bestRating !== null ? <Tile label="Лучший рейтинг Полей сражений" value={String(bg.bestRating)} /> : null}
        </dl>
      )}
      {review.topCards.length > 0 ? (
        <section className="year-review__cards" aria-label="Карты года">
          <h2>Карты года</h2>
          <ol>{review.topCards.map(card => (
            <li key={card.cardId}>
              <img src={`/api/card-image/${encodeURIComponent(card.cardId)}/tile.webp`} alt="" width={160} height={38} loading="lazy" />
              <span>{card.name}</span>
              <small>{card.games} игр</small>
            </li>
          ))}</ol>
        </section>
      ) : null}
      {review.favouriteDeck?.deckCode ? (
        <p className="year-review__deck">Код любимой колоды: <a href={`/embed/deck/${encodeURIComponent(review.favouriteDeck.deckCode)}/`}>открыть список карт</a></p>
      ) : null}
      <p className="year-review__back"><a href={`/id/${publicProfileId}/`}>Профиль игрока</a></p>
      <MadeWithHearthpulse />
    </main>
  );
}
