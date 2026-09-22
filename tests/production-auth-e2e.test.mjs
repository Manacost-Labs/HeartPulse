/**
 * Interactive production authentication acceptance test.
 *
 * Run manually: `node tests/production-auth-e2e.test.mjs`.
 * It sends real verification emails and may create a test account, therefore
 * it is deliberately excluded from the unattended test suite.
 */
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Writable } from 'node:stream';

if (!stdin.isTTY || !stdout.isTTY) {
  console.error('Manual auth acceptance requires an interactive terminal; no requests were sent.');
  process.exit(1);
}

const target = new URL(process.env.BASE_URL || 'https://hearthpulse.net');
if (target.username || target.password || (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)))) {
  throw new Error('Use HTTPS or a local HTTP fixture without URL credentials');
}
const baseUrl = target.origin;
let secretInput = false;
const terminalOutput = new Writable({
  write(chunk, encoding, callback) {
    if (!secretInput) stdout.write(chunk, encoding);
    callback();
  },
});
const client = readline.createInterface({ input: stdin, output: terminalOutput, terminal: true });
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function saveCookies(response) {
  for (const header of response.headers.getSetCookie?.() || []) {
    const [pair] = header.split(';', 1);
    const separator = pair.indexOf('=');
    if (separator > 0) {
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (!value || /;\s*max-age=0(?:;|$)/i.test(header)) jar.delete(name);
      else jar.set(name, value);
    }
  }
}

async function ask(question) {
  return client.question(question);
}

async function askSecret(question) {
  stdout.write(question);
  secretInput = true;
  try {
    return await client.question('');
  } finally {
    secretInput = false;
  }
}

async function request(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl, Cookie: cookieHeader() },
    body: JSON.stringify(body),
  });
  saveCookies(response);
  return { response, payload: await response.json().catch(() => ({})) };
}

async function expectAuthenticated(label) {
  const response = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookieHeader() } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.authenticated !== true) throw new Error(`${label}: сессия не подтверждена`);
  console.log(`✓ ${label}: вход подтверждён`);
}

async function verifyCode(email, label) {
  const code = (await ask(`Введите код из письма для «${label}»: `)).trim();
  if (!/^\d{6}$/.test(code)) throw new Error('Нужен шестизначный код');
  const { response, payload } = await request('/api/auth/verify', { email, code });
  if (!response.ok || payload.success !== true) throw new Error(`${label}: код не принят`);
  await expectAuthenticated(label);
}

async function verifyOAuthStarts() {
  const providers = {
    telegram: 'oauth.telegram.org', google: 'accounts.google.com', discord: 'discord.com',
    yandex: 'oauth.yandex.ru', patreon: 'www.patreon.com',
  };
  for (const [provider, expectedHost] of Object.entries(providers)) {
    const response = await fetch(`${baseUrl}/api/auth/${provider}/start`, { redirect: 'manual' });
    const target = new URL(response.headers.get('location') || '', baseUrl);
    if (response.status !== 302 || target.hostname !== expectedHost) {
      throw new Error(`${provider}: неверное OAuth-перенаправление`);
    }
    console.log(`✓ ${provider}: OAuth-маршрут готов`);
  }
}

try {
  console.log(`Проверка production-авторизации: ${baseUrl}`);
  console.log('Будут отправлены письма с кодами и может быть создан тестовый аккаунт.');
  if ((await ask('Продолжить? Введите YES: ')).trim() !== 'YES') process.exit(0);

  const email = (await ask('Тестовый email: ')).trim().toLowerCase();
  const password = await askSecret('Пароль (не отображается): ');
  stdout.write('\n');
  const name = (await ask('Имя [Auth E2E Test]: ')).trim() || 'Auth E2E Test';
  const country = (await ask('Страна [Poland]: ')).trim() || 'Poland';
  if (!email || password.length < 8) throw new Error('Укажите email и пароль длиной не менее 8 символов');

  await verifyOAuthStarts();
  const registration = await request('/api/auth/register', { email, password, name, country, newsletterOptIn: false });
  if (registration.response.ok) {
    console.log('✓ Регистрация: код отправлен');
    await verifyCode(email, 'регистрация');
  } else if (registration.response.status === 409) {
    console.log('• Аккаунт уже существует — проверяю вход');
  } else {
    throw new Error(`Регистрация не принята: HTTP ${registration.response.status}`);
  }

  const login = await request('/api/auth/login', { email, password });
  if (!login.response.ok) throw new Error(`Вход не принят: HTTP ${login.response.status}`);
  console.log('✓ Вход: код отправлен');
  await verifyCode(email, 'вход');
  console.log('\n✓ Регистрация, доставка кодов, вход и OAuth-маршруты проверены.');
} catch (error) {
  console.error(`\n✗ Проверка не пройдена: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
  process.exitCode = 1;
} finally {
  client.close();
}
