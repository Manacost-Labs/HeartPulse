import assert from 'node:assert/strict';
import express from 'express';
import {
  createNewsletterUnsubscribeRouter,
  unsubscribeNewsletterContact,
  type NewsletterUnsubscribeContact,
  type NewsletterUnsubscribeStore,
} from '../server/newsletterUnsubscribeRoutes.js';

type State = { contactStatus: string; userOptIn: boolean };
let state: State = { contactStatus: 'subscribed', userOptIn: true };
let resolveFailure = false;
let updateUserFailure = false;
const contact: NewsletterUnsubscribeContact = { id: 'mail_0123456789abcdef01234567', userId: 'user-1', consentStatus: 'subscribed' };

const store: NewsletterUnsubscribeStore = {
  transaction: work => {
    const before = { ...state };
    try { return work(); } catch (error) { state = before; throw error; }
  },
  updateContact: () => { state.contactStatus = 'unsubscribed'; },
  updateUser: () => {
    if (updateUserFailure) throw new Error('/private/ecosystem.sqlite');
    state.userOptIn = false;
  },
};

const app = express();
app.use(express.json({ strict: false }));
app.use(express.urlencoded({ extended: false }));
app.use('/api', createNewsletterUnsubscribeRouter({
  resolveContact: token => {
    if (resolveFailure) throw new Error('/private/ecosystem.sqlite');
    if (token === 'valid-token') return { ...contact, consentStatus: state.contactStatus };
    return null;
  },
  unsubscribe: (target, timestamp) => unsubscribeNewsletterContact(store, target, timestamp),
  escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
  setPrivateNoStore: response => { response.set('Cache-Control', 'private, no-store'); },
  now: () => new Date('2026-07-13T04:00:00.000Z'),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/newsletter/unsubscribe`;

try {
  const invalid = await fetch(`${base}?token=invalid`);
  assert.equal(invalid.status, 400);
  assert.match(invalid.headers.get('content-type') || '', /text\/html/);
  assert.equal(invalid.headers.get('cache-control'), 'private, no-store');
  assert.match(invalid.headers.get('content-security-policy') || '', /form-action 'self'/);
  assert.equal(invalid.headers.get('referrer-policy'), 'no-referrer');
  assert.match(await invalid.text(), /<meta name="referrer" content="no-referrer">/);

  const confirmation = await fetch(`${base}?token=valid-token`);
  assert.equal(confirmation.status, 200);
  const confirmationHtml = await confirmation.text();
  assert.match(confirmationHtml, /<meta name="referrer" content="no-referrer">/);
  assert.match(confirmationHtml, /Подтвердить отписку/);
  assert.match(confirmationHtml, /name="token" value="valid-token"/);

  resolveFailure = true;
  const failedLookup = await fetch(`${base}?token=valid-token`);
  assert.equal(failedLookup.status, 500);
  assert.doesNotMatch(await failedLookup.text(), /private|sqlite/i);
  resolveFailure = false;

  updateUserFailure = true;
  const failedMutation = await fetch(base, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=valid-token',
  });
  assert.equal(failedMutation.status, 500);
  assert.deepEqual(state, { contactStatus: 'subscribed', userOptIn: true }, 'contact update was not rolled back');
  updateUserFailure = false;

  const browserPost = await fetch(base, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=valid-token',
  });
  assert.equal(browserPost.status, 200);
  assert.match(browserPost.headers.get('content-type') || '', /text\/html/);
  assert.deepEqual(state, { contactStatus: 'unsubscribed', userOptIn: false });

  const already = await fetch(`${base}?token=valid-token`);
  const alreadyHtml = await already.text();
  assert.match(alreadyHtml, /Вы уже отписаны/);
  assert.doesNotMatch(alreadyHtml, /<form/i);

  state = { contactStatus: 'subscribed', userOptIn: true };
  const oneClick = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'token=valid-token&List-Unsubscribe=One-Click',
  });
  assert.equal(oneClick.status, 200);
  assert.deepEqual(await oneClick.json(), { success: true });

  const oversized = await fetch(`${base}?token=${'a'.repeat(513)}`);
  assert.equal(oversized.status, 400);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('newsletter unsubscribe router and atomic mutation tests passed');
