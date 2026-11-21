import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * The site's Content-Security-Policy, assembled only here (docs/specs/csp.md).
 * Scripts come from this origin (Next.js chunks, `/bg-legacy/`), from the two
 * third-party loaders below, and inline only as the sources registered in
 * `lib/inlineScripts.ts`, allowed by their sha256. Hashes, not nonces: a hash
 * is the same on every response, so prerendered (ISR) pages and the edge's
 * shared HTML cache stay valid.
 */

/** `next build` reads it: `1` sends the policy as `Content-Security-Policy-Report-Only`; anything else sends none. */
const CSP_REPORT_ONLY_FLAG = 'HEARTHPULSE_CSP_REPORT_ONLY';
/** Optional `report-uri` of the report-only policy: a same-origin path or an https URL. */
const CSP_REPORT_URI_VARIABLE = 'HEARTHPULSE_CSP_REPORT_URI';

/** Plausible (`lib/analyticsLoader.ts`) and the Telegram login widget (`LoginPanel.tsx`). */
const SCRIPT_ORIGINS = Object.freeze(['https://stats.hs-manacost.ru', 'https://telegram.org']);

/**
 * Embeds send their own, stricter policy (`lib/embedDocument.ts`) and go into
 * other sites' frames; every other document gets the site policy.
 */
const SITE_POLICY_SOURCE = '/((?!embed/).*)';

/** The CSP hash source of a script's exact text. */
export function inlineScriptHash(source) {
  return `sha256-${createHash('sha256').update(source, 'utf8').digest('base64')}`;
}

/** The checked-in hashes of `INLINE_SCRIPTS`, by id. */
export function registeredInlineScriptHashes() {
  return JSON.parse(readFileSync(new URL('./inlineScriptHashes.json', import.meta.url), 'utf8'));
}

function reportUri(value) {
  if (value === undefined || value === '') return null;
  if (!/^(?:\/|https:\/\/)[^\s;,']+$/.test(value)) {
    throw new Error(`${CSP_REPORT_URI_VARIABLE} must be a same-origin path or an https URL`);
  }
  return value;
}

/**
 * The policy text. `scriptHashes` defaults to the registered inline scripts;
 * the browser test adds the framework's per-response hashes (docs/specs/csp.md).
 */
export function contentSecurityPolicy({ scriptHashes = Object.values(registeredInlineScriptHashes()), reportUri: uri = null } = {}) {
  const scriptSources = ["'self'", ...scriptHashes.map(hash => `'${hash}'`), ...SCRIPT_ORIGINS, "'report-sample'"];
  return [`script-src ${scriptSources.join(' ')}`, "object-src 'none'", "base-uri 'self'", ...(uri ? [`report-uri ${uri}`] : [])]
    .join('; ');
}

/**
 * `headers()` entries of `next.config.mjs`. Production never receives an
 * enforcing policy from here: it stays report-only until the reports are
 * reviewed (the framework's own inline scripts are not covered yet).
 */
export function contentSecurityPolicyHeaders(env = process.env) {
  if (env[CSP_REPORT_ONLY_FLAG] !== '1') return [];
  const value = contentSecurityPolicy({ reportUri: reportUri(env[CSP_REPORT_URI_VARIABLE]) });
  return [{ source: SITE_POLICY_SOURCE, headers: [{ key: 'Content-Security-Policy-Report-Only', value }] }];
}
