import type { AuthProfilePatch } from './model.js';

export type AuthProfileContactNormalizers = {
  normalizeContactEmail: (value: unknown) => string;
  normalizeContactTelegram: (value: unknown) => string;
  normalizeContactVkUrl: (value: unknown) => string;
};

type ProfileParseResult =
  | { ok: true; patch: AuthProfilePatch }
  | { ok: false; error: string };

type TextFieldResult =
  | { present: false }
  | { present: true; value: string }
  | { present: true; error: string };

const hasControlCharacters = (value: string) => /[\u0000-\u001f\u007f]/.test(value);

function readTextField(
  body: Record<string, unknown>,
  field: string,
  label: string,
  maxLength: number,
): TextFieldResult {
  if (!(field in body)) return { present: false };
  const raw = body[field];
  if (typeof raw !== 'string') return { present: true, error: `${label}: ожидается строка` };
  const value = raw.trim();
  if (value.length > maxLength) return { present: true, error: `${label}: превышена допустимая длина` };
  if (hasControlCharacters(value)) return { present: true, error: `${label}: недопустимые символы` };
  return { present: true, value };
}

export function parseAuthProfilePatch(
  value: unknown,
  normalizers: AuthProfileContactNormalizers,
): ProfileParseResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Тело запроса должно быть объектом' };
  }
  const body = value as Record<string, unknown>;
  const patch: AuthProfilePatch = {};

  if ('newsletterOptIn' in body) {
    if (typeof body.newsletterOptIn !== 'boolean') {
      return { ok: false, error: 'Некорректное значение согласия на рассылку' };
    }
    patch.newsletterOptIn = body.newsletterOptIn;
  }

  const country = readTextField(body, 'country', 'Страна', 80);
  if ('error' in country) return { ok: false, error: country.error };
  if (country.present) patch.country = country.value;

  const telegram = readTextField(body, 'contactTelegram', 'Telegram', 80);
  if ('error' in telegram) return { ok: false, error: telegram.error };
  if (telegram.present) {
    patch.contactTelegram = normalizers.normalizeContactTelegram(telegram.value);
  }

  const email = readTextField(body, 'contactEmail', 'Контактный email', 254);
  if ('error' in email) return { ok: false, error: email.error };
  if (email.present) {
    const normalized = normalizers.normalizeContactEmail(email.value);
    if (email.value && !normalized) return { ok: false, error: 'Контактный email указан некорректно' };
    patch.contactEmail = normalized;
  }

  const vk = readTextField(body, 'contactVkUrl', 'Ссылка VK', 240);
  if ('error' in vk) return { ok: false, error: vk.error };
  if (vk.present) {
    const normalized = normalizers.normalizeContactVkUrl(vk.value);
    if (vk.value && !normalized) return { ok: false, error: 'Ссылка VK указана некорректно' };
    patch.contactVkUrl = normalized;
  }

  return { ok: true, patch };
}
