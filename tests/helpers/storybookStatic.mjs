import { once } from 'node:events';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { resolve } from 'node:path';
import express from 'express';

/**
 * Serves the Storybook build for browser tests of isolated components.
 * A component state that no page can reach (stacked dialogs, a page header
 * without its page) lives in a story; the test opens that story's canvas.
 * The build contains the production React, as the site does, so React's
 * development warnings never reach these tests.
 * Requires `npm run build-storybook`.
 */
export async function startStorybookStatic() {
  const directory = resolve('storybook-static');
  if (!existsSync(resolve(directory, 'index.json'))) {
    throw new Error('storybook-static/ is missing; run npm run build-storybook first');
  }
  const server = http.createServer(express().use(express.static(directory)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    /** The canvas of one story. `args` is Storybook's URL syntax: `name:value;other:value`. */
    storyUrl(id, args = '') {
      return `${origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story${args ? `&args=${args}` : ''}`;
    },
    async close() {
      server.closeAllConnections();
      await new Promise(resolveClose => server.close(resolveClose));
    },
  };
}

const NETWORK_CHANGED = 'net::ERR_NETWORK_CHANGED';
const MAX_STORY_LOADS = 3;

/**
 * Opens a story canvas and resolves once Storybook has rendered it.
 *
 * Storybook replaces a story whose module failed to load with its error
 * screen, so a later selector wait could only time out; this throws at once
 * with Storybook's message instead. Chrome cancels every in-flight request,
 * loopback included, with net::ERR_NETWORK_CHANGED whenever a host network
 * interface or address changes (container networks starting on a busy host or
 * runner). Only a load that the browser aborted that way is opened again, at
 * most twice; any other render failure is the test's result. `transientError`
 * exists for the helper's own regression test, which cannot make Chrome emit
 * a real network change.
 */
export async function openStory(page, url, { transientError = NETWORK_CHANGED } = {}) {
  for (let load = 1; ; load += 1) {
    const aborted = [];
    const recordAbort = request => {
      if (request.failure()?.errorText === transientError) aborted.push(request.url());
    };
    page.on('requestfailed', recordAbort);
    try {
      try {
        await page.goto(url);
      } catch (error) {
        if (!error.message.includes(transientError) || load === MAX_STORY_LOADS) throw error;
        console.warn(`[storybook] ${url}: the browser aborted the document with ${transientError}; opening it again`);
        continue;
      }
      await page.waitForFunction(() => ['sb-show-main', 'sb-show-errordisplay', 'sb-show-nopreview']
        .some(name => document.body.classList.contains(name)));
    } finally {
      page.off('requestfailed', recordAbort);
    }
    const error = await page.evaluate(() => (document.body.classList.contains('sb-show-main')
      ? null
      : document.querySelector('#error-message')?.textContent?.trim() || 'Storybook rendered no story'));
    if (!error) return;
    if (aborted.length === 0 || load === MAX_STORY_LOADS) {
      const cause = aborted.length > 0 ? `; ${transientError} on ${aborted.length} request(s) in each of ${load} loads` : '';
      throw new Error(`${url} did not render: ${error}${cause}`);
    }
    console.warn(`[storybook] ${url}: the browser aborted ${aborted.length} request(s) with ${transientError}; opening it again`);
  }
}
