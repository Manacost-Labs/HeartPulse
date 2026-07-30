import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const docs = readFileSync(new URL('../src/modules/developerApi/ui/DeveloperApiPage.tsx', import.meta.url), 'utf8');
assert.match(docs, /Manacost Public API/);
assert.match(docs, /X-API-Key/);
assert.match(docs, /\/api\/v1\/catalog\/manifest/);
assert.match(docs, /<code>\/api\/v1\/cards<\/code>/);
assert.ok(docs.includes("/api/v1/cards/{'{cardId}'}"));
assert.match(docs, /связанные токены и пулы генерации/);
assert.match(docs, /\/api\/v1\/card-statistics/);
assert.ok(docs.includes("/api/v1/cards/{'{cardId}'}/statistics"));
assert.ok(docs.includes("/api/v1/cards/{'{cardId}'}/statistics/history"));
assert.ok(docs.includes("/api/v1/cards/{'{cardId}'}/images/{'{variant}'}.webp"));
assert.match(docs, /\/api\/v1\/oauth\/device\/code/);
assert.match(docs, /\/api\/v1\/oauth\/token/);
assert.match(docs, /\/api\/v1\/me/);
assert.match(docs, /Access token действует 15 минут/);
assert.match(docs, /системном хранилище/);
assert.equal((docs.match(/tabIndex=\{0\}/g) ?? []).length, 2);
assert.match(docs, /\/api\/v1\/openapi\.json/);
assert.match(docs, /Доступно сейчас/);
assert.match(docs, /Планируется/);

const footer = readFileSync(new URL('../src/components/SiteFooter.tsx', import.meta.url), 'utf8');
assert.match(footer, /href="\/developers\/api\/"/);
assert.match(footer, />API для разработчиков</);

const admin = readFileSync(new URL('../src/modules/developerApi/ui/AdminApiKeys.tsx', import.meta.url), 'utf8');
assert.match(admin, /Секрет повторно не показывается/);
assert.match(admin, /navigator\.clipboard\.writeText/);
assert.match(admin, /window\.confirm/);
assert.match(admin, /setCreated\(null\)/);
assert.match(admin, /statistics\.read/);

console.log('public API documentation UI contract tests passed');
