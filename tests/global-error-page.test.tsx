import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// apps/public-web compiles JSX for Next.js (`preserve`), so outside Next its
// files fall back to the classic runtime and look for a global React.
Object.assign(globalThis, { React });
const { default: GlobalError } = await import('../apps/public-web/app/global-error');

// The page that replaces the whole document when the root layout fails. Its
// reload-once behaviour lives in chunkReloadGuard (tests/chunk-reload-guard.test.ts).
const render = (error: Error & { digest?: string }) => renderToStaticMarkup(<GlobalError error={error} />);

const chunk = new Error('Loading chunk 8039 failed. (error: https://hearthpulse.net/_next/static/chunks/8039.js)');
chunk.name = 'ChunkLoadError';
const chunkPage = render(chunk);
assert.match(chunkPage, /^<html lang="ru">/, 'a whole Russian document, not the English framework default');
assert.match(chunkPage, /data-app-error="global"/, 'the production observer and browser QA recognise it');
assert.match(chunkPage, /<h1 id="global-error-title"[^>]*>Страница не догрузилась<\/h1>/);
assert.match(chunkPage, /прервалась связь или сайт только что обновился/);
assert.match(chunkPage, /<button type="button"[^>]*>Обновить страницу<\/button>/);
assert.match(chunkPage, /<a href="\/"[^>]*>На главную<\/a>/);
assert.match(chunkPage, /<meta name="robots" content="noindex"\/>/);
assert.doesNotMatch(chunkPage, /<link[^>]+stylesheet|<script/i, 'it needs no stylesheet or script loaded separately');

const crash = Object.assign(new Error('Cannot read properties of undefined'), { digest: '2930861743' });
const crashPage = render(crash);
assert.match(crashPage, />Что-то пошло не так<\/h1>/, 'any other failure gets the general copy');
assert.match(crashPage, /Код ошибки: 2930861743/, 'a server error shows its digest for the log');
console.log('global error page: ok');
