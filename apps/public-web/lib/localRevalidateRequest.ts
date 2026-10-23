const LOOPBACK = /^(?:127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/;
const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost):\d+$/;

/**
 * True only for a call made on the host straight to the Next server: Next
 * fills `X-Forwarded-For` with the loopback socket address of such a call,
 * while every Nginx location that reaches Next appends the real client
 * address (a forged loopback value becomes a list) and sends a public Host.
 */
export function isLocalRevalidateRequest(headers: Pick<Headers, 'get'>): boolean {
  const forwardedFor = (headers.get('x-forwarded-for') ?? '').trim();
  return LOOPBACK.test(forwardedFor) && LOOPBACK_HOST.test(headers.get('host') ?? '');
}
