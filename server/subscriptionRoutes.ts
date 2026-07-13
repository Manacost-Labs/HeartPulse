import { Router, type Request, type Response } from 'express';

export type SubscriptionRouterDependencies<User, Status> = {
  userAuth: (request: Request) => User | null;
  refreshSubscription: (user: User, force: boolean) => Promise<Status>;
  unavailableStatus: (message: string) => Status;
  setPrivateNoStore: (response: Response) => void;
};

export function createSubscriptionRouter<User, Status>(dependencies: SubscriptionRouterDependencies<User, Status>): Router {
  const router = Router();

  const handle = async (request: Request, response: Response, force: boolean) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!user) return response.status(401).json({ error: 'Требуется вход' });
    try {
      return response.json(await dependencies.refreshSubscription(user, force));
    } catch {
      return response.status(503).json(dependencies.unavailableStatus('Не удалось проверить подписку. Попробуйте ещё раз.'));
    }
  };

  router.get('/subscription/status', (request, response) => void handle(request, response, false));
  router.post('/subscription/refresh', (request, response) => void handle(request, response, true));
  return router;
}
