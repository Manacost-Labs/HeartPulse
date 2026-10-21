import { Router, type Request, type Response } from 'express';
import { linkedSignInProviders } from './model.js';

export type AccountSignInsRouterDependencies<User extends { id: string }> = {
  userAuth: (request: Request) => User | null;
  readStoredProviders: (userId: string) => string[];
  setPrivateNoStore: (response: Response) => void;
};

/**
 * `GET /account/linked-providers`: which sign-in methods the current account
 * already uses, so the account page can offer to link the rest. Read-only;
 * linking itself stays with the providers' own start routes.
 */
export function createAccountSignInsRouter<User extends { id: string }>(dependencies: AccountSignInsRouterDependencies<User>): Router {
  const router = Router();
  router.get('/account/linked-providers', (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!user) return response.status(401).json({ error: 'Требуется вход' });
    try {
      return response.json({ providers: linkedSignInProviders(dependencies.readStoredProviders(user.id)) });
    } catch {
      return response.status(503).json({ error: 'Не удалось загрузить способы входа' });
    }
  });
  return router;
}
