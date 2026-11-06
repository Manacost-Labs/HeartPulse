import 'server-only';
import { embedDocument, embedMessage, embedResponse } from '@/apps/public-web/lib/embedDocument';
import { replayEmbedBody } from '@/apps/public-web/lib/embedBodies';
import { loadPublicReplay } from '@/apps/public-web/lib/publicReplay';
import { replayShareText, replayUrls } from '@/apps/public-web/lib/replayShare';

export const dynamic = 'force-dynamic';

/** `/embed/replay/<id>/`: a web replay for other sites' iframes (Manacost articles, forums). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const replay = await loadPublicReplay(id);
  if (replay === 'unavailable') return embedMessage('Реплей временно недоступен. Обновите страницу через минуту.', 503);
  if (!replay) return embedMessage('Реплей не найден: возможно, автор его удалил.', 404);
  const { title } = replayShareText(replay);
  // Revalidated on every view, so a replay its author deleted disappears from other sites at once.
  return embedResponse(embedDocument({ title: `${title} — Hearthpulse`, body: replayEmbedBody(replay), back: replayUrls(replay.id).page }), 200, 'no-cache');
}
