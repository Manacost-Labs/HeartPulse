import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LoginCard, { type LoginCardProps } from '../src/modules/identity/ui/LoginCard';

const noop = () => {};

function card(patch: Partial<LoginCardProps> = {}): string {
  return renderToStaticMarkup(
    <LoginCard
      mode="login"
      step="password"
      message={null}
      loading={false}
      values={{ name: '', country: '', email: 'maria@example.com', password: '', code: '', newsletter: false }}
      countries={['Россия']}
      onChange={noop}
      onModeChange={noop}
      onSubmit={noop}
      onEditCredentials={noop}
      providers={<div className="providers-slot">Telegram</div>}
      {...patch}
    />,
  );
}

test('sign-in names the page, labels its fields and offers the other ways in', () => {
  const markup = card();
  assert.match(markup, /<h1 id="login-card-title"[^>]*>Вход в HearthPulse<\/h1>/);
  assert.match(markup, /<span>Почта<\/span><input type="email"/);
  assert.match(markup, /autoComplete="current-password"|autocomplete="current-password"/);
  assert.match(markup, /<button type="submit"[^>]*>Получить код<\/button>/);
  assert.match(markup, /providers-slot/);
  assert.match(markup, />Забыли пароль\?<\/button>/);
  assert.match(markup, /href="\/terms\/"[\s\S]*href="\/privacy\/"/);
});

test('registration asks for the newsletter as an optional, unchecked choice', () => {
  const markup = card({ mode: 'register' });
  assert.match(markup, /Регистрация в HearthPulse/);
  const consent = markup.match(/<label class="login-consent"><input type="checkbox"[^>]*>/)?.[0] ?? '';
  assert.ok(consent, 'the newsletter checkbox is shown');
  assert.doesNotMatch(consent, /required/, 'the newsletter is not a condition of registration');
  assert.doesNotMatch(consent, /checked/, 'the newsletter starts unchecked');
  assert.match(markup, /<button type="submit"[^>]*>Создать аккаунт<\/button>/);
  assert.doesNotMatch(markup, /providers-slot|Забыли пароль/);
});

test('the code step explains where the code went and hides the other ways in', () => {
  const markup = card({ step: 'code' });
  assert.match(markup, /Код отправлен на <b>maria@example\.com<\/b>/);
  assert.match(markup, /«Спам»/);
  assert.match(markup, /autoComplete="one-time-code"|autocomplete="one-time-code"/);
  assert.match(markup, /<button type="submit"[^>]*>Войти<\/button>/);
  assert.match(markup, />Изменить почту или пароль<\/button>/);
  assert.doesNotMatch(markup, /providers-slot|login-mode-tabs/);
});

test('password reset sets a new password with the emailed code', () => {
  const request = card({ mode: 'reset' });
  assert.match(request, /Восстановление пароля/);
  assert.doesNotMatch(request, /type="password"|login-mode-tabs/);
  assert.match(request, />Вернуться ко входу<\/button>/);
  const confirm = card({ mode: 'reset', step: 'code' });
  assert.match(confirm, /<span>Новый пароль<\/span>/);
  assert.match(confirm, /<button type="submit"[^>]*>Сменить пароль<\/button>/);
});

test('errors are alerts and confirmations are status messages', () => {
  assert.match(card({ message: { type: 'err', text: 'Неверный пароль' } }), /role="alert"[^>]*>Неверный пароль/);
  assert.match(card({ message: { type: 'ok', text: 'Код отправлен' } }), /role="status"[^>]*>Код отправлен/);
  assert.match(card({ loading: true }), /<button type="submit"[^>]*disabled=""[^>]*>Проверяем…<\/button>/);
});

test('inside another page the card takes the heading level it is given', () => {
  const markup = card({ headingLevel: 3 });
  assert.match(markup, /<h3 id="login-card-title"[^>]*>Вход в HearthPulse<\/h3>/);
  assert.doesNotMatch(markup, /<h1/);
});

test('the password toggle sits beside its label, so the field is named by the label alone', () => {
  const markup = card();
  const field = markup.match(/<div class="login-password-field">([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.match(field, /<label class="login-field"><span>Пароль<\/span><input[^>]*><\/label><button type="button"/);
});
