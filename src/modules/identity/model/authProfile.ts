import { authUserFromValue, type AuthUser } from './authUser';

export type AuthProfileUpdate = {
  country: string;
  newsletterOptIn: boolean;
  contactVkUrl: string;
  contactTelegram: string;
  contactEmail: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function authUserFromProfilePayload(payload: unknown): AuthUser | null {
  if (!isRecord(payload)
    || !Object.prototype.hasOwnProperty.call(payload, 'success')
    || !Object.prototype.hasOwnProperty.call(payload, 'user')
    || payload.success !== true) return null;
  return authUserFromValue(payload.user);
}
