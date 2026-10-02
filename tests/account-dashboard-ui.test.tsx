import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AccountAccessCard, { type BoostyConfirmation } from '../src/modules/identity/ui/AccountAccessCard';
import AccountContests from '../src/modules/identity/ui/AccountContests';
import AccountLinks from '../src/modules/identity/ui/AccountLinks';
import AccountSettings from '../src/modules/identity/ui/AccountSettings';
import type { AuthUser } from '../src/modules/identity/public';
import type { SubscriptionStatus } from '../src/modules/subscriptions/public';

const noop = () => {};
const boosty: BoostyConfirmation = {
  email: '', code: '', step: 'email', busy: false,
  onEmailChange: noop, onCodeChange: noop, onSubmit: noop,
};
const user = { id: 'user-1', email: 'maria@example.com', name: 'Мария', role: 'user' } as AuthUser;
const telegram = { userId: 'user-1', mode: 'oidc' as const, botUsername: '', onMessage: noop };

function subscription(patch: Partial<SubscriptionStatus> = {}): SubscriptionStatus {
  return {
    hasAccess: false, source: 'none', checkedAt: null, stale: false, message: '',
    boosty: {}, patreon: {}, telegram: {}, ...patch,
  };
}

const active = subscription({
  hasAccess: true, source: 'boosty',
  entitlements: { arena: true, battlegrounds: false, standard: true },
  boosty: { hasAccess: true, levelName: 'Алмаз', price: 300 },
});

function accessCard(input: { subscription: SubscriptionStatus | null; pending?: boolean; boosty?: BoostyConfirmation }) {
  return renderToStaticMarkup(
    <AccountAccessCard
      subscription={input.subscription}
      pending={input.pending ?? false}
      checkedAt="02.10, 21:34"
      onRefresh={noop}
      boosty={input.boosty ?? boosty}
      patreonLinkUrl="/api/auth/patreon/start"
    />,
  );
}

const sectionLinks = (markup: string) => [...markup.matchAll(/<a class="account-access__tile" href="([^"]+)"/g)].map(match => match[1]);

test('an active subscription names its source and links the open sections before the closed ones', () => {
  const markup = accessCard({ subscription: active });
  assert.match(markup, /Доступ открыт/);
  assert.match(markup, /Boosty · Алмаз · 300 ₽ · проверено 02\.10, 21:34/);
  assert.deepEqual(sectionLinks(markup), ['/tierlist/', '/standard/meta/']);
  assert.ok(markup.indexOf('/standard/meta/') < markup.indexOf('account-access__tile--locked'), 'closed sections follow the open ones');
  assert.match(markup, /<button[^>]*>Проверить снова<\/button>/);
  assert.doesNotMatch(markup, /account-boosty-email/, 'a subscriber is not asked to confirm Boosty again');
});

test('a refresh keeps the open sections on screen and only disables the button', () => {
  const markup = accessCard({ subscription: active, pending: true });
  assert.deepEqual(sectionLinks(markup), ['/tierlist/', '/standard/meta/']);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>Проверяем…<\/button>/);
});

test('the first check shows a neutral state without forms or sections', () => {
  const markup = accessCard({ subscription: null, pending: true });
  assert.match(markup, /Проверяем доступ/);
  assert.doesNotMatch(markup, /account-access__tile|account-boosty-email/);
});

test('without access the card offers Boosty, Patreon and a subscription, and lists what opens', () => {
  const markup = accessCard({ subscription: subscription({ patreon: { configured: true, connected: false } }) });
  assert.match(markup, /Откройте полный доступ/);
  assert.match(markup, /<label for="account-boosty-email">Почта, на которую оформлена подписка<\/label>/);
  assert.match(markup, /<button type="submit"[^>]*>Прислать код<\/button>/);
  assert.match(markup, /href="\/api\/auth\/patreon\/start"[^>]*>Подключить Patreon/);
  assert.match(markup, /href="https:\/\/boosty\.to\/kolodahearthstone" target="_blank" rel="noreferrer"/);
  assert.equal(sectionLinks(markup).length, 0, 'closed sections are not links');
  assert.equal(markup.match(/account-access__tile--locked/g)?.length, 7);
});

test('the Boosty code step asks for the one-time code', () => {
  const markup = accessCard({ subscription: subscription(), boosty: { ...boosty, email: 'maria@example.com', step: 'code' } });
  assert.match(markup, /autoComplete="one-time-code"|autocomplete="one-time-code"/);
  assert.match(markup, /<button type="submit"[^>]*>Подтвердить код<\/button>/);
});

test('sign-in methods show what is linked and how to link the rest', () => {
  const markup = renderToStaticMarkup(
    <AccountLinks user={user} subscription={subscription({ patreon: { configured: true } })} telegram={telegram} patreonLinkUrl="/api/auth/patreon/start" />,
  );
  assert.match(markup, /maria@example\.com/);
  assert.match(markup, /data-tour-id="profile-telegram-access"/);
  assert.match(markup, /<a class="[^"]*" href="#account-access">Подтвердить<\/a>/);
  assert.match(markup, /href="\/api\/auth\/patreon\/start">Подключить<\/a>/);
  const withoutPatreon = renderToStaticMarkup(
    <AccountLinks user={user} subscription={active} telegram={telegram} patreonLinkUrl="/api/auth/patreon/start" />,
  );
  assert.doesNotMatch(withoutPatreon, /Patreon|href="#account-access"/);
});

test('contest history is one quiet line until there are entries', () => {
  const empty = renderToStaticMarkup(<AccountContests entries={[]} loading={false} />);
  assert.match(empty, /Вы ещё не участвовали в конкурсах/);
  assert.match(empty, /href="\/contests\/"/);
  const entries = renderToStaticMarkup(<AccountContests loading={false} entries={[{
    id: 'e1', contestId: 'c1', title: 'Турнир сборок', prize: 'Набор карт', imageUrl: '',
    status: 'completed', entryStatus: 'approved', joinedAt: '2026-09-12T10:00:00Z', isWinner: true,
  }]} />);
  assert.match(entries, /Турнир сборок/);
  assert.match(entries, /Завершён · участие одобрено/);
  assert.match(entries, /Приз: Набор карт/);
  assert.match(entries, /Победа/);
});

test('prize contacts stay folded and every field has its label', () => {
  const markup = renderToStaticMarkup(
    <AccountSettings
      values={{ country: '', telegram: '', vkUrl: 'vk.com/maria', contactEmail: '', newsletter: false }}
      countries={['Россия']}
      saving={false}
      onChange={noop}
      onSubmit={noop}
    />,
  );
  assert.match(markup, /<details id="account-settings"/);
  assert.doesNotMatch(markup, /<details[^>]* open/);
  for (const id of ['account-country', 'account-telegram', 'account-vk', 'account-contact-email']) {
    assert.match(markup, new RegExp(`<label for="${id}">`), `${id} has a label`);
  }
  assert.doesNotMatch(markup, /type="url"/, 'a VK name without https:// must stay valid');
});
