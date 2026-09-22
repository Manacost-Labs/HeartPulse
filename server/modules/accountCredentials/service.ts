import type { CredentialCodeIssuer, CredentialFailure, CredentialRepository } from './model.js';

type Registration = {
  email: string; password: string; name: string; country: string; newsletterOptIn: boolean;
};
type CredentialResult =
  | CredentialFailure
  | { ok: true; payload: Record<string, unknown>; sessionToken?: string };
type CredentialServiceDependencies = {
  repository: CredentialRepository;
  codeIssuer: CredentialCodeIssuer;
  now: () => number;
  userId: (email: string) => string;
  hashPassword: (password: string) => string;
  verifyPassword: (password: string, hash: string) => boolean;
  deliverCode: (email: string, code: string) => Promise<void>;
};

const invalidCredentials = (): CredentialFailure => ({
  ok: false, status: 401, error: 'Неверная почта или пароль',
});
const duplicateAccount = (): CredentialFailure => ({
  ok: false, status: 409, error: 'Пользователь с такой почтой уже есть',
});

/** Network waits never span a database transaction or a writable snapshot of other accounts. */
export function createCredentialService(dependencies: CredentialServiceDependencies) {
  const { repository, codeIssuer } = dependencies;
  const sendCode = async (email: string) => {
    const prepared = codeIssuer.prepare(email, repository.findCode(email));
    if (prepared.ok === false) return prepared;
    try {
      await dependencies.deliverCode(email, prepared.code);
    } catch (error) {
      prepared.cancel();
      throw error;
    }
    return prepared;
  };
  return {
    async register(input: Registration): Promise<CredentialResult> {
      if (repository.findAccount(input.email)) return duplicateAccount();
      const now = new Date(dependencies.now()).toISOString();
      const account = {
        id: dependencies.userId(input.email), email: input.email, name: input.name,
        role: 'user' as const, country: input.country, newsletterOptIn: input.newsletterOptIn,
        avatarInitials: input.name.slice(0, 2).toUpperCase(),
        passwordHash: dependencies.hashPassword(input.password), createdAt: now, updatedAt: now,
      };
      const prepared = await sendCode(input.email);
      if (prepared.ok === false) return prepared;
      if (!repository.register(account, prepared.record)) return duplicateAccount();
      return { ok: true, payload: { success: true, email: input.email, message: 'Аккаунт создан. Код отправлен на почту' } };
    },
    async login(
      input: { email: string; password: string },
      existingSession: () => CredentialResult | null,
    ): Promise<CredentialResult> {
      const account = repository.findAccount(input.email);
      if (!account || account.blockedAt || !dependencies.verifyPassword(input.password, account.passwordHash)) return invalidCredentials();
      const session = existingSession();
      if (session) return session;
      const prepared = await sendCode(input.email);
      if (prepared.ok === false) return prepared;
      if (!repository.saveLoginCode(account, prepared.record)) return invalidCredentials();
      return { ok: true, payload: { success: true, email: input.email, message: 'Код отправлен на почту' } };
    },
  };
}
