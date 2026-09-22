/**
 * Interactive production authentication acceptance test.
 *
 * Run manually: `node tests/production-auth-e2e.test.mjs`.
 * It sends real verification emails and may create a test account, therefore
 * it is deliberately excluded from the unattended test suite.
 */
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const baseUrl = (process.env.BASE_URL || 'https://hearthpulse.net').replace(/\/$/, '');
const client = readline.createInterface({ input: stdin, output: stdout });
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function saveCookies(response) {
  for (const header of response.headers.getSetCookie?.() || []) {
    const [pair] = header.split(';', 1);
    const separator = pair.indexOf('=');
    if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

async function ask(question) {
  return client.question(question);
}

async function askSecret(question) {
  const original = client._writeToOutput.bind(client);
  client._writeToOutput = text => { if (text.includes('\n')) original('\n'); };
  try {
    return await client.question(question);
  } finally {
    client._writeToOutput = original;
  }
}

async function request(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader() },
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
  const registration = await request('/api/auth/register', { email, password, name, country, newsletterOptIn: true });
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
