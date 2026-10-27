/** Which IP addresses a server-side fetch of a user-supplied URL may connect to (SSRF policy). */
import { isIP } from 'node:net';

export function normalizedIp(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

export function isForbiddenRemoteAddress(value: string): boolean {
  const address = normalizedIp(value);
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0 && (c === 0 || c === 2)) // IETF protocol assignments, TEST-NET-1
      || (a === 192 && b === 88 && c === 99) // retired 6to4 relay anycast
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100) // TEST-NET-2
      || (a === 203 && b === 0 && c === 113) // TEST-NET-3
      || a >= 224;
  }
  if (family === 6) {
    const h = ipv6Hextets(address);
    if (!h) return true;
    // An IPv6 address can carry an IPv4 one that the socket layer still reaches. WHATWG URL
    // and resolvers write it in hex hextets ([::ffff:127.0.0.1] becomes [::ffff:7f00:1]),
    // so compare the numbers, not the spelling.
    const embedded = (high: number, low: number) => isForbiddenRemoteAddress(
      `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`,
    );
    const zero = (from: number, to: number) => h.slice(from, to).every(group => group === 0);
    if (zero(0, 5) && (h[5] === 0 || h[5] === 0xffff)) return embedded(h[6], h[7]); // ::, ::1, compatible, mapped
    if (zero(0, 4) && h[4] === 0xffff && h[5] === 0) return embedded(h[6], h[7]); // ::ffff:0:0/96 translated
    if (h[0] === 0x64 && h[1] === 0xff9b) return zero(2, 6) ? embedded(h[6], h[7]) : true; // NAT64, local-use NAT64
    if (h[0] === 0x2002) return embedded(h[1], h[2]); // 6to4
    if (h[0] === 0x2001 && (h[1] === 0 || h[1] === 0xdb8)) return true; // Teredo, documentation
    if (h[0] === 0x2001 && ((h[1] & 0xfff0) === 0x10 || (h[1] & 0xfff0) === 0x20)) return true; // ORCHID, ORCHIDv2
    if (h[0] === 0x2001 && h[1] === 2 && h[2] === 0) return true; // benchmarking
    if (h[0] === 0x100 && zero(1, 4)) return true; // discard prefix
    return (h[0] & 0xfe00) === 0xfc00 // unique local
      || (h[0] & 0xffc0) === 0xfe80 // link-local
      || (h[0] & 0xffc0) === 0xfec0 // site-local
      || (h[0] & 0xff00) === 0xff00; // multicast
  }
  return false;
}

/** The eight groups of an address `isIP` accepted as IPv6, or null when it cannot be read. */
function ipv6Hextets(address: string): number[] | null {
  let text = address.split('%', 1)[0];
  const dotted = text.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [, prefix, a, b, c, d] = dotted;
    text = `${prefix}${((Number(a) << 8) | Number(b)).toString(16)}:${((Number(c) << 8) | Number(d)).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const groups = (part: string) => (part ? part.split(':').map(group => Number.parseInt(group, 16)) : []);
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 2 ? fill < 1 : fill !== 0) return null;
  const all = [...head, ...Array<number>(halves.length === 2 ? fill : 0).fill(0), ...tail];
  return all.every(group => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? all : null;
}
