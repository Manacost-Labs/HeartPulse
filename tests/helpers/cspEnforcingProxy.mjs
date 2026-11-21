import http from 'node:http';
import { contentSecurityPolicy, inlineScriptHash } from '../../apps/public-web/contentSecurityPolicy.mjs';
import { listenLocal, closeLocal } from './publicCardFixture.mjs';

/**
 * The inline scripts Next.js 16.4 and React 19 write into a document, in their
 * complete shapes. They differ per page and per response, so no fixed hash
 * covers them; production has no layer for them yet (docs/specs/csp.md).
 * - the RSC payload: `self.__next_f.push(<JSON array>)` and its first push
 *   `(self.__next_f=self.__next_f||[]).push(<JSON array>)`;
 * - React's streaming runtime: the exact definitions below, optionally
 *   followed by one instruction `$RC("…","…")` / `$RS("…","…")` whose
 *   arguments are JSON strings.
 * Anything else, including a script that only starts like these, is not the
 * framework's and must be allowed by the site's registered hashes. A React
 * upgrade that changes a definition fails the browser test until it is copied here.
 */
const REACT_RUNTIME_DEFINITIONS = [
  'requestAnimationFrame(function(){$RT=performance.now()});',
  '$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d||"/&"===d)if(0===h)break;else h--;else"$"!==d&&"$?"!==d&&"$~"!==d&&"$!"!==d&&"&"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data="$";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};\n'
    + '$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data="$~",$RB.push(a,b),2===$RB.length&&("number"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};',
];

function parsesAs(json, accept) {
  try { return accept(JSON.parse(json)); } catch { return false; }
}

const isStringPair = value => Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'string');

/** Whether `body` is exactly one of the framework's inline scripts described above. */
export function isFrameworkScript(body) {
  const payload = /^(?:self\.__next_f|\(self\.__next_f=self\.__next_f\|\|\[\]\))\.push\(([\s\S]*)\)$/.exec(body);
  if (payload) return parsesAs(payload[1], Array.isArray);
  const definition = REACT_RUNTIME_DEFINITIONS.find(known => body.startsWith(known)) ?? '';
  const instruction = body.slice(definition.length);
  if (instruction === '') return definition !== '';
  const call = /^\$R[CS]\(([\s\S]*)\)$/.exec(instruction);
  return Boolean(call) && parsesAs(`[${call[1]}]`, isStringPair);
}

function frameworkScriptHashes(html) {
  const hashes = new Set();
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script[^>]*>/gi)) {
    if (/\b(?:src|type)=/i.test(attributes) || !isFrameworkScript(body)) continue;
    hashes.add(inlineScriptHash(body));
  }
  return [...hashes];
}

/**
 * A loopback proxy that sends an enforcing Content-Security-Policy with every
 * HTML document of `upstream`: the site policy (`contentSecurityPolicy.mjs`)
 * plus the framework scripts of that very response. `policyHashes()` returns
 * the site's inline-script hashes per request, so a test can drop one;
 * `rewriteHtml(html)` lets a test plant markup before the scripts are hashed.
 */
export async function startCspEnforcingProxy(upstream, { policyHashes, rewriteHtml = html => html }) {
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
        const html = rewriteHtml(Buffer.concat(chunks).toString('utf8'));
        const body = Buffer.from(html, 'utf8');
        delete outgoing['content-length'];
        delete outgoing['transfer-encoding'];
        outgoing['content-security-policy'] = contentSecurityPolicy({
          scriptHashes: [...policyHashes(), ...frameworkScriptHashes(html)],
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
