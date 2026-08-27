import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { asyncHandler } from '../../shared/http/asyncHandler.js';

export type EcosystemInternalRouterDependencies<
  User extends { id: string },
  Subscription,
> = {
  internalGuard: RequestHandler;
  resolveUser: (request: Request) => User | null;
  serializeUser: (user: User) => unknown;
  readSubscription: (userId: string) => Subscription | null;
  emptySubscription: () => Subscription;
  refreshSubscription: (user: User, force: boolean) => Promise<Subscription>;
  setPrivateNoStore: (response: Response) => void;
};

/**
 * Public composition contract for the protected server-to-server ecosystem API.
 *
 * Authentication and persistence remain dependencies of the composition root so
 * this transport module cannot silently widen access or own application state.
 */
export function createEcosystemInternalRouter<
  User extends { id: string },
  Subscription,
>(
  dependencies: EcosystemInternalRouterDependencies<User, Subscription>,
): Router {
  const router = Router();

  router.get('/ecosystem/internal/user', dependencies.internalGuard, (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.resolveUser(request);
    if (!user) return response.status(404).json({ error: 'User not found' });
    return response.json({
      user: dependencies.serializeUser(user),
      subscription: dependencies.readSubscription(user.id) ?? dependencies.emptySubscription(),
    });
  });

  router.get('/ecosystem/internal/subscription', dependencies.internalGuard, asyncHandler(async (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.resolveUser(request);
    if (!user) return response.status(404).json({ error: 'User not found' });
    const force = String(request.query.force ?? '') === '1';
    const subscription = await dependencies.refreshSubscription(user, force);
    return response.json({
      user: dependencies.serializeUser(user),
      subscription,
    });
  }));

  router.post('/ecosystem/internal/subscription', dependencies.internalGuard, asyncHandler(async (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.resolveUser(request);
    if (!user) return response.status(404).json({ error: 'User not found' });
    const subscription = await dependencies.refreshSubscription(user, true);
    return response.json({
      user: dependencies.serializeUser(user),
      subscription,
    });
  }));

  return router;
}
