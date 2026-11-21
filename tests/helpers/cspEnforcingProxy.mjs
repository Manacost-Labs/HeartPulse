import http from 'node:http';
import { contentSecurityPolicy, inlineScriptHash } from '../../apps/public-web/contentSecurityPolicy.mjs';
import { listenLocal, closeLocal } from './publicCardFixture.mjs';

/**
 * Inline scripts that Next.js and React write into every document: the RSC
 * payload (`self.__next_f`) and the streaming runtime (`$RC`, `$RB`, `$RV`,
 * `$RT`, `$RS`, `$RX`). They differ per page and per response, so no fixed
 * hash covers them; production has no layer for them yet (docs/specs/csp.md).
 * Only these prefixes count as the framework's: any other inline script must
 * be allowed by the site's registered hashes.
 */
const FRAMEWORK_SCRIPT = /^(?:\(self\.__next_f=self\.__next_f\|\|\[\]\)\.push\(|self\.__next_f\.push\(|\$R[A-Z]+[=(]|requestAnimationFrame\(function\(\)\{\$RT=)/;

function frameworkScriptHashes(html) {
  const hashes = new Set();
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\b(?:src|type)=/.test(attributes) || !FRAMEWORK_SCRIPT.test(body)) continue;
    hashes.add(inlineScriptHash(body));
  }
  return [...hashes];
}

/**
 * A loopback proxy that sends an enforcing Content-Security-Policy with every
 * HTML document of `upstream`: the site policy (`contentSecurityPolicy.mjs`)
 * plus the framework scripts of that very response. `policyHashes()` returns
 * the site's inline-script hashes per request, so a test can drop one.
 */
export async function startCspEnforcingProxy(upstream, { policyHashes }) {
  const target = new URL(upstream);
  const server = http.createServer((request, response) => {
    const headers = { ...request.headers, host: target.host };
    // The body is read whole to hash its scripts; a compressed one would need decoding first.
    delete headers['accept-encoding'];
    const forwarded = http.request({ host: target.hostname, port: target.port, method: request.method, path: request.url, headers }, upstreamResponse => {
      const outgoing = { ...upstreamResponse.headers };
      if (!String(outgoing['content-type'] ?? '').startsWith('text/html')) {
        response.writeHead(upstreamResponse.statusCode, outgoing);
        upstreamResponse.pipe(response);
        return;
      }
      const chunks = [];
      upstreamResponse.on('data', chunk => chunks.push(chunk));
      upstreamResponse.on('end', () => {
        const body = Buffer.concat(chunks);
        delete outgoing['content-length'];
        delete outgoing['transfer-encoding'];
        outgoing['content-security-policy'] = contentSecurityPolicy({
          scriptHashes: [...policyHashes(), ...frameworkScriptHashes(body.toString('utf8'))],
        });
        response.writeHead(upstreamResponse.statusCode, { ...outgoing, 'content-length': body.length });
        response.end(body);
      });
    });
    forwarded.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.pipe(forwarded);
  });
  const origin = await listenLocal(server);
  return { origin, close: () => closeLocal(server) };
}
