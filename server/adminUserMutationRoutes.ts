import { Router, type Request, type Response } from 'express';

export type AdminUserMutationUser = {
  id: string;
  email: string;
  role: 'admin' | 'user';
  blockedAt?: string;
  updatedAt: string;
};

export type AdminUserMutationChanges = {
  role?: 'admin' | 'user';
  blocked?: boolean;
  manualAccess?: AdminUserManualAccess;
  /** @deprecated Compatibility with the previous forever-only API. */
  lifetimeAccess?: boolean;
};

export type AdminUserManualAccess = {
  enabled: boolean;
  expiresAt: string | null;
};

export type AdminUserMutationAudit = {
  role?: { from: 'admin' | 'user'; to: 'admin' | 'user' };
  blocked?: { from: boolean; to: boolean };
  manualAccess?: { from: AdminUserManualAccess; to: AdminUserManualAccess };
  lifetimeAccess?: { from: boolean; to: boolean };
};

export type AdminUserMutationStore = {
  transaction: <T>(work: () => T) => T;
  listUsers: () => AdminUserMutationUser[];
  getManualAccess: (userId: string) => AdminUserManualAccess;
  updateUser: (userId: string, values: Pick<AdminUserMutationUser, 'role' | 'blockedAt' | 'updatedAt'>) => void;
  deleteUserSessions: (userId: string, email: string) => void;
  setManualAccess: (userId: string, access: AdminUserManualAccess, actorId: string, timestamp: string) => void;
  recordAudit: (actorId: string, userId: string, details: AdminUserMutationAudit, timestamp: string) => void;
};

export type AdminUserMutationOutcome = {
  user: AdminUserMutationUser;
  manualAccess: AdminUserManualAccess;
  lifetimeAccess: boolean;
};

export type AdminUserMutationRouterDependencies = {
  adminAuth: (request: Request) => { id: string } | null;
  csrfAllowed: (request: Request) => boolean;
  mutateUser: (actorId: string, userId: string, changes: AdminUserMutationChanges) => unknown;
  setPrivateNoStore: (response: Response) => void;
};

export class AdminUserMutationError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
function normalizeRequestedManualAccess(changes: AdminUserMutationChanges): AdminUserManualAccess | undefined {
  if (changes.manualAccess) return changes.manualAccess;
  if (changes.lifetimeAccess !== undefined) {
    return { enabled: changes.lifetimeAccess, expiresAt: null };
  }
  return undefined;
}

export function mutateAdminUser(
  store: AdminUserMutationStore,
  actorId: string,
  userId: string,
  changes: AdminUserMutationChanges,
  timestamp: string,
): AdminUserMutationOutcome {
  return store.transaction(() => {
    const users = store.listUsers();
    const target = users.find(user => user.id === userId);
    if (!target) throw new AdminUserMutationError(404, 'Пользователь не найден');

    const nextRole = changes.role ?? target.role;
    const nextBlocked = changes.blocked ?? Boolean(target.blockedAt);
    if (target.id === actorId && nextBlocked) {
      throw new AdminUserMutationError(400, 'Нельзя заблокировать свой аккаунт');
    }
    if (target.id === actorId && nextRole !== 'admin') {
      throw new AdminUserMutationError(400, 'Нельзя снять администратора с самого себя');
    }
    if (target.role === 'admin' && (nextRole !== 'admin' || nextBlocked)) {
      const remainingAdmins = users.filter(user => user.id !== target.id && user.role === 'admin' && !user.blockedAt);
      if (remainingAdmins.length === 0) {
        throw new AdminUserMutationError(400, 'Нельзя оставить сайт без активного администратора');
      }
    }

    const previousBlocked = Boolean(target.blockedAt);
    const previousManualAccess = store.getManualAccess(target.id);
    const requestedManualAccess = normalizeRequestedManualAccess(changes);
    if (requestedManualAccess?.enabled && requestedManualAccess.expiresAt) {
      const expiryMs = Date.parse(requestedManualAccess.expiresAt);
      if (!Number.isFinite(expiryMs) || expiryMs <= Date.parse(timestamp)) {
        throw new AdminUserMutationError(400, 'Срок полного доступа должен быть в будущем');
      }
    }
    const audit: AdminUserMutationAudit = {};
    if (changes.role !== undefined) audit.role = { from: target.role, to: nextRole };
    if (changes.blocked !== undefined) audit.blocked = { from: previousBlocked, to: nextBlocked };
    if (requestedManualAccess) {
      audit.manualAccess = { from: previousManualAccess, to: requestedManualAccess };
      if (changes.lifetimeAccess !== undefined && changes.manualAccess === undefined) {
        audit.lifetimeAccess = {
          from: previousManualAccess.enabled && previousManualAccess.expiresAt === null,
          to: changes.lifetimeAccess,
        };
      }
    }

    if (changes.role !== undefined || changes.blocked !== undefined) {
      target.role = nextRole;
      target.blockedAt = nextBlocked ? (target.blockedAt || timestamp) : '';
      target.updatedAt = timestamp;
      store.updateUser(target.id, {
        role: target.role,
        blockedAt: target.blockedAt,
        updatedAt: target.updatedAt,
      });
      if (nextBlocked) store.deleteUserSessions(target.id, target.email);
    }
    if (requestedManualAccess) {
      store.setManualAccess(target.id, requestedManualAccess, actorId, timestamp);
    }
    store.recordAudit(actorId, target.id, audit, timestamp);
    return {
      user: { ...target },
      manualAccess: requestedManualAccess ?? previousManualAccess,
      lifetimeAccess: (requestedManualAccess ?? previousManualAccess).enabled
        && (requestedManualAccess ?? previousManualAccess).expiresAt === null,
    };
  });
}

function parseChanges(body: unknown): AdminUserMutationChanges {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AdminUserMutationError(400, 'Некорректные данные пользователя');
  }
  const value = body as Record<string, unknown>;
  const changes: AdminUserMutationChanges = {};
  if (hasOwn(value, 'role')) {
    if (value.role !== 'admin' && value.role !== 'user') {
      throw new AdminUserMutationError(400, 'Некорректная роль');
    }
    changes.role = value.role;
  }
  if (hasOwn(value, 'blocked')) {
    if (typeof value.blocked !== 'boolean') {
      throw new AdminUserMutationError(400, 'Некорректное значение блокировки');
    }
    changes.blocked = value.blocked;
  }
  if (hasOwn(value, 'lifetimeAccess')) {
    if (typeof value.lifetimeAccess !== 'boolean') {
      throw new AdminUserMutationError(400, 'Некорректное значение бессрочного доступа');
    }
    changes.lifetimeAccess = value.lifetimeAccess;
  }
  if (hasOwn(value, 'manualAccess')) {
    if (hasOwn(value, 'lifetimeAccess')) {
      throw new AdminUserMutationError(400, 'Передайте только один тип полного доступа');
    }
    if (!value.manualAccess || typeof value.manualAccess !== 'object' || Array.isArray(value.manualAccess)) {
      throw new AdminUserMutationError(400, 'Некорректные данные полного доступа');
    }
    const manualAccess = value.manualAccess as Record<string, unknown>;
    if (typeof manualAccess.enabled !== 'boolean') {
      throw new AdminUserMutationError(400, 'Некорректное состояние полного доступа');
    }
    const rawExpiry = manualAccess.expiresAt;
    if (rawExpiry !== null && rawExpiry !== undefined && typeof rawExpiry !== 'string') {
      throw new AdminUserMutationError(400, 'Некорректный срок полного доступа');
    }
    const expiresAt = typeof rawExpiry === 'string' ? rawExpiry.trim() : null;
    if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
      throw new AdminUserMutationError(400, 'Некорректный срок полного доступа');
    }
    changes.manualAccess = {
      enabled: manualAccess.enabled,
      expiresAt: manualAccess.enabled ? (expiresAt ? new Date(expiresAt).toISOString() : null) : null,
    };
  }
  if (!Object.keys(changes).length) throw new AdminUserMutationError(400, 'Нет изменений');
  return changes;
}

export function createAdminUserMutationRouter(dependencies: AdminUserMutationRouterDependencies): Router {
  const router = Router();
  router.patch('/admin/users/:userId', (request, response) => {
    dependencies.setPrivateNoStore(response);
    const admin = dependencies.adminAuth(request);
    if (!admin) return response.status(403).json({ error: 'Недостаточно прав' });
    if (!dependencies.csrfAllowed(request)) {
      return response.status(403).json({ error: 'Запрос отклонён: обновите страницу и повторите действие' });
    }
    const userId = String(request.params.userId ?? '').trim().slice(0, 160);
    if (!userId) return response.status(404).json({ error: 'Пользователь не найден' });
    try {
      const changes = parseChanges(request.body);
      return response.json(dependencies.mutateUser(admin.id, userId, changes));
    } catch (error) {
      if (error instanceof AdminUserMutationError) return response.status(error.status).json({ error: error.message });
      return response.status(500).json({ error: 'Не удалось обновить пользователя' });
    }
  });
  return router;
}
