function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/** Browser-safe runtime boundary for the device authorization wire payload. */
export function parseDeviceAuthorization(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const authorization = value as Record<string, unknown>;
  if (
    typeof authorization.clientId !== 'string'
    || typeof authorization.clientName !== 'string'
    || !isStringArray(authorization.scopes)
    || typeof authorization.expiresAt !== 'number'
    || !Number.isFinite(authorization.expiresAt)
  ) return null;
  return {
    clientId: authorization.clientId,
    clientName: authorization.clientName,
    scopes: [...authorization.scopes],
    expiresAt: authorization.expiresAt,
  };
}

export type DeviceAuthorization = NonNullable<ReturnType<typeof parseDeviceAuthorization>>;
