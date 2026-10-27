// Что видит и делает пользователь в браузерных сценариях: элементы ищутся по
// роли и доступному имени (ARIA-селекторы Puppeteer), фокус читается из дерева
// доступности, буфер обмена — настоящий. Классы и внутреннее состояние
// страницы сценарии не читают.
import { launchBrowser } from '../../scripts/lib/browser-launch.mjs';

/**
 * Chrome для сценария. Ни одно имя хоста не резолвится, поэтому страница на
 * стенде не уходит ни во внешний интернет, ни на прод. Адреса с IP-литералом
 * это правило не закрывает; стенд отдаёт только адреса 127.0.0.1.
 */
export function launchUserBrowser() {
  return launchBrowser({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
  });
}

/** Селектор элемента с этой ролью и точным доступным именем. */
export function role(name, accessibleName) {
  return `::-p-aria([name="${accessibleName}"][role="${name}"])`;
}

/** Ждёт видимый элемент по роли и имени и возвращает его. */
export function findByRole(page, name, accessibleName, timeout = 15_000) {
  return page.waitForSelector(role(name, accessibleName), { visible: true, timeout });
}

/**
 * Ждёт, пока React подключится к элементу из серверного HTML. До этого клик
 * теряется, а ввод в управляемое поле стирается: на медленном раннере так
 * выглядит флейк. Это условие готовности, а не утверждение теста.
 */
function whenInteractive(page, element, timeout = 15_000) {
  return page.waitForFunction(target => Object.keys(target).some(key => key.startsWith('__reactFiber$')),
    { timeout }, element);
}

/** Нажимает видимый элемент по роли и имени, когда страница готова его принять. */
export async function clickByRole(page, name, accessibleName) {
  const element = await findByRole(page, name, accessibleName);
  await whenInteractive(page, element);
  await element.click();
  await element.dispose();
}

/** Печатает текст в поле по роли и имени, когда страница готова его принять. */
export async function typeByRole(page, name, accessibleName, text) {
  const element = await findByRole(page, name, accessibleName);
  await whenInteractive(page, element);
  await element.type(text);
  await element.dispose();
}

/** Ждёт, пока элемента с этой ролью и именем не останется на экране. */
export function waitForRoleGone(page, name, accessibleName, timeout = 15_000) {
  return page.waitForSelector(role(name, accessibleName), { hidden: true, timeout });
}

/** Роль и доступное имя элемента в фокусе. */
export async function focusedControl(page) {
  const focused = await page.evaluateHandle(() => document.activeElement);
  const node = await page.accessibility.snapshot({ root: focused, interestingOnly: false });
  await focused.dispose();
  return { role: node?.role, name: node?.name };
}

/** Недоступен ли элемент для нажатия (`disabled` или `aria-disabled`), как его объявит экранный диктор. */
export async function isDisabled(page, name, accessibleName) {
  const element = await findByRole(page, name, accessibleName);
  const disabled = await element.evaluate(target => target.matches(':disabled, [aria-disabled="true"]'));
  await element.dispose();
  return disabled;
}

/** Значение ARIA-атрибута элемента (`aria-expanded`, `aria-current`…), которое объявит экранный диктор. */
export async function ariaState(page, selector, attribute) {
  const element = await page.waitForSelector(selector, { visible: true });
  const value = await element.evaluate((target, name) => target.getAttribute(name), attribute);
  await element.dispose();
  return value;
}

/** Ждёт, пока кнопка с этим именем не станет нажатой (`aria-pressed`), как её объявит экранный диктор. */
export async function waitForPressed(page, accessibleName, pressed = true, timeout = 15_000) {
  const button = await findByRole(page, 'button', accessibleName, timeout);
  await page.waitForFunction((target, expected) => target.getAttribute('aria-pressed') === expected,
    { timeout }, button, String(pressed));
  await button.dispose();
}

/** Ждёт фокус на элементе с этой ролью и именем. */
export async function waitForFocus(page, name, accessibleName, timeout = 5_000) {
  const element = await page.waitForSelector(role(name, accessibleName), { timeout });
  try {
    await page.waitForFunction(target => document.activeElement === target, { timeout }, element);
  } catch (error) {
    throw new Error(`focus is on ${JSON.stringify(await focusedControl(page))}, not ${name} «${accessibleName}»`, { cause: error });
  } finally {
    await element.dispose();
  }
}

/** Ждёт адрес страницы с этим путём. */
export function waitForPath(page, pathname, timeout = 15_000) {
  return page.waitForFunction(expected => location.pathname === expected, { timeout }, pathname);
}

/** Видимый текст основной области страницы. */
export function mainText(page) {
  return page.$eval('main', main => main.innerText);
}

/** Разрешает странице писать в буфер обмена и даёт тесту его прочитать. */
export async function allowClipboard(browser, origin) {
  await browser.defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-sanitized-write']);
}

/** Текст из буфера обмена, как его вставит пользователь. */
export function clipboardText(page) {
  return page.evaluate(() => navigator.clipboard.readText());
}
