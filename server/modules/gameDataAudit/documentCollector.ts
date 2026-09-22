import { valueAtPath } from './model.js';
import { readResponseBody, type FetchLike, type Environment } from './sourceTransport.js';

const DOCUMENT_PROVIDERS = ['scrape.do', 'firecrawl', 'scrapfly'] as const;

function providerError(provider: string, status: number): Error {
  return new Error(`${provider} returned HTTP ${status}`);
}

export function createDocumentCollector(options: { fetchImpl?: FetchLike; env?: Environment } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const env = options.env ?? process.env;

  return async (targetUrl: string, limits: { timeoutMs: number; maxBytes: number }) => {
    const attempts: string[] = [];
    for (const provider of DOCUMENT_PROVIDERS) {
      try {
        if (provider === 'scrape.do' && env.SCRAPE_DO_TOKEN) {
          attempts.push(provider);
          const url = new URL('https://api.scrape.do/');
          url.searchParams.set('token', env.SCRAPE_DO_TOKEN);
          url.searchParams.set('url', targetUrl);
          const response = await fetchImpl(url, { signal: AbortSignal.timeout(limits.timeoutMs), redirect: 'error' });
          if (!response.ok) throw providerError(provider, response.status);
          return { provider, content: await readResponseBody(response, limits.maxBytes), attempts };
        }
        if (provider === 'firecrawl' && env.FIRECRAWL_API_KEYS) {
          attempts.push(provider);
          const apiKeys = env.FIRECRAWL_API_KEYS.split(',').map(item => item.trim()).filter(Boolean);
          for (const apiKey of apiKeys) {
            try {
              const response = await fetchImpl('https://api.firecrawl.dev/v2/scrape', {
                method: 'POST',
                headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
                body: JSON.stringify({ url: targetUrl, formats: ['markdown'], onlyMainContent: true }),
                signal: AbortSignal.timeout(limits.timeoutMs),
                redirect: 'error',
              });
              if (!response.ok) throw providerError(provider, response.status);
              const payload = JSON.parse(await readResponseBody(response, limits.maxBytes)) as unknown;
              const content = String(valueAtPath(payload, 'data.markdown') ?? valueAtPath(payload, 'markdown') ?? '');
              if (!content) throw new Error('firecrawl returned an empty document');
              return { provider, content, attempts };
            } catch {
              // Rotate through every configured key before falling back to Scrapfly.
            }
          }
          continue;
        }
        if (provider === 'scrapfly' && env.SCRAPFLY_API_KEY) {
          attempts.push(provider);
          const url = new URL('https://api.scrapfly.io/scrape');
          url.searchParams.set('key', env.SCRAPFLY_API_KEY);
          url.searchParams.set('url', targetUrl);
          url.searchParams.set('format', 'json');
          const response = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(limits.timeoutMs), redirect: 'error' });
          if (!response.ok) throw providerError(provider, response.status);
          const payload = JSON.parse(await readResponseBody(response, limits.maxBytes)) as unknown;
          const content = String(valueAtPath(payload, 'result.content') ?? valueAtPath(payload, 'content') ?? '');
          if (!content) throw new Error('scrapfly returned an empty document');
          return { provider, content, attempts };
        }
      } catch {
        // Continue through the documented provider chain. Errors are summarized
        // after all configured providers have been attempted; secrets are never logged.
      }
    }
    throw new Error(attempts.length > 0
      ? `All document providers failed: ${attempts.join(', ')}`
      : 'No document provider credentials are configured');
  };
}
