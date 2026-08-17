export type PublicProfileRecord = {
  publicProfileId: string;
  name: string;
  avatarInitials: string;
  createdAt: string;
};

/** Untrusted persistence candidate that must be allowlisted before transport. */
export type PublicProfileCandidate = {
  publicProfileId: string;
  name: unknown;
  avatarInitials: unknown;
  createdAt: unknown;
} & Record<string, unknown>;

function normalizedText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function serializePublicProfile(source: PublicProfileCandidate): PublicProfileRecord {
  const name = normalizedText(source.name, 120) || 'Пользователь Манакоста';
  return {
    publicProfileId: source.publicProfileId,
    name,
    avatarInitials: normalizedText(source.avatarInitials, 4)
      || name.slice(0, 2).toUpperCase(),
    createdAt: normalizedText(source.createdAt, 40),
  };
}
