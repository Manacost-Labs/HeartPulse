import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { register } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { type BoostyConfirmation } from '../src/modules/identity/ui/AccountAccessOptions';
import { accountPlanSummary } from '../src/modules/identity/model/accountPlan';
import AccountContests from '../src/modules/identity/ui/AccountContests';
import AccountLinks from '../src/modules/identity/ui/AccountLinks';
import AccountSessions from '../src/modules/identity/ui/AccountSessions';
import AccountSettings from '../src/modules/identity/ui/AccountSettings';
import { accountSessionDetail, accountSessionsFromPayload, revokedSessionsMessage } from '../src/modules/identity/model/accountSessions';
import { TelegramAccountLinkActionsView } from '../src/modules/identity/ui/TelegramAccountLinkActions';
import type { AuthUser } from '../src/modules/identity/public';
import type { SubscriptionStatus } from '../src/modules/subscriptions/public';

// The plan section and the hero bring their stylesheets, as the bundler expects;
// Node gets an empty module for each so the markup renders here.
register('data:text/javascript,export async function load(url, context, next) { return url.endsWith(".css") ? { format: "module", source: "", shortCircuit: true } : next(url, context); }');
const { default: AccountHero } = await import('../src/modules/identity/ui/AccountHero');
const { default: AccountPlanSection } = await import('../src/modules/identity/ui/AccountPlanSection');
const { default: AccountBillingPlanCard } = await import('../src/features/AccountBillingPlanCard');
const { AccountPlanCardSlot } = await import('../src/modules/identity/ui/accountPlanCardSlot');

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

const NOW = Date.parse('2026-10-21T12:00:00.000Z');

function accessCard(input: { subscription: SubscriptionStatus | null; loading?: boolean; checked?: boolean; checkedAt?: string; boosty?: BoostyConfirmation; composed?: boolean }) {
  return renderToStaticMarkup(
    <AccountPlanCardSlot.Provider value={input.composed === false ? null : AccountBillingPlanCard}>
      <AccountPlanSection
        plan={accountPlanSummary(input.subscription, input.checked ?? true, NOW)}
        subscription={input.subscription}
        loading={input.loading ?? false}
        checkedAt={input.checkedAt ?? '02.10, 21:34'}
        onRefresh={noop}
        boosty={input.boosty ?? boosty}
        patreonLinkUrl="/api/auth/patreon/start"
      />
    </AccountPlanCardSlot.Provider>,
  );
}

const sectionLinks = (markup: string) => [...markup.matchAll(/<a class="account-access__tile" href="([^"]+)"/g)].map(match => match[1]);

test('an active subscription shows the plan card and links the open sections before the closed ones', () => {
  const markup = accessCard({ subscription: active });
  assert.match(markup, /Ваш план/);
  assert.match(markup, /ui-billing-plan-card/);
  assert.match(markup, />Алмаз</);
  assert.match(markup, /300\s₽/);
  assert.match(markup, /\/ месяц/);
  assert.match(markup, /Проверено 02\.10, 21:34/);
  assert.match(markup, /Управлять на Boosty/);
  assert.deepEqual(sectionLinks(markup), ['/tierlist/', '/standard/meta/']);
  assert.ok(markup.indexOf('/standard/meta/') < markup.indexOf('account-access__tile--locked'), 'closed sections follow the open ones');
  assert.match(markup, /<button[^>]*>Проверить снова<\/button>/);
  assert.doesNotMatch(markup, /account-boosty-email/, 'a subscriber is not asked to confirm Boosty again');
});

test('a refresh keeps the open sections on screen and only disables the button', () => {
  const markup = accessCard({ subscription: active, loading: true });
  assert.deepEqual(sectionLinks(markup), ['/tierlist/', '/standard/meta/']);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>Проверяем…<\/button>/);
});

test('the first check shows a neutral state without forms, sections or a button', () => {
  const markup = accessCard({ subscription: null, loading: true, checked: false });
  assert.match(markup, /Проверяем подписку…/);
  assert.doesNotMatch(markup, /account-access__tile|account-boosty-email|<button/);
});

test('a failed first check offers a retry and Boosty, not a subscription offer', () => {
  const markup = accessCard({ subscription: null, checked: true });
  assert.match(markup, /Не удалось проверить подписку/);
  assert.match(markup, /<button[^>]*>Проверить снова<\/button>/);
  assert.match(markup, /account-boosty-email/, 'Boosty can still be confirmed while the status check fails');
  assert.doesNotMatch(markup, /boosty\.to|Доступ закрыт|account-access__tile/);
  const retrying = accessCard({ subscription: null, checked: true, loading: true });
  assert.match(retrying, /<button[^>]*disabled=""[^>]*>Проверяем…<\/button>/, 'a retry keeps the same card');
});

test('without access the subscription can be checked again', () => {
  assert.match(accessCard({ subscription: subscription() }), /<button[^>]*>Проверить снова<\/button>/);
});

test('an administrator grant shows its note and no check date it does not have', () => {
  const markup = accessCard({
    subscription: subscription({ hasAccess: true, source: 'manual-access', message: 'Бессрочный доступ выдан администратором.' }),
    checkedAt: '',
  });
  assert.equal(markup.match(/Бессрочный доступ выдан администратором\./g)?.length, 1, 'the grant message is shown once');
  assert.doesNotMatch(markup, /Проверено|ui-billing-plan-card/, 'a grant has no price card and no check time');
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

test('Telegram link actions appear only for an unlinked account that can link', () => {
  const links = (input: { user: AuthUser; mode?: 'oidc' | 'disabled' }) => renderToStaticMarkup(
    <AccountLinks user={input.user} subscription={active} telegram={{ ...telegram, mode: input.mode ?? 'oidc' }} patreonLinkUrl="" />,
  );
  assert.match(links({ user }), /account-links__telegram/);
  assert.doesNotMatch(links({ user: { ...user, telegramLinked: true } as AuthUser }), /account-links__telegram/);
  assert.doesNotMatch(links({ user, mode: 'disabled' }), /account-links__telegram/, 'no empty actions without OIDC or a bot');
  const view = renderToStaticMarkup(
    <TelegramAccountLinkActionsView mode="disabled" botUsername="" action={null} code="" expiresAt="" onOidcLink={noop} onBotCodeRequest={noop} />,
  );
  assert.equal(view, '');
});

test('before the first check the Boosty row offers no confirmation shortcut', () => {
  const markup = renderToStaticMarkup(
    <AccountLinks user={user} subscription={null} telegram={telegram} patreonLinkUrl="" />,
  );
  assert.doesNotMatch(markup, /href="#account-access"/);
  assert.match(markup, /Статус появится после проверки/);
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

test('the newsletter comes first, then prize contacts, and every field has its label', () => {
  const markup = renderToStaticMarkup(
    <AccountSettings
      values={{ country: '', telegram: '', vkUrl: 'vk.com/maria', contactEmail: '', newsletter: false }}
      countries={['Россия']}
      saving={false}
      onChange={noop}
      onSubmit={noop}
    />,
  );
  assert.match(markup, /<section id="account-settings"[^>]*aria-labelledby="account-settings-title"/);
  assert.ok(markup.indexOf('account-settings__newsletter') < markup.indexOf('account-settings__contacts'), 'the newsletter switch is not hidden under the contacts');
  for (const id of ['account-country', 'account-telegram', 'account-vk', 'account-contact-email']) {
    assert.match(markup, new RegExp(`<label for="${id}">`), `${id} has a label`);
  }
  assert.doesNotMatch(markup, /type="url"/, 'a VK name without https:// must stay valid');
});

test('the account offers section navigation and help with clear contact groups', () => {
  const markup = renderToStaticMarkup(
    <AccountSettings values={{ country: '', telegram: '', vkUrl: '', contactEmail: '', newsletter: false }}
      countries={[]} saving={false} onChange={noop} onSubmit={noop} />,
  );
  assert.match(markup, /<fieldset/);
  assert.match(markup, /<legend>Контакты для призов<\/legend>/);
  assert.match(markup, /<legend>Рассылка<\/legend>/);
  assert.match(markup, /href="\/faq\/#faq-newsletter"/);
});

const renewing = (willRenew?: boolean) => subscription({
  hasAccess: true, source: 'boosty', entitlements: { arena: true },
  boosty: { hasAccess: true, levelName: 'Алмаз', price: 300, dates: { nextPaymentAt: '2026-11-12T09:00:00.000Z' }, ...(willRenew === undefined ? {} : { willRenew }) },
});

test('without a composed card the plain plate keeps the price, date and Boosty link', () => {
  const plate = accessCard({ subscription: renewing(false), composed: false });
  assert.doesNotMatch(plate, /ui-billing-plan-card/);
  assert.match(plate, /<strong>300 ₽<\/strong> \/ месяц/);
  assert.match(plate, /Доступ до: 12 ноября 2026/);
  assert.match(plate, /href="https:\/\/boosty\.to\/kolodahearthstone" target="_blank" rel="noreferrer">Управлять на Boosty/);
});

test('the plan card names the paid-until date and whether it renews', () => {
  const auto = accessCard({ subscription: renewing(true) });
  assert.match(auto, /Следующий платёж/);
  assert.match(auto, /12 ноября 2026/);
  assert.match(auto, /Активна/);
  const ends = accessCard({ subscription: renewing(false) });
  assert.match(ends, /Доступ до/);
  assert.match(ends, /Не продлится/);
  const unknown = accessCard({ subscription: renewing() });
  assert.match(unknown, /Оплачено до/);
});

test('the hero names the plan once and offers the profile and logout actions', () => {
  const hero = (input: SubscriptionStatus | null, checked = true) => renderToStaticMarkup(
    <AccountHero user={user} name="Мария" contact="maria@example.com" plan={accountPlanSummary(input, checked, NOW)}
      publicProfileHref="/id/7/" linkCopied={false} onCopyLink={noop} onLogout={noop} />,
  );
  const subscriber = hero(renewing(true));
  assert.match(subscriber, /<h1 id="account-title">Мария<\/h1>/);
  assert.match(subscriber, /Подписка активна/);
  assert.match(subscriber, /Boosty · до 12 нояб\., продлится автоматически/);
  assert.match(subscriber, /href="\/id\/7\/"/);
  assert.equal(subscriber.match(/>Выйти</g)?.length, 1);
  const free = hero(subscription());
  assert.equal(free.match(/Без подписки/g)?.length, 1, 'no repeated status');
  assert.match(free, /href="#account-access"/);
  assert.match(hero(null, false), /Проверяем/);
});

test('social providers show their link state only once it is known', () => {
  const providers = [{ provider: 'google', authUrl: '/api/auth/google/start?returnTo=x' }, { provider: 'discord', authUrl: '/api/auth/discord/start' }, { provider: 'vk', authUrl: '/x' }];
  const links = (linked: Set<string> | null) => renderToStaticMarkup(
    <AccountLinks user={user} subscription={active} telegram={telegram} patreonLinkUrl="" social={{ providers, linked }} />,
  );
  const unknown = links(null);
  assert.doesNotMatch(unknown, /Google|Discord/, 'unknown state is not shown as unlinked');
  const known = links(new Set(['google']));
  assert.match(known, /Google[\s\S]*Привязан/);
  assert.doesNotMatch(known, /href="\/api\/auth\/google\/start/);
  assert.match(known, /href="\/api\/auth\/discord\/start">Привязать<\/a>/);
  assert.doesNotMatch(known, /href="\/x"/, 'unsupported providers are ignored');
});

test('active sessions: this browser first, others can be ended, all others only after a confirmation', () => {
  const now = Date.parse('2026-10-21T12:00:00.000Z');
  const sessions = accountSessionsFromPayload({ sessions: [
    { id: 'this-browser-session-1', current: true, device: 'Chrome · Windows', place: 'Россия', signedInAt: '2026-10-01T10:00:00.000Z', lastActiveAt: '2026-10-21T11:59:40.000Z' },
    { id: 'phone-session-id-00001', current: false, device: 'Safari · iPhone', place: 'Европа', signedInAt: '2026-10-02T10:00:00.000Z', lastActiveAt: '2026-10-21T11:48:00.000Z' },
    { id: 'old-session-id-000001', current: false, device: '', place: null, signedInAt: '2026-10-03T10:00:00.000Z', lastActiveAt: null },
    { current: true },
  ] });
  assert.ok(sessions);
  assert.equal(sessions.length, 3, 'an entry without an id is dropped');
  assert.equal(accountSessionsFromPayload({ error: 'x' }), null);
  assert.equal(accountSessionDetail(sessions[1], now), 'Европа · активен 12 мин назад');
  assert.equal(accountSessionDetail(sessions[0], now), 'Россия · активен только что');
  assert.equal(accountSessionDetail({ ...sessions[1], lastActiveAt: '2026-10-21T09:00:00.000Z' }, now), 'Европа · активен 3 ч назад');
  assert.equal(accountSessionDetail(sessions[2], now), 'вход 3 окт.');
  assert.equal(revokedSessionsMessage(2), 'Завершено 2 сеанса.');

  const control = { sessions, failed: false, busy: null, revoke: noop, revokeOthers: noop };
  const html = renderToStaticMarkup(<AccountSessions control={control} now={now} />);
  assert.match(html, /Активные сеансы/);
  assert.match(html, /Chrome · Windows[\s\S]*Этот браузер[\s\S]*Safari · iPhone[\s\S]*Завершить/);
  assert.equal(html.match(/>Завершить</g)?.length, 2, 'every other session, never this browser');
  assert.match(html, /Неизвестное устройство/);
  assert.match(html, /Выйти на всех других устройствах/);
  assert.doesNotMatch(html, /alertdialog/, 'the confirmation appears only when asked');
  assert.match(renderToStaticMarkup(<AccountSessions control={{ ...control, busy: 'others' }} now={now} />), /Завершаем…/);

  const alone = renderToStaticMarkup(<AccountSessions control={{ ...control, sessions: [sessions[0]] }} now={now} />);
  assert.doesNotMatch(alone, /Выйти на всех других устройствах/, 'nothing to end elsewhere');
  assert.equal(renderToStaticMarkup(<AccountSessions control={{ ...control, sessions: null, failed: true }} />), '', 'no empty block');
  assert.match(renderToStaticMarkup(
    <AccountLinks user={user} subscription={active} telegram={telegram} patreonLinkUrl="" sessions={control} />,
  ), /id="account-links"[\s\S]*Активные сеансы/, 'the list lives in «Вход и привязки»');
});
