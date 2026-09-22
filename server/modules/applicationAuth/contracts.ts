import type { ApplicationAuthScope } from './scopes.js';

export type ApplicationAuthClient = {
  id: string;
  name: string;
  scopes: ApplicationAuthScope[];
};

export type ApplicationDeviceAuthorization = {
  deviceCodeHash: string;
  userCodeHash: string;
  clientId: string;
  scopes: ApplicationAuthScope[];
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'CONSUMED';
  userId: string | null;
  createdAt: number;
  expiresAt: number;
  intervalSeconds: number;
  lastPolledAt: number | null;
  approvedAt: number | null;
  deniedAt: number | null;
  consumedAt: number | null;
};

export type ApplicationToken = {
  id: string;
  familyId: string;
  clientId: string;
  userId: string;
  scopes: ApplicationAuthScope[];
  accessTokenHash: string;
  refreshTokenHash: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  createdAt: number;
  revokedAt: number | null;
  replacedById: string | null;
};

export type ApplicationAuthRepository = {
  insertDevice: (record: ApplicationDeviceAuthorization) => boolean;
  findDeviceByHash: (hash: string) => ApplicationDeviceAuthorization | null;
  findDeviceByUserCodeHash: (hash: string) => ApplicationDeviceAuthorization | null;
  approveDevice: (hash: string, userId: string, approvedAt: number) => boolean;
  denyDevice: (hash: string, deniedAt: number) => boolean;
  recordDevicePoll: (hash: string, polledAt: number, intervalSeconds: number) => boolean;
  issueDeviceTokens: (
    hash: string,
    token: ApplicationToken,
    consumedAt: number,
  ) => boolean;
  findTokenByAccessHash: (hash: string) => ApplicationToken | null;
  findTokenByRefreshHash: (hash: string) => ApplicationToken | null;
  rotateRefreshToken: (
    oldRefreshHash: string,
    next: ApplicationToken,
    revokedAt: number,
  ) => boolean;
  revokeTokenFamily: (familyId: string, revokedAt: number) => void;
  revokeByRefreshHash: (hash: string, revokedAt: number) => boolean;
};

export type ApplicationAuthManagerDependencies = {
  repository: ApplicationAuthRepository;
  /** Reads current account eligibility; never use a cached token claim. */
  isAccountActive: (userId: string) => boolean;
  clients: ApplicationAuthClient[];
  verificationUri: string;
  now?: () => number;
  randomId?: (prefix: string) => string;
  randomSecret?: (prefix: string) => string;
  randomUserCode?: () => string;
};

export type TokenPair = {
  ok: true;
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string;
};

type TokenError = {
  ok: false;
  error: 'authorization_pending' | 'slow_down' | 'access_denied' | 'expired_token' | 'invalid_grant';
};

export type ApplicationAuthManager = {
  begin: (input: { clientId: unknown; scope: unknown }) => {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    expiresIn: number;
    interval: number;
  };
  approve: (input: { userCode: unknown; userId: string }) => boolean;
  deny: (input: { userCode: unknown }) => boolean;
  inspect: (userCode: unknown) => {
    clientId: string;
    clientName: string;
    scopes: ApplicationAuthScope[];
    expiresAt: number;
  } | null;
  exchangeDevice: (input: { clientId: unknown; deviceCode: unknown }) => TokenPair | TokenError;
  refresh: (input: { clientId: unknown; refreshToken: unknown }) => TokenPair | TokenError;
  authenticate: (
    accessToken: unknown,
    requiredScopes: readonly ApplicationAuthScope[],
  ) => ApplicationToken | null | 'FORBIDDEN';
  revoke: (refreshToken: unknown) => boolean;
};

