import {
  authCommandFromPayload,
  passwordLoginResultFromPayload,
  type AuthCommandResult,
  type PasswordLoginResult,
} from '../model/authFlow';
import {
  authErrorFromPayload,
  authUserFromSuccessPayload,
  type AuthUser,
} from '../model/authUser';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export type PasswordLoginInput = {
  email: string;
  password: string;
};

export type PasswordRegistrationInput = PasswordLoginInput & {
  name: string;
  country: string;
  newsletterOptIn: boolean;
};

export type PasswordResetRequestInput = {
  email: string;
};

export type EmailCodeInput = PasswordResetRequestInput & {
  code: string;
};

export type PasswordResetConfirmInput = EmailCodeInput & {
  password: string;
};

async function postGuestAuthJson(
  url: string,
  body: Record<string, unknown>,
  fallbackError: string,
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(authErrorFromPayload(payload) || fallbackError);
  return payload;
}

function requireCommandResult(payload: unknown, fallbackError: string): AuthCommandResult {
  const result = authCommandFromPayload(payload);
  if (!result) throw new Error(fallbackError);
  return result;
}

export async function requestPasswordLogin(input: PasswordLoginInput): Promise<PasswordLoginResult> {
  const payload = await postGuestAuthJson('/api/auth/login', {
    email: input.email,
    password: input.password,
  }, 'Ошибка входа');
  const result = passwordLoginResultFromPayload(payload);
  if (!result) throw new Error('Ошибка входа');
  return result;
}

export async function registerPasswordAccount(input: PasswordRegistrationInput): Promise<void> {
  const payload = await postGuestAuthJson('/api/auth/register', {
    email: input.email,
    name: input.name,
    country: input.country,
    newsletterOptIn: input.newsletterOptIn,
    password: input.password,
  }, 'Ошибка регистрации');
  requireCommandResult(payload, 'Ошибка регистрации');
}

export async function requestPasswordReset(
  input: PasswordResetRequestInput,
): Promise<AuthCommandResult> {
  const payload = await postGuestAuthJson('/api/auth/password-reset/request', {
    email: input.email,
  }, 'Не удалось отправить код');
  return requireCommandResult(payload, 'Не удалось отправить код');
}

export async function confirmPasswordReset(input: PasswordResetConfirmInput): Promise<void> {
  const payload = await postGuestAuthJson('/api/auth/password-reset/confirm', {
    email: input.email,
    code: input.code,
    password: input.password,
  }, 'Не удалось обновить пароль');
  requireCommandResult(payload, 'Не удалось обновить пароль');
}

export async function verifyEmailAuthCode(input: EmailCodeInput): Promise<AuthUser> {
  const payload = await postGuestAuthJson('/api/auth/verify', {
    email: input.email,
    code: input.code,
  }, 'Неверный код');
  const user = authUserFromSuccessPayload(payload);
  if (!user) throw new Error('Неверный код');
  return user;
}
