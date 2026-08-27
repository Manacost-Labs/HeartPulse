import {
  parseDeviceAuthorization,
  type DeviceAuthorization,
} from '../schema/deviceAuthorization';

export type ApplicationConnectDecision = 'approve' | 'deny';

export type ApplicationConnectApi = {
  inspect: (userCode: string, signal?: AbortSignal) => Promise<DeviceAuthorization>;
  decide: (userCode: string, decision: ApplicationConnectDecision) => Promise<void>;
};

export class ApplicationConnectApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApplicationConnectApiError';
  }
}

function errorCode(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return '';
  return String((error as { code?: unknown }).code ?? '');
}

function errorMessage(code: string, fallback: string): string {
  if (code === 'AUTHORIZATION_NOT_FOUND' || code === 'INVALID_AUTHORIZATION') {
    return 'Код не найден, уже использован или истёк. Запросите новый код в приложении.';
  }
  if (code === 'LOGIN_REQUIRED') return 'Войдите в аккаунт Manacost, чтобы продолжить.';
  return fallback;
}

function authorizationFrom(payload: unknown): DeviceAuthorization | null {
  if (!payload || typeof payload !== 'object') return null;
  const authorization = (payload as { authorization?: unknown }).authorization;
  return parseDeviceAuthorization(authorization);
}

async function responsePayload(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

export function createApplicationConnectApi(fetchImpl: typeof fetch = fetch): ApplicationConnectApi {
  return {
    async inspect(userCode, signal) {
      const response = await fetchImpl(
        `/api/v1/oauth/device/authorization?user_code=${encodeURIComponent(userCode)}`,
        { credentials: 'same-origin', cache: 'no-store', signal },
      );
      const payload = await responsePayload(response);
      const authorization = authorizationFrom(payload);
      if (!response.ok || !authorization) {
        const code = errorCode(payload);
        throw new ApplicationConnectApiError(
          errorMessage(code, 'Не удалось проверить код. Повторите попытку.'),
          code,
        );
      }
      return authorization;
    },

    async decide(userCode, decision) {
      const response = await fetchImpl('/api/v1/oauth/device/approve', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' },
        body: JSON.stringify({ user_code: userCode, decision }),
      });
      const payload = await responsePayload(response);
      if (!response.ok) {
        const code = errorCode(payload);
        throw new ApplicationConnectApiError(
          errorMessage(code, 'Не удалось сохранить решение. Повторите попытку.'),
          code,
        );
      }
    },
  };
}

export const applicationConnectApi = createApplicationConnectApi();
