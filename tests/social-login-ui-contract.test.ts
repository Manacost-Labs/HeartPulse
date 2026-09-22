import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const loginPanel = readFileSync(new URL('../src/modules/identity/ui/LoginPanel.tsx', import.meta.url), 'utf8');
const socialLoginLinks = readFileSync(new URL('../src/modules/identity/ui/SocialLoginLinks.tsx', import.meta.url), 'utf8');
const socialLoginStyles = readFileSync(new URL('../src/modules/identity/ui/SocialLoginLinks.css', import.meta.url), 'utf8');

assert.match(loginPanel, /socialProviders: socialLoginProviders,[\s\S]*useTelegramAuthConfig\(\)/);
assert.match(loginPanel, /telegramAuthUrl=\{telegramEnabled && telegramMode !== 'legacy-widget'/);
assert.match(loginPanel, /withDivider=\{telegramMode !== 'legacy-widget'\}/);
assert.match(socialLoginLinks, /login-provider-grid/);
assert.match(socialLoginLinks, /auth-icons\/\$\{provider\}\.svg/);
assert.match(socialLoginLinks, /aria-disabled=\{disabled \|\| undefined\}/);
assert.match(socialLoginLinks, /tabIndex=\{disabled \? -1 : undefined\}/);
assert.match(socialLoginLinks, /onClick=\{disabled \? event => event\.preventDefault\(\) : undefined\}/);
assert.match(socialLoginStyles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
for (const provider of ['telegram', 'google', 'discord', 'yandex', 'patreon']) {
  assert.ok(existsSync(new URL(`../public/auth-icons/${provider}.svg`, import.meta.url)), `missing ${provider} icon`);
}

console.log('social login UI contract passed');
