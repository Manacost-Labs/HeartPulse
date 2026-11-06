import 'server-only';
import { cachedOgImage, cardArt, loadLogo, OG_COLORS, OgBrand, ogImageResponse } from '@/apps/public-web/lib/ogImage';
import { loadPublicYearReview, percent, type PublicYearReview } from '@/apps/public-web/lib/publicYearReview';

export const dynamic = 'force-dynamic';

async function draw(review: PublicYearReview) {
  const hero = review.battlegrounds.favouriteHero;
  const [logo, heroArt] = await Promise.all([loadLogo(), hero ? cardArt(hero.cardId, 'full', 260) : null]);
  const facts: Array<[string, string]> = [
    ['игр', String(review.games)],
    ['часов', String(review.hours)],
    ['серия побед', String(review.bestStreak)],
  ];
  if (review.favouriteClass) facts.push(['любимый класс', review.favouriteClass.label]);
  if (review.battlegrounds.games) facts.push(['топ-4 на Полях', percent(review.battlegrounds.top4Rate)]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', fontFamily: 'HSDisplay', color: OG_COLORS.gold,
      background: `radial-gradient(circle at 30% 30%, #4a2f1c 0%, ${OG_COLORS.ink} 72%)` }}>
      <div style={{ display: 'flex', flex: 1, padding: '40px 56px 16px', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <span style={{ fontSize: 34, color: OG_COLORS.muted }}>Итоги года</span>
          <span style={{ fontSize: 96, lineHeight: 1 }}>{`Hearthpulse ${review.year}`}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 28 }}>
            {facts.slice(0, 5).map(([label, value]) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', marginRight: 40, marginBottom: 14 }}>
                <span style={{ fontSize: 48 }}>{value}</span>
                <span style={{ fontSize: 24, color: OG_COLORS.muted }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        {heroArt ? <img src={heroArt} width={260} height={359} alt="" style={{ objectFit: 'contain' }} /> : null}
      </div>
      <OgBrand logoUri={logo} caption="hearthpulse.net" />
    </div>
  );
}

/** The share image of `/id/<n>/year/<year>/`; absent while the review is hidden or closed. */
export async function GET(_request: Request, { params }: { params: Promise<{ publicProfileId: string; year: string }> }): Promise<Response> {
  const { publicProfileId, year } = await params;
  let review: PublicYearReview | null;
  try {
    review = await loadPublicYearReview(publicProfileId, year);
  } catch {
    return new Response('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
  }
  if (!review) return ogImageResponse(null);
  // The numbers change through the year until the copy stops at the day's start: one image per profile, year and day.
  const day = new Date().toISOString().slice(0, 10);
  return ogImageResponse(await cachedOgImage(`year:${publicProfileId}:${review.year}:${day}`, () => draw(review)));
}
