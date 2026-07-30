import { Router, type Request, type Response } from 'express';
import {
  ApplicationAuthValidationError,
  type ApplicationAuthManager,
} from './model.js';

type ApplicationAuthRouterDependencies<User extends { id: string }, Subscription> = {
  manager: ApplicationAuthManager;
  userAuth: (request: Request) => User | null;
  userId: (user: User) => string;
  resolveUser: (userId: string) => User | null;
  serializeUser: (user: User) => unknown;
  readSubscription: (userId: string) => Subscription | null;
  emptySubscription: () => Subscription;
  setPrivateNoStore: (response: Response) => void;
};

const apiError = (code: string, message: string) => ({ error: { code, message } });

function bearerToken(request: Request): string {
  const authorization = String(request.headers.authorization ?? '').trim();
  return authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
}

function oauthTokenResponse(result: Extract<ReturnType<ApplicationAuthManager['refresh']>, { ok: true }>) {
  return {
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    token_type: result.tokenType,
    expires_in: result.expiresIn,
    scope: result.scope,
  };
}

/**
 * OAuth device-flow transport plus the minimal authenticated application
 * profile. Existing browser sessions are accepted only by approval endpoints.
 */
export function createApplicationAuthRouter<User extends { id: string }, Subscription>(
  dependencies: ApplicationAuthRouterDependencies<User, Subscription>,
): Router {
  const router = Router();
  const privateResponse = (response: Response) => {
    dependencies.setPrivateNoStore(response);
    response.set('Pragma', 'no-cache');
  };

  router.post('/oauth/device/code', (request, response) => {
    privateResponse(response);
    try {
      const result = dependencies.manager.begin({
        clientId: request.body?.client_id,
        scope: request.body?.scope,
      });
      return response.json({
        device_code: result.deviceCode,
        user_code: result.userCode,
        verification_uri: result.verificationUri,
        verification_uri_complete: result.verificationUriComplete,
        expires_in: result.expiresIn,
        interval: result.interval,
      });
    } catch (error) {
      if (error instanceof ApplicationAuthValidationError) {
        return response.status(400).json({ error: 'invalid_request' });
      }
      return response.status(503).json({ error: 'temporarily_unavailable' });
    }
  });

  router.get('/oauth/device/authorization', (request, response) => {
    privateResponse(response);
    const user = dependencies.userAuth(request);
    if (!user) {
      return response.status(401).json(apiError('LOGIN_REQUIRED', 'Sign in to approve the application'));
    }
    const authorization = dependencies.manager.inspect(request.query.user_code);
    if (!authorization) {
      return response.status(404).json(apiError(
        'AUTHORIZATION_NOT_FOUND',
        'Application authorization is invalid or expired',
      ));
    }
    return response.json({ authorization });
  });

  router.post('/oauth/device/approve', (request, response) => {
    privateResponse(response);
    const user = dependencies.userAuth(request);
    if (!user) {
      return response.status(401).json(apiError('LOGIN_REQUIRED', 'Sign in to approve the application'));
    }
    const decision = String(request.body?.decision ?? '').trim();
    const accepted = decision === 'approve'
      ? dependencies.manager.approve({
        userCode: request.body?.user_code,
        userId: dependencies.userId(user),
      })
      : decision === 'deny'
        ? dependencies.manager.deny({ userCode: request.body?.user_code })
        : false;
    if (!accepted) {
      return response.status(400).json(apiError(
        'INVALID_AUTHORIZATION',
        'Application authorization is invalid or expired',
      ));
    }
    return response.json({ approved: decision === 'approve' });
  });

  router.post('/oauth/token', (request, response) => {
    privateResponse(response);
    const grantType = String(request.body?.grant_type ?? '').trim();
    const result = grantType === 'urn:ietf:params:oauth:grant-type:device_code'
      ? dependencies.manager.exchangeDevice({
        clientId: request.body?.client_id,
        deviceCode: request.body?.device_code,
      })
      : grantType === 'refresh_token'
        ? dependencies.manager.refresh({
          clientId: request.body?.client_id,
          refreshToken: request.body?.refresh_token,
        })
        : { ok: false as const, error: 'unsupported_grant_type' as const };
    if (result.ok === false) return response.status(400).json({ error: result.error });
    return response.json(oauthTokenResponse(result));
  });

  router.post('/oauth/revoke', (request, response) => {
    privateResponse(response);
    dependencies.manager.revoke(request.body?.token);
    return response.json({});
  });

  router.get('/me', (request, response) => {
    privateResponse(response);
    const authenticated = dependencies.manager.authenticate(
      bearerToken(request),
      ['profile.read', 'subscription.read'],
    );
    if (!authenticated) {
      response.set('WWW-Authenticate', 'Bearer realm="Manacost API"');
      return response.status(401).json(apiError('INVALID_ACCESS_TOKEN', 'Access token is invalid or expired'));
    }
    if (authenticated === 'FORBIDDEN') {
      return response.status(403).json(apiError(
        'INSUFFICIENT_SCOPE',
        'Access token does not grant profile and subscription access',
      ));
    }
    const user = dependencies.resolveUser(authenticated.userId);
    if (!user) {
      return response.status(401).json(apiError('INVALID_ACCESS_TOKEN', 'Access token is invalid or expired'));
    }
    return response.json({
      user: dependencies.serializeUser(user),
      subscription: dependencies.readSubscription(user.id) ?? dependencies.emptySubscription(),
    });
  });

  return router;
}
