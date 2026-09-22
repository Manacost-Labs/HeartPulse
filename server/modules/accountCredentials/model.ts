export type CredentialAccount = {
  id: string;
  email: string;
  passwordHash: string;
  blockedAt?: string;
};

export type NewCredentialAccount = CredentialAccount & {
  name: string;
  role: 'user';
  country: string;
  newsletterOptIn: boolean;
  avatarInitials: string;
  createdAt: string;
  updatedAt: string;
};

export type CredentialCode = {
  email: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
};

export type CredentialFailure = { ok: false; status: number; error: string };
export type IssuedCredentialCode = {
  ok: true;
  code: string;
  record: CredentialCode;
  cancel: () => void;
};

export type CredentialCodeIssuer = {
  prepare: (email: string, previous: CredentialCode | null) => IssuedCredentialCode | CredentialFailure;
};

export type CredentialRepository = {
  findAccount: (email: string) => CredentialAccount | null;
  findCode: (email: string) => CredentialCode | null;
  register: (account: NewCredentialAccount, code: CredentialCode) => boolean;
  saveLoginCode: (account: CredentialAccount, code: CredentialCode) => boolean;
};
