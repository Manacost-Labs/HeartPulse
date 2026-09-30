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
