import {
  authUserFromSuccessPayload,
  type AuthUser,
} from './authUser';

export type PasswordLoginResult =
  | { kind: 'authenticated'; user: AuthUser }
  | { kind: 'verification-required' };

export type AuthCommandResult = {
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

export function authCommandFromPayload(payload: unknown): AuthCommandResult | null {
  if (!isRecord(payload)
    || !hasOwn(payload, 'success')
    || payload.success !== true
    || !hasOwn(payload, 'message')
    || typeof payload.message !== 'string') return null;
  return { message: payload.message };
}

export function passwordLoginResultFromPayload(payload: unknown): PasswordLoginResult | null {
  if (!authCommandFromPayload(payload) || !isRecord(payload)) return null;
  const hasAuthenticated = hasOwn(payload, 'authenticated');
  const hasUser = hasOwn(payload, 'user');

  if (!hasAuthenticated && !hasUser) return { kind: 'verification-required' };
  if (payload.authenticated !== true || !hasUser) return null;

  const user = authUserFromSuccessPayload(payload);
  return user ? { kind: 'authenticated', user } : null;
}
