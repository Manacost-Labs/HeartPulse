import 'server-only';
import { cachedOgImage, cardArt, loadLogo, OG_COLORS, OgBrand, ogImageResponse } from '@/apps/public-web/lib/ogImage';
import { loadPublicReplay, type PublicReplay } from '@/apps/public-web/lib/publicReplay';
import { replayShareText } from '@/apps/public-web/lib/replayShare';

export const dynamic = 'force-dynamic';

const RESULT_COLOR: Record<string, string> = { Win: OG_COLORS.win, Loss: OG_COLORS.loss };

async function draw(replay: PublicReplay) {
  const { summary } = replay;
  const bg = replay.kind === 'battlegrounds';
  const [logo, hero, opponent, ...board] = await Promise.all([
    loadLogo(),
    summary.heroCardId ? cardArt(summary.heroCardId, 'full', 300) : null,
    !bg && summary.opponentHeroCardId ? cardArt(summary.opponentHeroCardId, 'full', 300) : null,
    ...(bg ? summary.finalBoard.slice(0, 7).map(minion => cardArt(minion.cardId, 'full', 150)) : []),
  ]);
  const { title } = replayShareText(replay);
  const headline = bg ? (summary.placement ? `${summary.placement}-е место` : 'Поля сражений') : (summary.result || summary.mode);
  const color = bg ? (summary.placement && summary.placement <= 4 ? OG_COLORS.win : OG_COLORS.loss) : (RESULT_COLOR[summary.resultKey] ?? OG_COLORS.gold);
  const facts = [summary.mode, summary.turns ? `${summary.turns} ход.` : '', summary.opponentArchetype].filter(Boolean).join(' · ');
  const heroCard = (uri: string | null) => (uri
    ? <img src={uri} width={300} height={414} alt="" style={{ objectFit: 'contain' }} />
    : <div style={{ display: 'flex', width: 300, height: 414 }} />);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', fontFamily: 'HSDisplay',
      background: `radial-gradient(circle at 50% 35%, #4a2f1c 0%, ${OG_COLORS.ink} 70%)`, color: OG_COLORS.gold }}>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '24px 48px 8px' }}>
        {heroCard(hero)}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '0 24px' }}>
          <span style={{ fontSize: 76, color, textAlign: 'center' }}>{headline}</span>
          <span style={{ fontSize: 34, marginTop: 12, textAlign: 'center', maxWidth: 520 }}>{bg ? summary.heroName : title.replace(/^[^:]*:\s*/, '')}</span>
          <span style={{ fontSize: 26, marginTop: 14, color: OG_COLORS.muted, textAlign: 'center', maxWidth: 520 }}>{facts}</span>
          {bg && board.some(Boolean) ? (
            <div style={{ display: 'flex', marginTop: 20 }}>
              {board.map((uri, index) => (uri
                ? <img key={index} src={uri} width={92} height={127} alt="" style={{ objectFit: 'contain', margin: '0 2px' }} />
                : null))}
            </div>
          ) : null}
        </div>
        {bg ? null : heroCard(opponent)}
      </div>
      <OgBrand logoUri={logo} caption="Реплей · hearthpulse.net" />
    </div>
  );
}

/** The link preview of `/replay/<id>/`: heroes, result and the final board, with the Hearthpulse brand. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const replay = await loadPublicReplay(id);
  if (replay === 'unavailable') return new Response('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
  if (!replay) return ogImageResponse(null);
  return ogImageResponse(await cachedOgImage(`replay:${id}`, () => draw(replay)));
}
