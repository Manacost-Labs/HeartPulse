import { authUserFromSuccessPayload, type AuthUser } from './authUser';

export type AuthProfileUpdate = {
  country: string;
  newsletterOptIn: boolean;
  contactVkUrl: string;
  contactTelegram: string;
  contactEmail: string;
};

export function authUserFromProfilePayload(payload: unknown): AuthUser | null {
  return authUserFromSuccessPayload(payload);
}
