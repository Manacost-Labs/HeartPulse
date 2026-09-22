import 'server-only';
export function GET() {
  return Response.json({ ok: true, service: 'hearthpulse-public-web' }, { headers: { 'Cache-Control': 'no-store' } });
}
